from pydantic import BaseModel
from typing import Literal

Role = Literal["admin", "accountant", "recorder", "viewer"]


class Permissions(BaseModel):
    labor: bool = False
    raw: bool = False
    chem: bool = False
    repair: bool = False


class UserInDB(BaseModel):
    username: str
    password_hash: str
    name: str
    role: Role
    permissions: Permissions


class UserOut(BaseModel):
    username: str
    name: str
    role: Role
    permissions: Permissions


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    token: str = ""
    username: str = ""
    name: str = ""
    role: str = ""
    permissions: Permissions = Permissions()
    message: str = ""
