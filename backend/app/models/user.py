from pydantic import BaseModel
from typing import Optional, Literal

# ─── Roles ────────────────────────────────────────────────────────────────────
Role = Literal[
    "super_admin",
    "it_manager",     "it_support",
    "accounting_manager", "accountant",
    "hr_manager",     "hr",
    "warehouse_manager", "warehouse_staff",
    "production_manager", "production_staff",
    "marketing_manager",  "marketing_staff",
    "engineering_manager","engineering_staff",
    "general_user",
    # legacy — kept for backward compat with existing test accounts
    "admin", "recorder", "viewer",
]

ROLE_LABELS: dict[str, str] = {
    "super_admin":          "สิทธิ์บริหารสูงสุด",
    "it_manager":           "ผู้จัดการด้านไอที",
    "it_support":           "ไอทีซัพพอร์ต",
    "accounting_manager":   "ผู้จัดการฝ่ายบัญชี",
    "accountant":           "ฝ่ายบัญชี",
    "hr_manager":           "ผู้จัดการฝ่ายบุคคล",
    "hr":                   "ฝ่ายบุคคล",
    "warehouse_manager":    "ผู้จัดการคลังสินค้า",
    "warehouse_staff":      "ฝ่ายจัดการคลังสินค้า",
    "production_manager":   "ผู้จัดการฝ่ายผลิต",
    "production_staff":     "ฝ่ายผลิต",
    "marketing_manager":    "ผู้จัดการฝ่ายการตลาด",
    "marketing_staff":      "ฝ่ายการตลาด",
    "engineering_manager":  "ผู้จัดการฝ่ายวิศวกรรม",
    "engineering_staff":    "ฝ่ายวิศวกรรม",
    "general_user":         "ผู้ใช้ทั่วไป",
    "admin":                "ผู้ดูแลระบบ (legacy)",
    "recorder":             "ผู้บันทึกข้อมูล (legacy)",
    "viewer":               "ผู้ตรวจสอบ (legacy)",
}

# roles that can manage users / approve registrations
ADMIN_ROLES = {"super_admin", "it_manager", "it_support", "admin"}


class Permissions(BaseModel):
    labor: bool = False
    raw: bool = False
    chem: bool = False
    repair: bool = False


class UserInDB(BaseModel):
    username: str
    password_hash: str
    name: str
    role: str
    permissions: Permissions
    # new fields
    firstName: str = ""
    lastName: str = ""
    nickname: str = ""
    phone: str = ""
    lineId: str = ""
    jobTitle: str = ""
    status: str = "active"   # active | pending | suspended
    profilePhoto: str = ""   # base64 data URL
    signature: str = ""      # base64 data URL (transparent/white PNG)


class UserOut(BaseModel):
    username: str
    name: str
    role: str
    permissions: Permissions
    firstName: str = ""
    lastName: str = ""
    nickname: str = ""
    phone: str = ""
    lineId: str = ""
    jobTitle: str = ""
    status: str = "active"
    profilePhoto: str = ""
    signature: str = ""


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
    firstName: str = ""
    lastName: str = ""
    nickname: str = ""
    message: str = ""


class RegisterRequest(BaseModel):
    firstName: str
    lastName: str
    nickname: str = ""
    phone: str
    lineId: str = ""
    jobTitle: str = ""
    username: str
    password: str
    confirmPassword: str


class ForgotPasswordRequest(BaseModel):
    phone: str


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str


class ResetPasswordRequest(BaseModel):
    phone: str
    otp: str
    newPassword: str


class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None
    name: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    nickname: Optional[str] = None
    jobTitle: Optional[str] = None
    phone: Optional[str] = None
    lineId: Optional[str] = None
    permissions: Optional[Permissions] = None
