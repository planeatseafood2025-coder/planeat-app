from pydantic import BaseModel
from typing import Optional


class CreateInventoryItem(BaseModel):
    code: str                      # รหัสสินค้า
    name: str                      # ชื่อสินค้า
    category: str                  # หมวดหมู่
    unit: str                      # หน่วยนับ
    currentStock: float = 0        # จำนวนคงเหลือเริ่มต้น
    minStock: float = 0            # จุดสั่งซื้อ (reorder point)
    unitCost: float = 0            # ราคาต่อหน่วย
    location: str = ""             # สถานที่เก็บ
    note: str = ""
    username: str = ""             # ผู้บันทึก


class UpdateInventoryItem(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    minStock: Optional[float] = None
    unitCost: Optional[float] = None
    location: Optional[str] = None
    note: Optional[str] = None
    username: str = ""


class CreateTransaction(BaseModel):
    itemId: str
    type: str          # receive | issue | adjust
    quantity: float    # จำนวน (บวกเสมอ — direction ขึ้นกับ type)
    unitCost: float = 0
    reference: str = ""   # เลขที่เอกสาร
    note: str = ""
    username: str = ""


class UpdateTransaction(BaseModel):
    type: Optional[str] = None      # receive | issue | adjust
    quantity: Optional[float] = None
    unitCost: Optional[float] = None
    reference: Optional[str] = None
    note: Optional[str] = None
    username: str = ""


class CreateWarehouse(BaseModel):
    name: str
    pin: str = "1234"
    color: str = "#1e3a8a"
    bg: str = "#dbeafe"
    icon: str = "warehouse"
    desc: str = ""


class UpdateWarehouse(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    bg: Optional[str] = None
    icon: Optional[str] = None
    desc: Optional[str] = None
    imageUrl: Optional[str] = None
