from fastapi import APIRouter
from app.database import get_db

router = APIRouter(prefix="/api/field-history", tags=["field-history"])

@router.get("")
async def get_history(catId: str, fieldId: str):
    db = get_db()
    doc = await db.field_history.find_one({"catId": catId, "fieldId": fieldId})
    return {"items": (doc or {}).get("items", [])}

@router.post("")
async def save_history(body: dict):
    db = get_db()
    catId   = body.get("catId", "")
    fieldId = body.get("fieldId", "")
    value   = (body.get("value") or "").strip()
    if not catId or not fieldId or not value:
        return {"success": False}
    doc = await db.field_history.find_one({"catId": catId, "fieldId": fieldId})
    items = (doc or {}).get("items", [])
    items = [v for v in items if v != value]
    items.insert(0, value)
    items = items[:50]
    await db.field_history.update_one(
        {"catId": catId, "fieldId": fieldId},
        {"$set": {"items": items}},
        upsert=True,
    )
    return {"success": True}

@router.delete("")
async def delete_history(catId: str, fieldId: str, value: str):
    db = get_db()
    doc = await db.field_history.find_one({"catId": catId, "fieldId": fieldId})
    items = [v for v in (doc or {}).get("items", []) if v != value]
    await db.field_history.update_one(
        {"catId": catId, "fieldId": fieldId},
        {"$set": {"items": items}},
        upsert=True,
    )
    return {"success": True}
