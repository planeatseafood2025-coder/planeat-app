from datetime import datetime, timedelta, timezone
from typing import Optional
import random
import string
from jose import JWTError, jwt
import bcrypt
from ..config import settings
from ..database import get_db
from .email_service import send_otp_email

# ─── Password helpers ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


# ─── JWT ──────────────────────────────────────────────────────────────────────

def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


# ─── Auth ─────────────────────────────────────────────────────────────────────

async def authenticate_user(username: str, password: str):
    db = get_db()
    user = await db.users.find_one({"username": username})
    if not user:
        return None
    if user.get("status") == "pending":
        return "pending"
    if user.get("status") == "suspended":
        return "suspended"
    if not verify_password(password, user["password_hash"]):
        return None
    return user


# ─── Register ─────────────────────────────────────────────────────────────────

async def register_user(data: dict) -> dict:
    db = get_db()

    if data.get("password") != data.get("confirmPassword"):
        return {"success": False, "message": "รหัสผ่านไม่ตรงกัน"}
    if len(data.get("password", "")) < 6:
        return {"success": False, "message": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"}
    if not data.get("phone", "").strip():
        return {"success": False, "message": "กรุณากรอกเบอร์โทรศัพท์"}
    if not data.get("email", "").strip():
        return {"success": False, "message": "กรุณากรอกอีเมล"}

    email = data["email"].strip()
    line_uid = ""

    # ─── LINE OTP session verification ────────────────────────────────────────
    session_id = data.get("sessionId", "").strip()
    if session_id:
        session = await db.registration_sessions.find_one({"_id": session_id})
        if not session:
            return {"success": False, "message": "ไม่พบ session กรุณาขอรหัสใหม่"}
        if session.get("status") != "verified":
            return {"success": False, "message": "ยังไม่ได้ยืนยัน OTP ผ่าน LINE"}
        expires = datetime.fromisoformat(session["expiresAt"])
        if datetime.now(timezone.utc) > expires:
            return {"success": False, "message": "Session หมดอายุแล้ว กรุณาขอรหัสใหม่"}
        if session.get("email") != email:
            return {"success": False, "message": "อีเมลไม่ตรงกับ session"}
        line_uid = session.get("lineUid", "")

    # ─── Email OTP verification (fallback) ────────────────────────────────────
    else:
        otp = data.get("otp", "").strip()
        if not otp:
            return {"success": False, "message": "กรุณากรอก OTP"}
        record = await db.otp_tokens.find_one({"email": email, "otp": otp})
        if not record:
            return {"success": False, "message": "OTP ไม่ถูกต้อง"}
        expires = datetime.fromisoformat(record["expiresAt"])
        if datetime.now(timezone.utc) > expires:
            return {"success": False, "message": "OTP หมดอายุแล้ว กรุณาขอใหม่"}

    existing = await db.users.find_one({"username": data["username"]})
    if existing:
        return {"success": False, "message": f"Username '{data['username']}' ถูกใช้แล้ว"}

    phone_existing = await db.users.find_one({"phone": data["phone"].strip()})
    if phone_existing:
        return {"success": False, "message": "เบอร์โทรนี้ถูกใช้ลงทะเบียนแล้ว"}

    email_existing = await db.users.find_one({"email": email})
    if email_existing:
        return {"success": False, "message": "อีเมลนี้ถูกใช้ลงทะเบียนแล้ว"}

    name = f"{data['firstName'].strip()} {data['lastName'].strip()}".strip()
    doc = {
        "username":     data["username"].strip(),
        "password_hash": hash_password(data["password"]),
        "name":         name,
        "firstName":    data["firstName"].strip(),
        "lastName":     data["lastName"].strip(),
        "nickname":     data.get("nickname", "").strip(),
        "phone":        data["phone"].strip(),
        "email":        email,
        "lineId":       data.get("lineId", "").strip(),
        "lineUid":      line_uid,
        "jobTitle":     data.get("jobTitle", "").strip(),
        "role":         "general_user",
        "status":       "pending",
        "permissions":  {"labor": False, "raw": False, "chem": False, "repair": False},
        "createdAt":    datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)

    # Cleanup
    if session_id:
        await db.registration_sessions.delete_many({"_id": session_id})
    else:
        await db.otp_tokens.delete_many({"email": email})

    return {"success": True, "message": "สมัครสมาชิกสำเร็จ รอการอนุมัติจากผู้ดูแลระบบ"}


# ─── OTP ──────────────────────────────────────────────────────────────────────

def _gen_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))


async def request_register_otp(email: str, first_name: str) -> dict:
    db = get_db()
    existing = await db.users.find_one({"email": email.strip()})
    if existing:
        return {"success": False, "message": "อีเมลนี้ถูกใช้ลงทะเบียนแล้ว"}

    otp = _gen_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)

    await db.otp_tokens.delete_many({"email": email.strip()})
    await db.otp_tokens.insert_one({
        "email":     email.strip(),
        "otp":       otp,
        "expiresAt": expires.isoformat(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })

    # Send HTML OTP email
    await send_otp_email(to_email=email.strip(), otp=otp, name=first_name.strip(), is_register=True)
    return {"success": True, "message": f"ส่ง OTP ไปยังอีเมลของคุณแล้ว"}



async def send_otp(username: str) -> dict:
    db = get_db()
    # Find user by username
    user = await db.users.find_one({"username": username.strip()})
    if not user:
        # allow finding by firstName if username didn't match
        user = await db.users.find_one({"firstName": username.strip()})
        if not user:
            return {"success": False, "message": "ไม่พบบัญชีผู้ใช้งานนี้"}

    user_email = user.get("email")
    if not user_email:
        return {"success": False, "message": "บัญชีนี้ไม่ได้ผูกอีเมลไว้ ไม่สามารถส่งคำขอเปลี่ยนรหัสผ่านได้"}

    otp = _gen_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)

    await db.otp_tokens.delete_many({"username": user["username"]})
    await db.otp_tokens.insert_one({
        "username":  user["username"],
        "otp":       otp,
        "expiresAt": expires.isoformat(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })

    # Send HTML OTP email
    await send_otp_email(to_email=user_email, otp=otp, name=user.get("firstName", ""), is_register=False)

    return {"success": True, "message": "ส่ง OTP ไปที่อีเมลของคุณแล้ว"}


async def verify_otp(username: str, otp: str) -> dict:
    db = get_db()
    user = await db.users.find_one({"username": username.strip()})
    if not user:
        user = await db.users.find_one({"firstName": username.strip()})
    if not user:
        return {"success": False, "message": "ไม่พบบัญชีผู้ใช้งานนี้"}

    actual_username = user["username"]

    record = await db.otp_tokens.find_one({"username": actual_username, "otp": otp.strip()})
    if not record:
        return {"success": False, "message": "OTP ไม่ถูกต้อง"}

    expires = datetime.fromisoformat(record["expiresAt"])
    if datetime.now(timezone.utc) > expires:
        return {"success": False, "message": "OTP หมดอายุแล้ว กรุณาขอใหม่"}

    return {"success": True, "message": "OTP ถูกต้อง"}


async def reset_password(username: str, otp: str, new_password: str) -> dict:
    verify = await verify_otp(username, otp)
    if not verify["success"]:
        return verify

    if len(new_password) < 6:
        return {"success": False, "message": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"}

    db = get_db()
    user = await db.users.find_one({"username": username.strip()})
    if not user:
        user = await db.users.find_one({"firstName": username.strip()})
    actual_username = user["username"]

    result = await db.users.update_one(
        {"username": actual_username},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    if result.modified_count == 0:
        return {"success": False, "message": "ระบบไม่สามารถเปลี่ยนรหัสผ่านได้"}

    await db.otp_tokens.delete_many({"username": actual_username})
    return {"success": True, "message": "เปลี่ยนรหัสผ่านสำเร็จ"}


# ─── User management ──────────────────────────────────────────────────────────

async def get_all_users(search: str = "", page: int = 1, per_page: int = 20) -> dict:
    db = get_db()
    query: dict = {}
    if search:
        query = {"$or": [
            {"username":  {"$regex": search, "$options": "i"}},
            {"name":      {"$regex": search, "$options": "i"}},
            {"firstName": {"$regex": search, "$options": "i"}},
            {"lastName":  {"$regex": search, "$options": "i"}},
            {"phone":     {"$regex": search, "$options": "i"}},
            {"email":     {"$regex": search, "$options": "i"}},
            {"jobTitle":  {"$regex": search, "$options": "i"}},
        ]}

    total = await db.users.count_documents(query)
    skip = (page - 1) * per_page
    cursor = db.users.find(query, {"password_hash": 0, "_id": 0}).skip(skip).limit(per_page).sort("createdAt", -1)
    users = await cursor.to_list(length=per_page)
    return {"success": True, "users": users, "total": total, "page": page, "perPage": per_page}


async def generate_emp_username(db) -> str:
    """สร้าง username รูปแบบ EMP0001, EMP0002, ..."""
    # หา EMP ล่าสุดในระบบ
    cursor = db.users.find(
        {"username": {"$regex": "^EMP\\d+$"}},
        {"username": 1}
    ).sort("username", -1).limit(1)
    last = await cursor.to_list(1)
    if last:
        try:
            last_num = int(last[0]["username"][3:])
            next_num = last_num + 1
        except ValueError:
            next_num = 1
    else:
        next_num = 1
    return f"EMP{next_num:04d}"


async def update_user(username: str, data: dict) -> dict:
    db = get_db()
    user = await db.users.find_one({"username": username})
    if not user:
        return {"success": False, "message": "ไม่พบผู้ใช้"}

    fields: dict = {}
    for key in ["role", "roles", "status", "name", "firstName", "lastName", "nickname", "jobTitle", "phone", "email", "lineId", "approvedBy", "approvedAt", "rejectedBy", "rejectedAt"]:
        if key in data and data[key] is not None:
            fields[key] = data[key]
    if "permissions" in data and data["permissions"] is not None:
        fields["permissions"] = data["permissions"] if isinstance(data["permissions"], dict) else data["permissions"].dict()
    if "password" in data and data["password"]:
        fields["password_hash"] = hash_password(data["password"])

    if not fields:
        return {"success": False, "message": "ไม่มีข้อมูลที่ต้องอัปเดต"}

    # ถ้า status เปลี่ยนเป็น active และ username ยังเป็น temp (pending_xxx) → สร้าง EMP username
    new_status = fields.get("status", user.get("status", ""))
    is_temp_username = user.get("username", "").startswith("pending_")
    if new_status == "active" and is_temp_username:
        emp_username = await generate_emp_username(db)
        fields["username"] = emp_username
        # แจ้งผู้ใช้ทาง LINE
        line_uid = user.get("lineUid", "")
        if line_uid:
            try:
                from .line_notify_service import _push_to_uid
                await _push_to_uid(line_uid, [{"type": "text", "text": (
                    f"🎉 บัญชีของคุณได้รับการอนุมัติแล้ว!\n"
                    f"Username: {emp_username}\n\n"
                    f"กรุณาเข้าสู่ระบบด้วย LINE ได้เลยครับ/ค่ะ"
                )}])
            except Exception as e:
                pass

    await db.users.update_one({"username": username}, {"$set": fields})

    # คืน username ใหม่ถ้ามีการเปลี่ยน
    new_username = fields.get("username", username)
    return {"success": True, "message": "อัปเดตผู้ใช้สำเร็จ", "newUsername": new_username}


async def delete_user(username: str) -> dict:
    db = get_db()
    user = await db.users.find_one({"username": username})
    if not user:
        return {"success": False, "message": "ไม่พบผู้ใช้"}
    if username in ("admin", "superadmin"):
        return {"success": False, "message": "ไม่สามารถลบบัญชีนี้ได้"}
    await db.users.delete_one({"username": username})
    return {"success": True, "message": "ลบผู้ใช้สำเร็จ"}


async def ensure_default_admin() -> None:
    db = get_db()
    existing = await db.users.find_one({"username": "admin"})
    if existing:
        return
    doc = {
        "username":      "admin",
        "password_hash": hash_password("admin1234"),
        "name":          "Administrator",
        "firstName":     "Administrator",
        "lastName":      "",
        "phone":         "0000000000",
        "email":         "",
        "lineUid":       "",
        "jobTitle":      "System Admin",
        "role":          "admin",
        "status":        "approved",
        "permissions":   {"labor": True, "raw": True, "chem": True, "repair": True},
        "createdAt":     datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    import logging
    logging.getLogger("planeat.api").info("✅ Default admin user created (username: admin)")
