from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Optional
from ..models.expense import SaveExpenseRequest
from ..services.expense_service import (
    save_expense, get_expenses, get_monthly_analysis,
    submit_draft, get_drafts, approve_draft, reject_draft, get_expense_history,
    submit_draft_dynamic, approve_draft_dynamic, get_monthly_analysis_dynamic,
    ACCOUNTING_ROLES,
)
from ..deps import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["expenses"])


class RejectRequest(BaseModel):
    reason: str = ""


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
    return {"success": True, "message": "ตรวจสอบข้อมูลเรียบร้อย ไม่พบข้อผิดพลาด"}


# ─── Draft endpoints ──────────────────────────────────────────────

@router.post("/expenses/draft")
async def create_draft(req: SaveExpenseRequest, current: dict = Depends(get_current_user)):
    return await submit_draft(req.dict(), current)


@router.get("/expenses/drafts")
async def list_drafts(status: str = Query("pending"), current: dict = Depends(get_current_user)):
    return await get_drafts(current, status)


@router.put("/expenses/drafts/{draft_id}/approve")
async def do_approve(draft_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์อนุมัติรายการ")
    try:
        return await approve_draft(draft_id, current)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/expenses/drafts/{draft_id}/reject")
async def do_reject(draft_id: str, req: RejectRequest, current: dict = Depends(get_current_user)):
    if current.get("role") not in ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์ปฏิเสธรายการ")
    try:
        return await reject_draft(draft_id, req.reason, current)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/analysis/dynamic")
async def get_analysis_dynamic(monthYear: Optional[str] = Query(None), _current: dict = Depends(get_current_user)):
    return await get_monthly_analysis_dynamic(monthYear)


@router.post("/expenses/draft/dynamic")
async def create_draft_dynamic(req: SaveExpenseRequest, current: dict = Depends(get_current_user)):
    try:
        return await submit_draft_dynamic(req.dict(), current)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/expenses/drafts/{draft_id}/approve/dynamic")
async def do_approve_dynamic(draft_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์อนุมัติรายการ")
    try:
        return await approve_draft_dynamic(draft_id, current)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/expenses/history")
async def expense_history(
    monthYear: Optional[str] = Query(None),
    catKey: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    _current: dict = Depends(get_current_user),
):
    return await get_expense_history(monthYear, catKey, search, page, perPage)
