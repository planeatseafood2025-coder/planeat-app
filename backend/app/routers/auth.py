from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from ..models.user import (
    LoginRequest, LoginResponse,
    RegisterRequest, RequestRegisterOTPRequest, ForgotPasswordRequest,
    VerifyOTPRequest, ResetPasswordRequest,
)
from ..services.auth_service import (
    authenticate_user, create_token,
    register_user, send_otp, verify_otp, reset_password,
)
from ..deps import get_current_user
from ..database import get_db
import httpx, secrets, logging, os
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from typing import Optional
from urllib.parse import quote

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("planeat.auth")

SETTINGS_DOC_ID = "system_settings"
LINE_TOKEN_URL   = "https://api.line.me/oauth2/v2.1/token"
LINE_PROFILE_URL = "https://api.line.me/v2/profile"
FRONTEND_URL     = os.environ.get("PUBLIC_URL", "http://localhost:3001").rstrip("/")


class LineCompleteRequest(BaseModel):
    state: str
    phone: str
    firstName: str
    lastName: str = ""
    nickname: str = ""
    jobTitle: str = ""
    username: str = ""


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    user = await authenticate_user(req.username, req.password)
    if user == "pending":
        raise HTTPException(status_code=403, detail="บัญชีนี้รอการอนุมัติจากผู้ดูแลระบบ")
    if user == "suspended":
        raise HTTPException(status_code=403, detail="บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อ IT")
    if not user:
        raise HTTPException(status_code=401, detail="Username หรือ Password ไม่ถูกต้อง")

    token = create_token({"sub": user["username"], "role": user["role"]})
    perms = user.get("permissions", {})
    return LoginResponse(
        success=True,
        token=token,
        username=user["username"],
        name=user["name"],
        role=user["role"],
        permissions=perms,
        firstName=user.get("firstName", ""),
        lastName=user.get("lastName", ""),
        nickname=user.get("nickname", ""),
    )


@router.post("/register")
async def register(req: RegisterRequest):
    result = await register_user(req.dict())
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/request-register-otp")
async def request_register_otp_endpoint(req: RequestRegisterOTPRequest):
    from ..services.auth_service import request_register_otp
    result = await request_register_otp(req.email, req.firstName)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result



@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    result = await send_otp(req.username)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])
    return result


@router.post("/verify-otp")
async def verify_otp_endpoint(req: VerifyOTPRequest):
    result = await verify_otp(req.username, req.otp)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/reset-password")
async def reset_password_endpoint(req: ResetPasswordRequest):
    result = await reset_password(req.username, req.otp, req.newPassword)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/me")
async def me(current: dict = Depends(get_current_user)):
    return {"success": True, "username": current["sub"], "role": current["role"]}


# ─── LINE Login OAuth 2.0 ──────────────────────────────────────────────────────

@router.get("/line/login")
async def line_login_start():
    """สร้าง URL redirect ไป LINE Login"""
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    if not doc or not doc.get("lineLogin", {}).get("clientId"):
        raise HTTPException(status_code=400, detail="ยังไม่ได้ตั้งค่า LINE Login — กรุณาติดต่อ Admin")

    config = doc["lineLogin"]
    state = secrets.token_urlsafe(16)

    # เก็บ state ไว้ตรวจสอบ CSRF
    await db.line_login_states.insert_one({
        "_id": state,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    })

    callback_url = config.get("callbackUrl", "")
    client_id    = config.get("clientId", "")

    url = (
        f"https://access.line.me/oauth2/v2.1/authorize"
        f"?response_type=code"
        f"&client_id={client_id}"
        f"&redirect_uri={callback_url}"
        f"&state={state}"
        f"&scope=profile%20openid"
    )
    return {"url": url}


@router.get("/line/standalone-start")
async def line_standalone_start():
    """เริ่ม LINE Login สำหรับ standalone form (redirect browser โดยตรง)"""
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    if not doc or not doc.get("lineLogin", {}).get("clientId"):
        return RedirectResponse(url=f"{FRONTEND_URL}/standalone?error=no_config")

    config    = doc["lineLogin"]
    state     = secrets.token_urlsafe(16)

    await db.line_login_states.insert_one({
        "_id":        state,
        "standalone": True,
        "createdAt":  datetime.now(timezone.utc).isoformat(),
        "expiresAt":  (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    })

    callback_url = config.get("callbackUrl", "")
    client_id    = config.get("clientId", "")

    url = (
        f"https://access.line.me/oauth2/v2.1/authorize"
        f"?response_type=code"
        f"&client_id={client_id}"
        f"&redirect_uri={callback_url}"
        f"&state={state}"
        f"&scope=profile%20openid"
    )
    return RedirectResponse(url=url)


@router.get("/line/standalone-verify")
async def line_standalone_verify(stoken: str):
    """ตรวจ stoken และคืน user data + categories สำหรับ standalone form"""
    db = get_db()
    doc = await db.line_standalone_tokens.find_one({"_id": stoken})
    if not doc:
        return {"success": False, "reason": "token_not_found"}

    expires = datetime.fromisoformat(doc["expiresAt"])
    if datetime.now(timezone.utc) > expires:
        await db.line_standalone_tokens.delete_one({"_id": stoken})
        return {"success": False, "reason": "expired"}

    user = await db.users.find_one({"username": doc["username"]})
    if not user or user.get("status") != "active":
        return {"success": False, "reason": "not_active"}

    # ดึง categories ที่ user มีสิทธิ์
    username = user["username"]
    cat_cursor = db.expense_categories.find({"isActive": True})
    all_cats = await cat_cursor.to_list(None)
    allowed = []
    for cat in all_cats:
        pub = cat.get("publicAccess", False)
        au  = cat.get("allowedUsers", [])
        if pub or username in au:
            allowed.append({
                "id":      str(cat["_id"]),
                "name":    cat.get("name", ""),
                "icon":    cat.get("icon", "receipt"),
                "color":   cat.get("color", "#64748b"),
                "formula": cat.get("formula", "fixed"),
                "fields":  cat.get("fields", []),
            })

    return {
        "success":     True,
        "username":    username,
        "name":        user.get("name", ""),
        "firstName":   user.get("firstName", ""),
        "displayName": user.get("lineDisplayName") or user.get("firstName") or user.get("name", ""),
        "lineUid":     user.get("lineUid", ""),
        "categories":  allowed,
    }


@router.get("/line/callback")
async def line_login_callback(code: str, state: str):
    """รับ code จาก LINE แล้วแลก token → ดึง profile → login/register"""
    db = get_db()

    # ตรวจ state CSRF
    state_doc = await db.line_login_states.find_one({"_id": state})
    if not state_doc:
        raise HTTPException(status_code=400, detail="Invalid state")
    is_standalone = state_doc.get("standalone", False)
    await db.line_login_states.delete_one({"_id": state})

    # ดึง config
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    config = (doc or {}).get("lineLogin", {})
    client_id     = config.get("clientId", "")
    client_secret = config.get("clientSecret", "")
    callback_url  = config.get("callbackUrl", "")

    # แลก code → access token
    async with httpx.AsyncClient(timeout=10) as client:
        token_res = await client.post(LINE_TOKEN_URL, data={
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  callback_url,
            "client_id":     client_id,
            "client_secret": client_secret,
        })
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="แลก token ไม่สำเร็จ")
        token_data = token_res.json()

        # ดึง profile
        profile_res = await client.get(LINE_PROFILE_URL, headers={
            "Authorization": f"Bearer {token_data['access_token']}"
        })
        if profile_res.status_code != 200:
            raise HTTPException(status_code=400, detail="ดึง profile ไม่สำเร็จ")
        profile = profile_res.json()

    line_uid     = profile.get("userId", "")
    display_name = profile.get("displayName", "")
    picture_url  = profile.get("pictureUrl", "")

    # ตรวจว่ามี user นี้ในระบบแล้วไหม
    user = await db.users.find_one({"lineUid": line_uid})

    if user:
        # มีแล้ว — ตรวจสถานะ
        if user.get("status") == "pending":
            if is_standalone:
                return {"status": "standalone_redirect", "redirectUrl": f"{FRONTEND_URL}/standalone?status=pending"}
            return {"status": "pending", "message": "บัญชีของคุณรอการอนุมัติจาก IT"}
        if user.get("status") == "suspended":
            if is_standalone:
                return {"status": "standalone_redirect", "redirectUrl": f"{FRONTEND_URL}/standalone?status=suspended"}
            return {"status": "suspended", "message": "บัญชีถูกระงับ กรุณาติดต่อ IT"}

        if is_standalone:
            stoken = secrets.token_urlsafe(24)
            await db.line_standalone_tokens.insert_one({
                "_id":       stoken,
                "username":  user["username"],
                "lineUid":   line_uid,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
            })
            return {"status": "standalone_redirect", "redirectUrl": f"{FRONTEND_URL}/standalone?stoken={stoken}"}

        # login สำเร็จ (regular)
        token = create_token({"sub": user["username"], "role": user["role"]})
        return {
            "status":      "success",
            "token":       token,
            "username":    user["username"],
            "name":        user["name"],
            "role":        user["role"],
            "permissions": user.get("permissions", {}),
        }
    else:
        # ไม่มีในระบบ → ต้องกรอกข้อมูลเพิ่มเติม
        temp_id = secrets.token_urlsafe(24)
        await db.line_login_temp.insert_one({
            "_id":         temp_id,
            "lineUid":     line_uid,
            "displayName": display_name,
            "pictureUrl":  picture_url,
            "expiresAt":   (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
            "createdAt":   datetime.now(timezone.utc).isoformat(),
        })
        if is_standalone:
            return {
                "status": "standalone_redirect",
                "redirectUrl": f"{FRONTEND_URL}/standalone?register=true&tid={temp_id}"
                               f"&name={quote(display_name)}&pic={quote(picture_url)}",
            }
        return {
            "status":      "new_user",
            "tempId":      temp_id,
            "displayName": display_name,
            "pictureUrl":  picture_url,
            "message":     "กรุณากรอกข้อมูลเพิ่มเติมเพื่อสมัครสมาชิก",
        }


@router.post("/line/complete")
async def line_login_complete(req: LineCompleteRequest):
    """กรอกข้อมูลเพิ่มเติมหลัง LINE Login → สร้าง user pending"""
    db = get_db()

    # ดึง temp session
    temp = await db.line_login_temp.find_one({"_id": req.state})
    if not temp:
        raise HTTPException(status_code=400, detail="Session หมดอายุ กรุณา Login ด้วย LINE ใหม่")

    expires = datetime.fromisoformat(temp["expiresAt"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="Session หมดอายุ กรุณา Login ด้วย LINE ใหม่")

    line_uid = temp["lineUid"]

    # auto-gen username
    import re as _re
    if req.username.strip():
        # กรอกเอง → ทำให้เป็น ASCII-safe
        base_clean = _re.sub(r'[^a-zA-Z0-9]', '', req.username.strip()) or "EMP"
        auto_username = base_clean
        suffix = 1
        while await db.users.find_one({"username": auto_username}):
            auto_username = f"{base_clean}{suffix}"
            suffix += 1
    else:
        # ไม่กรอก → EMP + เลข 4 หลัก (EMP0001, EMP0002, ...)
        existing = await db.users.find(
            {"username": {"$regex": r"^EMP\d{4}$"}},
            {"username": 1, "_id": 0}
        ).to_list(None)
        max_num = 0
        for u in existing:
            try:
                n = int(u["username"][3:])
                if n > max_num:
                    max_num = n
            except ValueError:
                continue
        auto_username = f"EMP{max_num + 1:04d}"

    # ตรวจเบอร์ซ้ำ
    if await db.users.find_one({"phone": req.phone.strip()}):
        raise HTTPException(status_code=400, detail="เบอร์โทรนี้ถูกใช้ลงทะเบียนแล้ว")

    name = f"{req.firstName.strip()} {req.lastName.strip()}".strip()
    doc = {
        "username":      auto_username,
        "password_hash": "",
        "name":          name,
        "firstName":     req.firstName.strip(),
        "lastName":      req.lastName.strip(),
        "nickname":      req.nickname.strip(),
        "phone":         req.phone.strip(),
        "email":         "",
        "lineUid":       line_uid,
        "lineDisplayName": temp.get("displayName", ""),
        "linePictureUrl":  temp.get("pictureUrl", ""),
        "jobTitle":      req.jobTitle.strip(),
        "role":          "general_user",
        "status":        "pending",
        "permissions":   {"labor": False, "raw": False, "chem": False, "repair": False},
        "loginType":     "line",
        "createdAt":     datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await db.line_login_temp.delete_one({"_id": req.state})

    # แจ้ง IT/Admin ทุกคนผ่าน LINE ส่วนตัว พร้อมปุ่มอนุมัติ/ปฏิเสธ
    try:
        from ..services.line_notify_service import notify_new_member_to_admins
        await notify_new_member_to_admins(
            username=auto_username,
            name=name,
            phone=req.phone.strip(),
            line_uid=line_uid,
            picture_url=temp.get("pictureUrl", ""),
        )
    except Exception as e:
        logger.warning("ส่งแจ้งเตือน IT ไม่สำเร็จ: %s", e)

    # แจ้งผู้สมัครทาง LINE ว่ารอการอนุมัติ
    try:
        from ..services.line_notify_service import _push_to_uid
        await _push_to_uid(line_uid, [{"type": "text", "text": (
            f"✅ สมัครสมาชิกสำเร็จแล้ว!\n"
            f"ชื่อ: {name}\n"
            f"Username: {auto_username}\n\n"
            f"⏳ บัญชีของคุณอยู่ระหว่างรอการอนุมัติจากทีม IT\n"
            f"ระบบจะแจ้งเตือนทาง LINE นี้เมื่ออนุมัติแล้ว"
        )}])
    except Exception as e:
        logger.warning("ส่งแจ้งเตือนผู้สมัครไม่สำเร็จ: %s", e)

    return {"success": True, "message": "สมัครสมาชิกสำเร็จ รอการอนุมัติจาก IT"}
