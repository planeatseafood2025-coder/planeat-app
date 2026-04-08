from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Optional
from datetime import datetime, timezone, timedelta
from ..models.expense import SaveExpenseRequest
from ..services.expense_service import (
    save_expense, get_expenses, get_monthly_analysis,
    submit_draft, get_drafts, approve_draft, reject_draft, get_expense_history,
    submit_draft_dynamic, approve_draft_dynamic, get_monthly_analysis_dynamic,
    submit_draft_dynamic_public,
    ACCOUNTING_ROLES,
)
from ..deps import get_current_user
from ..database import get_db
from pydantic import BaseModel


class EditExpenseRequest(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    detail: Optional[str] = None
    note: Optional[str] = None

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
        result = await approve_draft(draft_id, current)
        # แจ้งเตือน LINE ส่วนตัว accounting_manager
        try:
            from ..services.line_notify_service import notify_expense_approved
            expense = result.get("expense") or {}
            await notify_expense_approved(expense, current)
        except Exception as e:
            print(f"[LINE notify] approve: {e}")
        return result
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


@router.post("/expenses/draft/public")
async def create_draft_public(req: SaveExpenseRequest):
    try:
        return await submit_draft_dynamic_public(req.dict())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/expenses/drafts/{draft_id}/approve/dynamic")
async def do_approve_dynamic(draft_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์อนุมัติรายการ")
    try:
        result = await approve_draft_dynamic(draft_id, current)
        try:
            from ..services.line_notify_service import notify_expense_approved
            expense = result.get("expense") or {}
            await notify_expense_approved(expense, current)
        except Exception as e:
            print(f"[LINE notify] approve_dynamic: {e}")
        return result
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


def _check_editable(expense: dict):
    """ตรวจสอบว่ารายการยังอยู่ในระยะแก้ไขได้ (ไม่เกิน 3 วัน)"""
    created_raw = expense.get("createdAt") or expense.get("approvedAt", "")
    if not created_raw:
        return  # ไม่มีวันที่ → อนุญาตให้แก้ไข (legacy records)
    try:
        if created_raw.endswith("Z"):
            created_raw = created_raw[:-1] + "+00:00"
        created_at = datetime.fromisoformat(created_raw)
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - created_at > timedelta(days=3):
            raise HTTPException(status_code=403, detail="ไม่สามารถแก้ไขรายการที่เกิน 3 วันได้")
    except HTTPException:
        raise
    except Exception:
        pass  # parse ไม่ได้ → อนุญาต


@router.put("/expenses/{expense_id}")
async def edit_expense(expense_id: str, req: EditExpenseRequest, current: dict = Depends(get_current_user)):
    if current.get("role") not in ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์แก้ไขรายการ")
    db = get_db()
    expense = await db.expenses.find_one({"_id": expense_id})
    if not expense:
        raise HTTPException(status_code=404, detail="ไม่พบรายการนี้")
    _check_editable(expense)
    updates: dict = {}
    if req.date is not None:
        updates["date"] = req.date
    if req.amount is not None:
        updates["amount"] = req.amount
    if req.detail is not None:
        updates["detail"] = req.detail
    if req.note is not None:
        updates["note"] = req.note
    if not updates:
        raise HTTPException(status_code=400, detail="ไม่มีข้อมูลที่จะแก้ไข")
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    updates["updatedBy"] = current.get("sub", "")
    await db.expenses.update_one({"_id": expense_id}, {"$set": updates})
    return {"success": True, "message": "แก้ไขรายการสำเร็จ"}


@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in ACCOUNTING_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์ลบรายการ")
    db = get_db()
    expense = await db.expenses.find_one({"_id": expense_id})
    if not expense:
        raise HTTPException(status_code=404, detail="ไม่พบรายการนี้")
    _check_editable(expense)
    await db.expenses.delete_one({"_id": expense_id})
    return {"success": True, "message": "ลบรายการสำเร็จ"}
