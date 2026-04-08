"""
deal.py — Pydantic models สำหรับระบบ Sales Pipeline (Deals)
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CreateDealRequest(BaseModel):
    title: str
    customerId: str
    value: float = 0.0
    stage: str = "lead"          # lead | qualified | proposal | negotiation | won | lost
    probability: int = 0         # 0-100
    assignedTo: Optional[str] = ""
    expectedCloseDate: Optional[str] = ""
    source: Optional[str] = ""
    note: Optional[str] = ""


class UpdateDealRequest(BaseModel):
    title: Optional[str] = None
    customerId: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None
    probability: Optional[int] = None
    assignedTo: Optional[str] = None
    expectedCloseDate: Optional[str] = None
    source: Optional[str] = None
    note: Optional[str] = None


class DealSearchParams(BaseModel):
    q: Optional[str] = ""
    customerId: Optional[str] = ""
    stage: Optional[str] = ""
    assignedTo: Optional[str] = ""
    page: int = 1
    perPage: int = 50
