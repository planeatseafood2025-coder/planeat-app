from fastapi import APIRouter, Query
from typing import Optional
from ..models.budget import SetBudgetRequest
from ..services.budget_service import get_budget_summary, set_budget

router = APIRouter(prefix="/api", tags=["budget"])


@router.get("/budget")
async def read_budget(monthYear: Optional[str] = Query(None)):
    return await get_budget_summary(monthYear)


@router.post("/budget")
async def write_budget(req: SetBudgetRequest):
    return await set_budget(req.dict())
