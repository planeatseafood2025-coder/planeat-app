from fastapi import APIRouter, HTTPException
from ..models.user import LoginRequest, LoginResponse
from ..services.auth_service import authenticate_user, create_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    user = await authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Username หรือ Password ไม่ถูกต้อง")

    token = create_token({
        "sub": user["username"],
        "role": user["role"],
    })

    perms = user.get("permissions", {})
    return LoginResponse(
        success=True,
        token=token,
        username=user["username"],
        name=user["name"],
        role=user["role"],
        permissions=perms,
    )
