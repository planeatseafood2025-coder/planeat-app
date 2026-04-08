"""
activity.py — Pydantic models สำหรับระบบ Sales Pipeline (Activities/Timeline)
"""
from pydantic import BaseModel
from typing import Optional


class CreateActivityRequest(BaseModel):
    targetId: str               # ID ของ Deal หรือ Customer
    targetType: str             # 'deal' หรือ 'customer'
    type: str = "note"          # note | call | email | meeting | line
    description: str
    performedBy: Optional[str] = ""
    datetime: Optional[str] = ""


class UpdateActivityRequest(BaseModel):
    type: Optional[str] = None
    description: Optional[str] = None
    datetime: Optional[str] = None
