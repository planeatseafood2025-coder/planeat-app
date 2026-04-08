"""
customer_segment.py — Pydantic models สำหรับ Customer Segments (CRM Phase 1B)
"""
from pydantic import BaseModel
from typing import Optional


class CreateSegmentRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#7c3aed"
    icon: Optional[str] = "label"


class UpdateSegmentRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
