from fastapi import APIRouter, Query, Depends
from typing import Optional
from ..models.budget import SetBudgetRequest
from ..services.budget_service import get_budget_summary, set_budget, get_yearly_budget_vs_actual
from ..deps import require_admin

router = APIRouter(prefix="/api", tags=["budget"])


@router.get("/budget")
async def read_budget(monthYear: Optional[str] = Query(None)):
    return await get_budget_summary(monthYear)


@router.post("/budget")
async def write_budget(req: SetBudgetRequest):
    return await set_budget(req.dict())


@router.get("/budget/yearly")
async def yearly_budget(
    year: Optional[int] = Query(None),
    current: dict = Depends(require_admin),
):
    """
    รายงาน Budget vs Actual รายเดือนตลอดปี สำหรับผู้บริหาร
    Response: { year, categories: [...], grandTotal: {...} }
    """
    return await get_yearly_budget_vs_actual(year)
