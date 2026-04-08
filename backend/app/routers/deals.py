from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime
from bson import ObjectId
import math

from ..database import get_db
from ..deps import get_current_user
from ..models.deal import CreateDealRequest, UpdateDealRequest

router = APIRouter(prefix="/api/deals", tags=["deals"])


@router.post("")
async def create_deal(req: CreateDealRequest, current_user: dict = Depends(get_current_user)):
    db = get_db()
    
    doc = req.dict()
    doc["createdAt"] = datetime.now()
    doc["updatedAt"] = datetime.now()
    doc["createdBy"] = current_user.get("sub")
    
    # If no assigned user, assign to creator
    if not doc.get("assignedTo"):
        doc["assignedTo"] = current_user.get("sub")
        
    result = await db.deals.insert_one(doc)
    return {"success": True, "id": str(result.inserted_id)}


@router.get("")
async def get_deals(
    stage: Optional[str] = Query(None),
    customerId: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    query = {}
    
    if stage:
        query["stage"] = stage
    if customerId:
        query["customerId"] = customerId
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"note": {"$regex": q, "$options": "i"}},
        ]
        
    total = await db.deals.count_documents(query)
    
    skip = (page - 1) * perPage
    cursor = db.deals.find(query).sort("createdAt", -1).skip(skip).limit(perPage)
    
    deals = []
    async for d in cursor:
        d["id"] = str(d.pop("_id"))
        deals.append(d)
        
    return {
        "success": True,
        "data": deals,
        "total": total,
        "page": page,
        "perPage": perPage,
        "totalPages": math.ceil(total / perPage)
    }


@router.get("/{deal_id}")
async def get_deal(deal_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        deal = await db.deals.find_one({"_id": ObjectId(deal_id)})
        if not deal:
            raise HTTPException(status_code=404, detail="Deal not found")
        deal["id"] = str(deal.pop("_id"))
        return {"success": True, "data": deal}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Deal ID")


@router.put("/{deal_id}")
async def update_deal(deal_id: str, req: UpdateDealRequest, current_user: dict = Depends(get_current_user)):
    db = get_db()
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    
    if "customerId" in update_data and update_data["customerId"] == "":
        update_data.pop("customerId")
        
    if not update_data:
        return {"success": True, "message": "No fields to update"}
        
    update_data["updatedAt"] = datetime.now()
    
    try:
        result = await db.deals.update_one(
            {"_id": ObjectId(deal_id)},
            {"$set": update_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Deal not found")
        return {"success": True, "message": "Updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Update failed: {str(e)}")


@router.delete("/{deal_id}")
async def delete_deal(deal_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    try:
        result = await db.deals.delete_one({"_id": ObjectId(deal_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Deal not found")
            
        # Optional: delete related activities
        await db.activities.delete_many({"targetType": "deal", "targetId": deal_id})
        
        return {"success": True, "message": "Deleted successfully"}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Deal ID")
