from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .services.auth_service import decode_token
from .models.user import ADMIN_ROLES

_bearer = HTTPBearer()


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token ไม่ถูกต้องหรือหมดอายุ")
    return payload  # {"sub": username, "role": role, ...}


def require_admin(current: dict = Depends(get_current_user)) -> dict:
    if current.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="ไม่มีสิทธิ์จัดการผู้ใช้")
    return current
