"""
segments.py — Customer Segment endpoints (workspace-aware)
"""
import logging
from fastapi import APIRouter, Depends, Path, HTTPException

from ..deps import get_current_user, require_admin
from ..models.customer_segment import CreateSegmentRequest, UpdateSegmentRequest
from ..services.segment_service import (
    get_all_segments, get_segment, create_segment,
    update_segment, delete_segment, get_segment_customer_count,
)
from ..services.crm_workspace_service import can_access_workspace

router = APIRouter(prefix="/api/crm-workspaces/{workspace_id}/segments", tags=["segments"])
logger = logging.getLogger("planeat.segments")

CRM_ROLES = ["admin", "super_admin", "it_manager", "accounting_manager", "sales", "marketing",
             "marketing_manager", "marketing_staff"]


async def _check_access(workspace_id: str, current: dict):
    if not await can_access_workspace(workspace_id, current["sub"], current.get("role", "")):
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึง workspace นี้")


@router.get("")
async def list_segments(
    workspace_id: str = Path(...),
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    segments = await get_all_segments(workspace_id)
    # Attach customer count to each segment
    for seg in segments:
        seg["customerCount"] = await get_segment_customer_count(seg["id"], workspace_id)
    return {"segments": segments}


@router.post("")
async def create(
    workspace_id: str = Path(...),
    req: CreateSegmentRequest = ...,
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    if current.get("role") not in CRM_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เพิ่มกลุ่มลูกค้า")
    return await create_segment(req.model_dump(), current["sub"], workspace_id)


@router.put("/{segment_id}")
async def update(
    workspace_id: str = Path(...),
    segment_id: str = Path(...),
    req: UpdateSegmentRequest = ...,
    current: dict = Depends(get_current_user),
):
    await _check_access(workspace_id, current)
    if current.get("role") not in CRM_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์แก้ไขกลุ่มลูกค้า")
    result = await update_segment(segment_id, req.model_dump(exclude_none=True), workspace_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


@router.delete("/{segment_id}")
async def delete(
    workspace_id: str = Path(...),
    segment_id: str = Path(...),
    _current: dict = Depends(require_admin),
):
    result = await delete_segment(segment_id, workspace_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result
