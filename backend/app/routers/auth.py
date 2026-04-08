from fastapi import APIRouter, HTTPException, Depends
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

router = APIRouter(prefix="/api/auth", tags=["auth"])


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


@router.post("/request-line-otp")
async def request_line_otp_endpoint(req: RequestRegisterOTPRequest):
    """สร้าง OTP สำหรับยืนยันผ่าน LINE OA — คืน sessionId + OTP code"""
    from ..services.auth_service import request_line_otp
    result = await request_line_otp(req.email, req.firstName)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/line-session/{session_id}")
async def check_line_session(session_id: str):
    """ตรวจสอบสถานะ LINE OTP session (ใช้โดย frontend polling fallback)"""
    from ..database import get_db
    db = get_db()
    session = await db.registration_sessions.find_one({"_id": session_id}, {"otp": 0})
    if not session:
        raise HTTPException(status_code=404, detail="ไม่พบ session")
    return {"status": session.get("status", "pending"), "lineUid": session.get("lineUid", "")}


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
