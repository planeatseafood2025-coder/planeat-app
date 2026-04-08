"""
Category service — dynamic expense categories (CRUD + permission check + cascade delete).
"""
import uuid
from datetime import datetime
from typing import Optional
from ..database import get_db

MANAGER_ROLES = ["accounting_manager", "super_admin", "it_manager", "admin"]

# ─── Default 4 categories (seed เมื่อยังไม่มีข้อมูล) ─────────────────────────
DEFAULT_CATEGORIES = [
    {
        "_id": "labor",
        "name": "ค่าแรงงาน",
        "color": "#f59e0b",
        "icon": "groups",
        "formula": "qty*price+addend",
        "fields": [
            {"fieldId": "workers",   "label": "จำนวนพนักงาน", "type": "number", "unit": "คน",  "placeholder": "10",  "required": True,  "calcRole": "qty",     "options": []},
            {"fieldId": "dailyWage", "label": "ค่าจ้างรายวัน","type": "number", "unit": "฿/คน","placeholder": "500", "required": True,  "calcRole": "price",   "options": []},
            {"fieldId": "ot",        "label": "ค่า OT",        "type": "number", "unit": "฿",   "placeholder": "0",   "required": False, "calcRole": "addend",  "options": []},
            {"fieldId": "note",      "label": "หมายเหตุ",      "type": "text",   "unit": "",    "placeholder": "(ถ้ามี)", "required": False, "calcRole": "note", "options": []},
        ],
        "allowedRoles": [],
        "allowedUsers": [],
        "isActive": True,
        "order": 1,
        "createdAt": datetime.utcnow().isoformat(),
        "createdBy": "system",
    },
    {
        "_id": "raw",
        "name": "ค่าวัตถุดิบ",
        "color": "#10b981",
        "icon": "inventory",
        "formula": "qty*price",
        "fields": [
            {"fieldId": "itemName",   "label": "รายการวัตถุดิบ","type": "text",   "unit": "",       "placeholder": "ชื่อวัตถุดิบ", "required": True,  "calcRole": "none",  "options": []},
            {"fieldId": "quantity",   "label": "จำนวน",          "type": "number", "unit": "กก.",    "placeholder": "100",  "required": True,  "calcRole": "qty",   "options": []},
            {"fieldId": "pricePerKg", "label": "ราคา",           "type": "number", "unit": "฿/กก.", "placeholder": "25",   "required": True,  "calcRole": "price", "options": []},
            {"fieldId": "note",       "label": "หมายเหตุ",       "type": "text",   "unit": "",       "placeholder": "(ถ้ามี)", "required": False, "calcRole": "note",  "options": []},
        ],
        "allowedRoles": [],
        "allowedUsers": [],
        "isActive": True,
        "order": 2,
        "createdAt": datetime.utcnow().isoformat(),
        "createdBy": "system",
    },
    {
        "_id": "chem",
        "name": "ค่าเคมี/หีบห่อ",
        "color": "#8b5cf6",
        "icon": "science",
        "formula": "qty*price",
        "fields": [
            {"fieldId": "itemName", "label": "รายการ",  "type": "text",   "unit": "",    "placeholder": "ชื่อเคมี/หีบห่อ", "required": True,  "calcRole": "none",  "options": []},
            {"fieldId": "quantity", "label": "จำนวน",   "type": "number", "unit": "ชิ้น","placeholder": "10",  "required": True,  "calcRole": "qty",   "options": []},
            {"fieldId": "price",    "label": "ราคา",    "type": "number", "unit": "฿",   "placeholder": "500", "required": True,  "calcRole": "price", "options": []},
            {"fieldId": "note",     "label": "หมายเหตุ","type": "text",   "unit": "",    "placeholder": "(ถ้ามี)", "required": False, "calcRole": "note",  "options": []},
        ],
        "allowedRoles": [],
        "allowedUsers": [],
        "isActive": True,
        "order": 3,
        "createdAt": datetime.utcnow().isoformat(),
        "createdBy": "system",
    },
    {
        "_id": "repair",
        "name": "ค่าซ่อมแซม",
        "color": "#ef4444",
        "icon": "build",
        "formula": "fixed",
        "fields": [
            {"fieldId": "repairItem", "label": "รายการซ่อม",  "type": "text",   "unit": "",  "placeholder": "เช่น ซ่อมตู้เย็น", "required": True,  "calcRole": "none",  "options": []},
            {"fieldId": "totalCost",  "label": "ยอดเงินรวม", "type": "number", "unit": "฿", "placeholder": "0",  "required": True,  "calcRole": "fixed", "options": []},
            {"fieldId": "note",       "label": "หมายเหตุ",   "type": "text",   "unit": "",  "placeholder": "(ถ้ามี)", "required": False, "calcRole": "note",  "options": []},
        ],
        "allowedRoles": [],
        "allowedUsers": [],
        "isActive": True,
        "order": 4,
        "createdAt": datetime.utcnow().isoformat(),
        "createdBy": "system",
    },
]


async def ensure_default_categories():
    """Seed default categories ถ้ายังไม่มีใน DB."""
    db = get_db()
    count = await db.expense_categories.count_documents({})
    if count == 0:
        await db.expense_categories.insert_many(DEFAULT_CATEGORIES)


async def get_all_categories(active_only: bool = True) -> list:
    from .cache_service import cache_get, cache_set
    cache_key = f"categories:{'active' if active_only else 'all'}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    db = get_db()
    query = {"isActive": True} if active_only else {}
    cursor = db.expense_categories.find(query).sort("order", 1)
    result = []
    async for doc in cursor:
        result.append(_serialize(doc))
    await cache_set(cache_key, result, ttl=300)   # 5 นาที
    return result


async def get_categories_for_user(username: str, role: str) -> list:
    """
    ดึง categories ที่ user มีสิทธิ์กรอกข้อมูล

    กฎสิทธิ์:
    - Manager roles → เข้าถึงได้ทุกหมวดเสมอ
    - allowedRoles/allowedUsers ว่างทั้งคู่ → ไม่มีใครเข้าได้ (นอกจาก manager)
    - ระบุ allowedRoles/allowedUsers → เฉพาะคนที่ได้รับสิทธิ์เท่านั้น
    """
    all_cats = await get_all_categories()
    accessible = []
    for cat in all_cats:
        allowed_roles = cat.get("allowedRoles", [])
        allowed_users = cat.get("allowedUsers", [])
        # Manager เข้าได้เสมอ
        if role in MANAGER_ROLES:
            accessible.append(cat)
        # ถ้าไม่ได้ระบุใคร → ไม่มีสิทธิ์ (ต้องให้ manager เปิดก่อน)
        elif not allowed_roles and not allowed_users:
            pass
        # ตรงตาม role หรือ username ที่ระบุไว้
        elif role in allowed_roles or username in allowed_users:
            accessible.append(cat)
    return accessible


async def get_category_by_id(cat_id: str) -> Optional[dict]:
    db = get_db()
    doc = await db.expense_categories.find_one({"_id": cat_id})
    return _serialize(doc) if doc else None


async def _invalidate_categories_cache():
    from .cache_service import cache_delete_pattern
    await cache_delete_pattern("categories:*")


async def create_category(payload: dict, creator_username: str) -> dict:
    db = get_db()
    cat_id = str(uuid.uuid4())[:8]
    doc = {
        "_id": cat_id,
        "name":         payload.get("name", "หมวดใหม่"),
        "color":        payload.get("color", "#3b82f6"),
        "icon":         payload.get("icon", "receipt_long"),
        "formula":      payload.get("formula", "fixed"),
        "fields":       payload.get("fields", []),
        "allowedRoles": payload.get("allowedRoles", []),
        "allowedUsers": payload.get("allowedUsers", []),
        "order":        payload.get("order", 999),
        "isActive":     True,
        "createdAt":    datetime.utcnow().isoformat(),
        "createdBy":    creator_username,
    }
    await db.expense_categories.insert_one(doc)
    await _invalidate_categories_cache()
    return {"success": True, "category": _serialize(doc)}


async def update_category(cat_id: str, payload: dict) -> dict:
    db = get_db()
    updates = {k: v for k, v in payload.items() if v is not None}
    if not updates:
        return {"success": False, "message": "ไม่มีข้อมูลที่จะอัปเดต"}
    updates["updatedAt"] = datetime.utcnow().isoformat()
    await db.expense_categories.update_one({"_id": cat_id}, {"$set": updates})
    await _invalidate_categories_cache()
    doc = await db.expense_categories.find_one({"_id": cat_id})
    return {"success": True, "category": _serialize(doc) if doc else None}


async def get_category_summary(cat_id: str) -> dict:
    """นับข้อมูลที่เกี่ยวข้องก่อนลบ (สำหรับ warning modal)"""
    db = get_db()
    drafts_count   = await db.expense_drafts.count_documents({"catKey": cat_id})
    records_count  = await db.expenses.count_documents({"catKey": cat_id})
    budget_count   = await db.budgets.count_documents({"catKey": cat_id})
    return {
        "catId":   cat_id,
        "drafts":  drafts_count,
        "records": records_count,
        "budgets": budget_count,
    }


async def delete_category(cat_id: str) -> dict:
    """Cascade delete: ลบหมวด + ข้อมูลที่เกี่ยวข้องทั้งหมด"""
    db = get_db()
    doc = await db.expense_categories.find_one({"_id": cat_id})
    if not doc:
        return {"success": False, "message": "ไม่พบหมวดนี้"}

    d  = await db.expense_drafts.delete_many({"catKey": cat_id})
    r  = await db.expenses.delete_many({"catKey": cat_id})
    b  = await db.budgets.delete_many({"catKey": cat_id})
    await db.expense_categories.delete_one({"_id": cat_id})
    await _invalidate_categories_cache()

    return {
        "success":        True,
        "message":        f"ลบหมวด '{doc['name']}' สำเร็จ",
        "deletedDrafts":  d.deleted_count,
        "deletedRecords": r.deleted_count,
        "deletedBudgets": b.deleted_count,
    }


def calc_total_dynamic(cat: dict, row: dict) -> tuple[float, str]:
    """คำนวน total และ detail string จาก dynamic category fields + formula"""
    formula = cat.get("formula", "fixed")
    fields  = cat.get("fields", [])

    # map calcRole → value
    vals: dict[str, float] = {}
    for f in fields:
        role = f.get("calcRole", "none")
        fid  = f.get("fieldId", "")
        if role in ("qty", "price", "addend", "fixed"):
            try:
                vals[role] = float(row.get(fid, 0) or 0)
            except (ValueError, TypeError):
                vals[role] = 0.0

    qty    = vals.get("qty",    0.0)
    price  = vals.get("price",  0.0)
    addend = vals.get("addend", 0.0)
    fixed  = vals.get("fixed",  0.0)

    if formula == "qty*price":
        total = qty * price
    elif formula == "qty*price+addend":
        total = qty * price + addend
    elif formula == "fixed":
        total = fixed
    elif formula == "qty+price":
        total = qty + price
    else:
        total = fixed or (qty * price + addend)

    # สร้าง detail string
    parts = []
    for f in fields:
        role = f.get("calcRole", "none")
        fid  = f.get("fieldId", "")
        unit = f.get("unit", "")
        if role == "note":
            continue
        val = row.get(fid, "")
        if val:
            parts.append(f"{val}{unit}")
    detail = " × ".join(parts) if parts else cat.get("name", "")

    return total, detail


def _serialize(doc: dict) -> dict:
    if not doc:
        return {}
    return {
        "id":           doc.get("_id", ""),
        "name":         doc.get("name", ""),
        "color":        doc.get("color", "#3b82f6"),
        "icon":         doc.get("icon", "receipt_long"),
        "formula":      doc.get("formula", "fixed"),
        "fields":       doc.get("fields", []),
        "allowedRoles": doc.get("allowedRoles", []),
        "allowedUsers": doc.get("allowedUsers", []),
        "order":        doc.get("order", 999),
        "isActive":     doc.get("isActive", True),
        "createdAt":    doc.get("createdAt", ""),
        "createdBy":    doc.get("createdBy", ""),
    }
