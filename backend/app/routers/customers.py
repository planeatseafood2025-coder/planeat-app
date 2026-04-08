"""
customers.py — CRM Customer endpoints (workspace-aware)
ทุก endpoint ต้องระบุ workspaceId เพื่อแยกข้อมูลระหว่างธุรกิจ
"""
import logging
from fastapi import APIRouter, Depends, Query, HTTPException, Path
from fastapi.responses import Response

from ..deps import get_current_user, require_admin
from ..models.customer import CreateCustomerRequest, UpdateCustomerRequest, AddTagRequest
from ..services.customer_service import (
    get_all_customers, get_customer, create_customer,
    update_customer, delete_customer,
    add_tag, remove_tag, get_all_tags,
    export_customers_csv,
)
from ..services.crm_workspace_service import can_access_workspace

router = APIRouter(prefix="/api/crm-workspaces/{workspace_id}/customers", tags=["customers"])
logger = logging.getLogger("planeat.customers")

CRM_ROLES = ["admin", "super_admin", "it_manager", "accounting_manager", "sales", "marketing",
             "marketing_manager", "marketing_staff"]


async def _check_access(workspace_id: str, current: dict):
    if not await can_access_workspace(workspace_id, current["sub"], current.get("role", "")):
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึง workspace นี้")


# ─── List & Search ────────────────────────────────────────────────────────────

@router.get("")
async def list_customers(
    workspace_id: str = Path(...),
    q:         str = Query(""),
    type:      str = Query(""),
    tag:       str = Query(""),
    status:    str = Query("active"),
    segmentId: str = Query(""),
    page:      int = Query(1, ge=1),
    perPage:   int = Query(20, ge=1, le=100),
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    return await get_all_customers(workspace_id, q, type, tag, status, page, perPage, segmentId)


# ─── Tags ─────────────────────────────────────────────────────────────────────

@router.get("/tags")
async def list_tags(
    workspace_id: str = Path(...),
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    tags = await get_all_tags(workspace_id)
    return {"tags": tags}


# ─── Export CSV ───────────────────────────────────────────────────────────────

@router.get("/export/csv")
async def export_csv(
    workspace_id: str = Path(...),
    type:   str = Query(""),
    tag:    str = Query(""),
    status: str = Query("active"),
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    csv_content = await export_customers_csv(workspace_id, type, tag, status)
    return Response(
        content="\ufeff" + csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=customers.csv"},
    )


# ─── Get single ───────────────────────────────────────────────────────────────

@router.get("/{customer_id}")
async def get_one(
    workspace_id: str = Path(...),
    customer_id: str = Path(...),
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    doc = await get_customer(customer_id, workspace_id)
    if not doc:
        raise HTTPException(status_code=404, detail="ไม่พบลูกค้านี้")
    return {"customer": doc}


# ─── Create ───────────────────────────────────────────────────────────────────

@router.post("")
async def create(
    workspace_id: str = Path(...),
    req: CreateCustomerRequest = ...,
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    if current.get("role") not in CRM_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เพิ่มลูกค้า")
    payload = req.model_dump()
    payload["workspaceId"] = workspace_id
    return await create_customer(payload, current["sub"], workspace_id)


# ─── Update ───────────────────────────────────────────────────────────────────

@router.put("/{customer_id}")
async def update(
    workspace_id: str = Path(...),
    customer_id: str = Path(...),
    req: UpdateCustomerRequest = ...,
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    if current.get("role") not in CRM_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์แก้ไขลูกค้า")
    result = await update_customer(customer_id, req.model_dump(exclude_none=True), workspace_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{customer_id}")
async def delete(
    workspace_id: str = Path(...),
    customer_id: str = Path(...),
    _current: dict = Depends(require_admin),
):
    result = await delete_customer(customer_id, workspace_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


# ─── Tags management ──────────────────────────────────────────────────────────

@router.post("/{customer_id}/tags")
async def add_tag_endpoint(
    workspace_id: str = Path(...),
    customer_id: str = Path(...),
    req: AddTagRequest = ...,
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    if current.get("role") not in CRM_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์")
    return await add_tag(customer_id, req.tag, workspace_id)


@router.delete("/{customer_id}/tags/{tag}")
async def remove_tag_endpoint(
    workspace_id: str = Path(...),
    customer_id: str = Path(...),
    tag: str = Path(...),
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    if current.get("role") not in CRM_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์")
    return await remove_tag(customer_id, tag, workspace_id)
