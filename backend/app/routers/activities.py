from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from bson import ObjectId
import math

from ..database import get_db
from ..deps import get_current_user
from ..models.activity import CreateActivityRequest, UpdateActivityRequest

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.post("")
async def create_activity(req: CreateActivityRequest, current_user: dict = Depends(get_current_user)):
    db = get_db()
    
    doc = req.dict()
    username = current_user.get("sub")
    
    doc["createdAt"] = datetime.now()
    if not doc.get("performedBy"):
        doc["performedBy"] = username
        
    if not doc.get("datetime"):
        doc["datetime"] = datetime.now().isoformat()
        
    result = await db.activities.insert_one(doc)
    return {"success": True, "id": str(result.inserted_id)}


@router.get("")
async def get_activities(
    targetType: Optional[str] = Query(None),
    targetId: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    query = {}
    
    if targetType:
        query["targetType"] = targetType
    if targetId:
        query["targetId"] = targetId
        
    total = await db.activities.count_documents(query)
    
    skip = (page - 1) * perPage
    # เรียงจากใหม่ไปเก่า (เวลาเกิด activity)
    cursor = db.activities.find(query).sort("datetime", -1).skip(skip).limit(perPage)
    
    activities = []
    async for act in cursor:
        act["id"] = str(act.pop("_id"))
        activities.append(act)
        
    return {
        "success": True,
        "data": activities,
        "total": total,
        "page": page,
        "perPage": perPage,
        "totalPages": math.ceil(total / perPage)
    }


@router.put("/{activity_id}")
async def update_activity(activity_id: str, req: UpdateActivityRequest, current_user: dict = Depends(get_current_user)):
    db = get_db()
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    
    if not update_data:
        return {"success": True, "message": "No fields to update"}
        
    update_data["updatedAt"] = datetime.now()
    
    try:
        result = await db.activities.update_one(
            {"_id": ObjectId(activity_id)},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Activity not found")
        return {"success": True, "message": "Updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Update failed: {str(e)}")


@router.delete("/{activity_id}")
async def delete_activity(activity_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        result = await db.activities.delete_one({"_id": ObjectId(activity_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Activity not found")
        return {"success": True, "message": "Deleted successfully"}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Activity ID")
