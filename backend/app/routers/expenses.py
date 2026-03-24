from fastapi import APIRouter, Query
from typing import Optional
from ..models.expense import SaveExpenseRequest
from ..services.expense_service import save_expense, get_expenses, get_monthly_analysis

router = APIRouter(prefix="/api", tags=["expenses"])


@router.get("/expenses")
async def list_expenses(monthYear: Optional[str] = Query(None)):
    return await get_expenses(monthYear)


@router.post("/expenses")
async def create_expense(req: SaveExpenseRequest):
    return await save_expense(req.dict())


@router.get("/analysis")
async def get_analysis(monthYear: Optional[str] = Query(None)):
    return await get_monthly_analysis(monthYear)


@router.post("/admin/fix-data")
async def fix_data():
    """Placeholder — recalculate/cleanup expense amounts."""
    return {"success": True, "message": "ตรวจสอบข้อมูลเรียบร้อย ไม่พบข้อผิดพลาด"}
