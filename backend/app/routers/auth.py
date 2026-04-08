from fastapi import APIRouter, HTTPException, Depends
from ..models.user import (
    LoginRequest, LoginResponse,
    RegisterRequest, ForgotPasswordRequest,
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


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    result = await send_otp(req.phone)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["message"])
    return result


@router.post("/verify-otp")
async def verify_otp_endpoint(req: VerifyOTPRequest):
    result = await verify_otp(req.phone, req.otp)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/reset-password")
async def reset_password_endpoint(req: ResetPasswordRequest):
    result = await reset_password(req.phone, req.otp, req.newPassword)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/me")
async def me(current: dict = Depends(get_current_user)):
    return {"success": True, "username": current["sub"], "role": current["role"]}
