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
import httpx, secrets, logging
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("planeat.auth")

SETTINGS_DOC_ID = "system_settings"
LINE_TOKEN_URL   = "https://api.line.me/oauth2/v2.1/token"
LINE_PROFILE_URL = "https://api.line.me/v2/profile"


class LineCompleteRequest(BaseModel):
    state: str
    phone: str
    firstName: str
    lastName: str
    nickname: str = ""
    jobTitle: str = ""


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

@router.get("/line/standalone-start")
async def line_standalone_start():
    """Redirect ตรงไป LINE OAuth — สำหรับหน้า standalone (browser redirect)"""
    import os
    db = get_db()
    doc = await db.system_settings.find_one({"_id": SETTINGS_DOC_ID})
    if not doc or not doc.get("lineLogin", {}).get("clientId"):
        # ถ้ายังไม่ได้ตั้งค่า LINE Login → redirect ไป standalone แจ้ง error
        public_url = os.environ.get("PUBLIC_URL", "").rstrip("/")
        return RedirectResponse(f"{public_url}/standalone?error=no_line_config")

    config   = doc["lineLogin"]
    state    = secrets.token_urlsafe(16)
    await db.line_login_states.insert_one({
        "_id":       state,
        "mode":      "standalone",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "expiresAt": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    })

    url = (
        f"https://access.line.me/oauth2/v2.1/authorize"
        f"?response_type=code"
        f"&client_id={config['clientId']}"
        f"&redirect_uri={config.get('callbackUrl', '')}"
        f"&state={state}"
        f"&scope=profile%20openid"
    )
    return RedirectResponse(url)


@router.get("/line/standalone-verify")
async def line_standalone_verify(stoken: str):
    """ตรวจ stoken หลัง LINE Login standalone — คืน user + categories"""
    from ..services.category_service import get_categories_for_user
    db = get_db()
    doc = await db.line_standalone_tokens.find_one({"_id": stoken})
    if not doc:
        raise HTTPException(status_code=401, detail="Token ไม่ถูกต้องหรือหมดอายุ")
    expires = datetime.fromisoformat(doc["expiresAt"])
    if datetime.now(timezone.utc) > expires:
        await db.line_standalone_tokens.delete_one({"_id": stoken})
        raise HTTPException(status_code=401, detail="Token หมดอายุ กรุณา Login ใหม่")

    user = await db.users.find_one({"username": doc["username"]}, {"password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้")

    cats = await get_categories_for_user(user["username"], user.get("role", ""), public_only=True)
    return {
        "success":    True,
        "username":   user["username"],
        "name":       user.get("name", ""),
        "firstName":  user.get("firstName", ""),
        "role":       user.get("role", ""),
        "categories": cats,
    }


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


@router.get("/line/callback")
async def line_login_callback(code: str, state: str):
    """รับ code จาก LINE แล้วแลก token → ดึง profile → login/register"""
    import os
    db = get_db()

    # ตรวจ state CSRF
    state_doc = await db.line_login_states.find_one({"_id": state})
    if not state_doc:
        raise HTTPException(status_code=400, detail="Invalid state")
    is_standalone = state_doc.get("mode") == "standalone"
    await db.line_login_states.delete_one({"_id": state})

    public_url = os.environ.get("PUBLIC_URL", "").rstrip("/")

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
                return RedirectResponse(f"{public_url}/standalone?status=pending")
            return {"status": "pending", "message": "บัญชีของคุณรอการอนุมัติจาก IT"}
        if user.get("status") == "suspended":
            if is_standalone:
                return RedirectResponse(f"{public_url}/standalone?status=suspended")
            return {"status": "suspended", "message": "บัญชีถูกระงับ กรุณาติดต่อ IT"}

        # login สำเร็จ
        token = create_token({"sub": user["username"], "role": user["role"]})

        if is_standalone:
            # สร้าง short-lived standalone token (4 ชม.)
            stoken = secrets.token_urlsafe(32)
            await db.line_standalone_tokens.insert_one({
                "_id":       stoken,
                "username":  user["username"],
                "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
            return RedirectResponse(f"{public_url}/standalone?stoken={stoken}")

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
            from urllib.parse import quote
            return RedirectResponse(
                f"{public_url}/standalone?register=true"
                f"&tid={temp_id}"
                f"&name={quote(display_name)}"
                f"&pic={quote(picture_url)}"
            )

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

    # ตรวจเบอร์ซ้ำ
    if await db.users.find_one({"phone": req.phone.strip()}):
        raise HTTPException(status_code=400, detail="เบอร์โทรนี้ถูกใช้ลงทะเบียนแล้ว")

    # ตรวจ lineUid ซ้ำ
    if await db.users.find_one({"lineUid": line_uid}):
        raise HTTPException(status_code=400, detail="LINE นี้ลงทะเบียนแล้ว")

    name = f"{req.firstName.strip()} {req.lastName.strip()}".strip()

    # สร้าง temp username (จะถูกแทนที่ด้วย EMP0001 เมื่อ IT อนุมัติ)
    temp_username = f"pending_{line_uid[:8]}"

    doc = {
        "username":        temp_username,
        "password_hash":   "",
        "name":            name,
        "firstName":       req.firstName.strip(),
        "lastName":        req.lastName.strip(),
        "nickname":        req.nickname.strip(),
        "phone":           req.phone.strip(),
        "email":           "",
        "lineUid":         line_uid,
        "lineDisplayName": temp.get("displayName", ""),
        "linePictureUrl":  temp.get("pictureUrl", ""),
        "jobTitle":        req.jobTitle.strip(),
        "role":            "general_user",
        "status":          "pending",
        "permissions":     {"labor": False, "raw": False, "chem": False, "repair": False},
        "loginType":       "line",
        "createdAt":       datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await db.line_login_temp.delete_one({"_id": req.state})

    # แจ้ง IT/Admin ทุกคนผ่าน LINE ส่วนตัว พร้อมปุ่มอนุมัติ/ปฏิเสธ
    try:
        from ..services.line_notify_service import notify_new_member_to_admins
        await notify_new_member_to_admins(
            username=temp_username,
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
            f"ชื่อ: {name}\n\n"
            f"⏳ บัญชีของคุณอยู่ระหว่างรอการอนุมัติจากทีม IT\n"
            f"ระบบจะแจ้งเตือนพร้อม Username ทาง LINE นี้เมื่ออนุมัติแล้ว"
        )}])
    except Exception as e:
        logger.warning("ส่งแจ้งเตือนผู้สมัครไม่สำเร็จ: %s", e)

    return {"success": True, "message": "สมัครสมาชิกสำเร็จ รอการอนุมัติจาก IT"}
