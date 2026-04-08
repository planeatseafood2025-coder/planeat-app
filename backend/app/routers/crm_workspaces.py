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


@router.get("/stats/summary")
async def workspace_stats(current: dict = Depends(get_current_user)):
    """สรุปสถิติลูกค้าแยกต่อ workspace สำหรับ Dashboard"""
    from ..database import get_db
    db = get_db()

    workspaces = await get_workspaces_for_user(current["sub"], current.get("role", ""))

    stats = []
    for ws in workspaces:
        ws_id = ws["id"]
        base_q = {"workspaceId": ws_id}

        total      = await db.customers.count_documents(base_q)
        active     = await db.customers.count_documents({**base_q, "status": "active"})
        inactive   = await db.customers.count_documents({**base_q, "status": "inactive"})
        b2c        = await db.customers.count_documents({**base_q, "type": "B2C"})
        b2b        = await db.customers.count_documents({**base_q, "type": "B2B"})
        line_only  = await db.customers.count_documents({**base_q, "source": "line_oa"})

        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        new_month  = await db.customers.count_documents({
            **base_q,
            "createdAt": {"$gte": month_start},
        })

        stats.append({
            "workspaceId":  ws_id,
            "name":         ws["name"],
            "color":        ws.get("color", "#7c3aed"),
            "icon":         ws.get("icon", "business"),
            "lineOaConfigId": ws.get("lineOaConfigId", ""),
            "total":        total,
            "active":       active,
            "inactive":     inactive,
            "b2c":          b2c,
            "b2b":          b2b,
            "lineCustomers": line_only,
            "newThisMonth": new_month,
        })

    totals = {
        "total":        sum(s["total"] for s in stats),
        "active":       sum(s["active"] for s in stats),
        "inactive":     sum(s["inactive"] for s in stats),
        "b2c":          sum(s["b2c"] for s in stats),
        "newThisMonth": sum(s["newThisMonth"] for s in stats),
    }

    return {"workspaces": stats, "totals": totals}


@router.delete("/{workspace_id}")
async def delete(workspace_id: str, current: dict = Depends(require_admin)):
    result = await delete_workspace(workspace_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result
