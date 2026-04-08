from datetime import datetime, timedelta, timezone
from typing import Optional
import random
import string
from jose import JWTError, jwt
import bcrypt
from ..config import settings
from ..database import get_db

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

    if data["password"] != data["confirmPassword"]:
        return {"success": False, "message": "รหัสผ่านไม่ตรงกัน"}
    if len(data["password"]) < 6:
        return {"success": False, "message": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"}
    if not data["phone"].strip():
        return {"success": False, "message": "กรุณากรอกเบอร์โทรศัพท์"}

    existing = await db.users.find_one({"username": data["username"]})
    if existing:
        return {"success": False, "message": f"Username '{data['username']}' ถูกใช้แล้ว"}

    phone_existing = await db.users.find_one({"phone": data["phone"].strip()})
    if phone_existing:
        return {"success": False, "message": "เบอร์โทรนี้ถูกใช้ลงทะเบียนแล้ว"}

    name = f"{data['firstName'].strip()} {data['lastName'].strip()}".strip()
    doc = {
        "username":     data["username"].strip(),
        "password_hash": hash_password(data["password"]),
        "name":         name,
        "firstName":    data["firstName"].strip(),
        "lastName":     data["lastName"].strip(),
        "nickname":     data.get("nickname", "").strip(),
        "phone":        data["phone"].strip(),
        "lineId":       data.get("lineId", "").strip(),
        "jobTitle":     data.get("jobTitle", "").strip(),
        "role":         "general_user",
        "status":       "pending",
        "permissions":  {"labor": False, "raw": False, "chem": False, "repair": False},
        "createdAt":    datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"success": True, "message": "สมัครสมาชิกสำเร็จ รอการอนุมัติจากผู้ดูแลระบบ"}


# ─── OTP ──────────────────────────────────────────────────────────────────────

def _gen_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))


async def send_otp(phone: str) -> dict:
    db = get_db()
    user = await db.users.find_one({"phone": phone.strip()})
    if not user:
        return {"success": False, "message": "ไม่พบบัญชีที่ใช้เบอร์นี้"}

    otp = _gen_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)

    await db.otp_tokens.delete_many({"phone": phone.strip()})
    await db.otp_tokens.insert_one({
        "phone":     phone.strip(),
        "otp":       otp,
        "expiresAt": expires.isoformat(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })

    # DEV: log OTP to console (replace with SMS provider in production)
    print(f"[OTP] Phone: {phone}  OTP: {otp}  (expires 5 min)")

    return {"success": True, "message": "ส่ง OTP แล้ว (ดู console สำหรับ DEV)", "dev_otp": otp}


async def verify_otp(phone: str, otp: str) -> dict:
    db = get_db()
    record = await db.otp_tokens.find_one({"phone": phone.strip(), "otp": otp.strip()})
    if not record:
        return {"success": False, "message": "OTP ไม่ถูกต้อง"}

    expires = datetime.fromisoformat(record["expiresAt"])
    if datetime.now(timezone.utc) > expires:
        return {"success": False, "message": "OTP หมดอายุแล้ว กรุณาขอใหม่"}

    return {"success": True, "message": "OTP ถูกต้อง"}


async def reset_password(phone: str, otp: str, new_password: str) -> dict:
    verify = await verify_otp(phone, otp)
    if not verify["success"]:
        return verify

    if len(new_password) < 6:
        return {"success": False, "message": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"}

    db = get_db()
    result = await db.users.update_one(
        {"phone": phone.strip()},
        {"$set": {"password_hash": hash_password(new_password)}}
    )
    if result.modified_count == 0:
        return {"success": False, "message": "ไม่พบบัญชีที่ใช้เบอร์นี้"}

    await db.otp_tokens.delete_many({"phone": phone.strip()})
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
            {"jobTitle":  {"$regex": search, "$options": "i"}},
        ]}

    total = await db.users.count_documents(query)
    skip = (page - 1) * per_page
    cursor = db.users.find(query, {"password_hash": 0, "_id": 0}).skip(skip).limit(per_page).sort("createdAt", -1)
    users = await cursor.to_list(length=per_page)
    return {"success": True, "users": users, "total": total, "page": page, "perPage": per_page}


async def update_user(username: str, data: dict) -> dict:
    db = get_db()
    user = await db.users.find_one({"username": username})
    if not user:
        return {"success": False, "message": "ไม่พบผู้ใช้"}

    fields: dict = {}
    for key in ["role", "status", "name", "firstName", "lastName", "nickname", "jobTitle", "phone", "lineId"]:
        if key in data and data[key] is not None:
            fields[key] = data[key]
    if "permissions" in data and data["permissions"] is not None:
        fields["permissions"] = data["permissions"] if isinstance(data["permissions"], dict) else data["permissions"].dict()

    if not fields:
        return {"success": False, "message": "ไม่มีข้อมูลที่ต้องอัปเดต"}

    await db.users.update_one({"username": username}, {"$set": fields})
    return {"success": True, "message": "อัปเดตผู้ใช้สำเร็จ"}


async def delete_user(username: str) -> dict:
    db = get_db()
    user = await db.users.find_one({"username": username})
    if not user:
        return {"success": False, "message": "ไม่พบผู้ใช้"}
    if username in ("admin", "superadmin"):
        return {"success": False, "message": "ไม่สามารถลบบัญชีนี้ได้"}
    await db.users.delete_one({"username": username})
    return {"success": True, "message": "ลบผู้ใช้สำเร็จ"}
