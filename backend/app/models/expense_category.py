from pydantic import BaseModel, Field
from typing import Optional, List, Literal

# ─── Field types ─────────────────────────────────────────────────────────────
FieldType = Literal["number", "text", "select"]
CalcRole  = Literal["qty", "price", "addend", "fixed", "note", "none"]

class CategoryField(BaseModel):
    fieldId:     str
    label:       str
    type:        FieldType   = "number"
    unit:        str         = ""
    placeholder: str         = ""
    required:    bool        = True
    calcRole:    CalcRole    = "none"
    options:     List[str]   = []   # สำหรับ type=select

class CreateCategoryRequest(BaseModel):
    name:         str
    color:        str   = "#3b82f6"
    icon:         str   = "receipt_long"
    fields:       List[CategoryField] = []
    # formula เก็บ string เช่น "qty*price+addend"
    formula:      str   = "fixed"
    allowedRoles: List[str] = []    # ถ้าว่าง = ทุก role
    allowedUsers: List[str] = []    # username เพิ่มเติม
    order:        int   = 999

class UpdateCategoryRequest(BaseModel):
    name:         Optional[str]       = None
    color:        Optional[str]       = None
    icon:         Optional[str]       = None
    fields:       Optional[List[CategoryField]] = None
    formula:      Optional[str]       = None
    allowedRoles: Optional[List[str]] = None
    allowedUsers: Optional[List[str]] = None
    order:        Optional[int]       = None
    isActive:     Optional[bool]      = None
