"""
customer.py — Pydantic models สำหรับระบบลูกค้า (CRM Phase 1)
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List


class ContactPerson(BaseModel):
    """ผู้ติดต่อสำหรับลูกค้าประเภท B2B"""
    name: str
    position: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    lineId: Optional[str] = ""


class CreateCustomerRequest(BaseModel):
    name: str
    type: str = "B2C"                    # B2B | B2C
    email: Optional[str] = ""
    phone: Optional[str] = ""
    lineUid: Optional[str] = ""          # LINE User ID (จาก webhook)
    lineDisplayName: Optional[str] = ""
    tags: List[str] = []
    segmentIds: List[str] = []           # กลุ่มลูกค้า
    company: Optional[str] = ""          # สำหรับ B2B
    address: Optional[str] = ""
    note: Optional[str] = ""
    contacts: List[ContactPerson] = []   # ผู้ติดต่อ (B2B)


class UpdateCustomerRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    lineUid: Optional[str] = None
    lineDisplayName: Optional[str] = None
    tags: Optional[List[str]] = None
    segmentIds: Optional[List[str]] = None  # กลุ่มลูกค้า
    company: Optional[str] = None
    address: Optional[str] = None
    note: Optional[str] = None
    contacts: Optional[List[ContactPerson]] = None
    status: Optional[str] = None         # active | inactive


class AddTagRequest(BaseModel):
    tag: str


class CustomerSearchParams(BaseModel):
    q: Optional[str] = ""               # ค้นหาชื่อ/อีเมล/เบอร์
    type: Optional[str] = ""            # B2B | B2C | ""
    tag: Optional[str] = ""             # filter by tag
    status: Optional[str] = "active"
    page: int = 1
    perPage: int = 20
