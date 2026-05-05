from pydantic import BaseModel
from typing import Optional


class BudgetCatPayload(BaseModel):
    monthly: float = 0
    daily: float = 0


class SetBudgetRequest(BaseModel):
    username: str
    monthYear: str   # MM/yyyy
    budgets: dict    # { labor: {monthly, daily}, raw, chem, repair }


class BudgetEntry(BaseModel):
    monthlyBudget: float = 0
    dailyRate: float = 0
    spentToday: float = 0
    spentMonth: float = 0
    remainDay: float = 0
    remainMonth: float = 0
    currentDay: int = 1


class BudgetResponse(BaseModel):
    success: bool
    data: dict
    monthYear: str
    currentDay: int
