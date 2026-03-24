from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from ..config import settings
from ..database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


async def authenticate_user(username: str, password: str):
    db = get_db()
    user = await db.users.find_one({"username": username})
    if not user:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return user


async def get_all_users():
    db = get_db()
    cursor = db.users.find({}, {"password_hash": 0})
    users = []
    async for u in cursor:
        users.append({
            "username": u["username"],
            "name": u["name"],
            "role": u["role"],
            "labor":  u.get("permissions", {}).get("labor", False),
            "raw":    u.get("permissions", {}).get("raw", False),
            "chem":   u.get("permissions", {}).get("chem", False),
            "repair": u.get("permissions", {}).get("repair", False),
        })
    return users
