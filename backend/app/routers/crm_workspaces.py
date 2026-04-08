"""
crm_workspaces.py — CRM Workspace endpoints (Multi-business)
"""
import logging
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_user, require_admin
from ..models.crm_workspace import CreateWorkspaceRequest, UpdateWorkspaceRequest
from ..services.crm_workspace_service import (
    get_workspaces_for_user, get_workspace,
    create_workspace, update_workspace, delete_workspace,
    can_access_workspace,
)

router = APIRouter(prefix="/api/crm-workspaces", tags=["crm-workspaces"])
logger = logging.getLogger("planeat.crm_workspaces")

CRM_ROLES = ["admin", "super_admin", "it_manager", "accounting_manager", "sales", "marketing",
             "marketing_manager", "marketing_staff"]


@router.get("")
async def list_workspaces(current: dict = Depends(get_current_user)):
    workspaces = await get_workspaces_for_user(current["sub"], current.get("role", ""))
    return {"workspaces": workspaces}


@router.post("")
async def create(req: CreateWorkspaceRequest, current: dict = Depends(get_current_user)):
    if current.get("role") not in CRM_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์สร้าง workspace")
    return await create_workspace(req.model_dump(), current["sub"])


@router.get("/{workspace_id}")
async def get_one(workspace_id: str, current: dict = Depends(get_current_user)):
    if not await can_access_workspace(workspace_id, current["sub"], current.get("role", "")):
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึง workspace นี้")
    doc = await get_workspace(workspace_id)
    if not doc:
        raise HTTPException(status_code=404, detail="ไม่พบ workspace นี้")
    return {"workspace": doc}


@router.put("/{workspace_id}")
async def update(
    workspace_id: str,
    req: UpdateWorkspaceRequest,
    current: dict = Depends(get_current_user),
):
    if current.get("role") not in CRM_ROLES:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์แก้ไข workspace")
    if not await can_access_workspace(workspace_id, current["sub"], current.get("role", "")):
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึง workspace นี้")
    result = await update_workspace(workspace_id, req.model_dump(exclude_none=True))
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message"))
    return result


@router.delete("/{workspace_id}")
async def delete(workspace_id: str, current: dict = Depends(require_admin)):
    result = await delete_workspace(workspace_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result
