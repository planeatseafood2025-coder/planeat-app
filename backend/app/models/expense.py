from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
import uuid


class LaborRow(BaseModel):
    workers: float = 0
    dailyWage: float = 0
    ot: float = 0
    note: str = ""


class RawRow(BaseModel):
    itemName: str = ""
    quantity: float = 0
    pricePerKg: float = 0
    note: str = ""


class ChemRow(BaseModel):
    itemName: str = ""
    quantity: float = 0
    price: float = 0
    note: str = ""


class RepairRow(BaseModel):
    repairItem: str = ""
    totalCost: float = 0
    note: str = ""


class SaveExpenseRequest(BaseModel):
    username: str
    category: Optional[str] = None   # Thai name e.g. 'ค่าแรงงาน' (legacy)
    catId:    Optional[str] = None   # dynamic category ID (new flow)
    date: str          # dd/MM/yyyy
    rows: List[Any]    # flexible — varies by category


class ExpenseOut(BaseModel):
    id: str
    date: str          # dd/MM/yyyy
    category: str
    catKey: str
    amount: float
    recorder: str
    note: str = ""
    detail: str = ""
