from datetime import datetime, timezone
from typing import Optional
import uuid
from ..database import get_db

# ─── Warehouse defaults ───────────────────────────────────────────────────────
WAREHOUSES = [
    {"id": "ssp",           "name": "SSP",          "pin": "4321",
     "color": "#1e3a8a", "bg": "#dbeafe", "icon": "business",    "desc": "คลังสินค้า SSP"},
    {"id": "plaaneet",      "name": "ปลาณีต",         "pin": "2026",
     "color": "#065f46", "bg": "#d1fae5", "icon": "set_meal",    "desc": "คลังสินค้าปลาณีต"},
    {"id": "plaaneet_farm", "name": "ปลาณีตฟาร์ม",    "pin": "2025",
     "color": "#0e7490", "bg": "#cffafe", "icon": "agriculture", "desc": "คลังสินค้าปลาณีตฟาร์ม"},
    {"id": "sniffy",        "name": "Sniffy",        "pin": "1234",
     "color": "#6d28d9", "bg": "#ede9fe", "icon": "pets",        "desc": "คลังสินค้า Sniffy"},
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Warehouse ────────────────────────────────────────────────────────────────

async def init_warehouses():
    db = get_db()
    for wh in WAREHOUSES:
        existing = await db.warehouses.find_one({"id": wh["id"]})
        if not existing:
            doc = dict(wh)
            doc["createdAt"] = _now_iso()
            await db.warehouses.insert_one(doc)


async def get_warehouses() -> dict:
    db = get_db()
    docs = await db.warehouses.find({}, {"_id": 0, "pin": 0}).to_list(length=20)
    return {"success": True, "warehouses": docs}


async def verify_pin(warehouse_id: str, pin: str) -> dict:
    db = get_db()
    wh = await db.warehouses.find_one({"id": warehouse_id})
    if not wh:
        return {"success": False, "message": "ไม่พบคลังสินค้า"}
    if wh.get("pin") != pin.strip():
        return {"success": False, "message": "รหัส PIN ไม่ถูกต้อง"}
    safe = {k: v for k, v in wh.items() if k not in ["_id", "pin"]}
    return {"success": True, "warehouse": safe}


async def create_warehouse(data: dict) -> dict:
    db = get_db()
    name = data["name"].strip()
    if not name:
        return {"success": False, "message": "ชื่อคลังห้ามว่าง"}
    wh_id = str(uuid.uuid4())[:8]
    existing = await db.warehouses.find_one({"name": name})
    if existing:
        return {"success": False, "message": f"ชื่อคลัง '{name}' มีอยู่แล้ว"}
    doc = {
        "id":        wh_id,
        "name":      name,
        "pin":       data.get("pin", "1234").strip(),
        "color":     data.get("color", "#1e3a8a"),
        "bg":        data.get("bg", "#dbeafe"),
        "icon":      data.get("icon", "warehouse"),
        "desc":      data.get("desc", "").strip(),
        "createdAt": _now_iso(),
    }
    await db.warehouses.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("pin", None)
    return {"success": True, "message": "สร้างคลังสำเร็จ", "warehouse": doc}


async def update_warehouse(warehouse_id: str, data: dict) -> dict:
    db = get_db()
    wh = await db.warehouses.find_one({"id": warehouse_id})
    if not wh:
        return {"success": False, "message": "ไม่พบคลังสินค้า"}
    fields = {k: v for k, v in data.items() if k in ["name", "color", "bg", "icon", "desc", "imageUrl"] and v is not None}
    fields["updatedAt"] = _now_iso()
    await db.warehouses.update_one({"id": warehouse_id}, {"$set": fields})
    return {"success": True, "message": "อัปเดตคลังสำเร็จ"}


async def delete_warehouse(warehouse_id: str) -> dict:
    db = get_db()
    wh = await db.warehouses.find_one({"id": warehouse_id})
    if not wh:
        return {"success": False, "message": "ไม่พบคลังสินค้า"}
    item_count = await db.inventory_items.count_documents({"warehouseId": warehouse_id})
    if item_count > 0:
        return {"success": False, "message": f"ไม่สามารถลบได้ — มีสินค้า {item_count} รายการในคลังนี้"}
    await db.warehouses.delete_one({"id": warehouse_id})
    return {"success": True, "message": "ลบคลังสำเร็จ"}


async def update_pin(warehouse_id: str, old_pin: str, new_pin: str) -> dict:
    db = get_db()
    wh = await db.warehouses.find_one({"id": warehouse_id})
    if not wh:
        return {"success": False, "message": "ไม่พบคลังสินค้า"}
    if wh.get("pin") != old_pin.strip():
        return {"success": False, "message": "รหัส PIN เดิมไม่ถูกต้อง"}
    if len(new_pin.strip()) < 4:
        return {"success": False, "message": "PIN ใหม่ต้องมีอย่างน้อย 4 หลัก"}
    await db.warehouses.update_one({"id": warehouse_id}, {"$set": {"pin": new_pin.strip()}})
    return {"success": True, "message": "เปลี่ยน PIN สำเร็จ"}


# ─── Items ───────────────────────────────────────────────────────────────────

async def create_item(data: dict) -> dict:
    db = get_db()
    wid = data.get("warehouseId", "")
    code = data["code"].strip().upper()

    existing = await db.inventory_items.find_one({"code": code, "warehouseId": wid})
    if existing:
        return {"success": False, "message": f"รหัสสินค้า '{code}' มีอยู่แล้วในคลังนี้"}

    item = {
        "id":           str(uuid.uuid4()),
        "warehouseId":  wid,
        "code":         code,
        "name":         data["name"].strip(),
        "category":     data["category"].strip(),
        "unit":         data["unit"].strip(),
        "currentStock": float(data.get("currentStock", 0)),
        "minStock":     float(data.get("minStock", 0)),
        "unitCost":     float(data.get("unitCost", 0)),
        "location":     data.get("location", "").strip(),
        "note":         data.get("note", "").strip(),
        "createdBy":    data.get("username", ""),
        "createdAt":    _now_iso(),
        "updatedAt":    _now_iso(),
    }
    await db.inventory_items.insert_one(item)

    if item["currentStock"] > 0:
        await _insert_transaction({
            "warehouseId":    wid,
            "itemId":         item["id"],
            "itemCode":       item["code"],
            "itemName":       item["name"],
            "type":           "receive",
            "quantity":       item["currentStock"],
            "quantityBefore": 0.0,
            "quantityAfter":  item["currentStock"],
            "unitCost":       item["unitCost"],
            "reference":      "INIT",
            "note":           "ยอดเริ่มต้น",
            "recorder":       data.get("username", ""),
        })

    item.pop("_id", None)
    return {"success": True, "message": "เพิ่มสินค้าสำเร็จ", "item": item}


async def get_items(warehouse_id: str) -> dict:
    db = get_db()
    cursor = db.inventory_items.find({"warehouseId": warehouse_id}, {"_id": 0}).sort("code", 1)
    items = await cursor.to_list(length=1000)
    return {"success": True, "items": items}


async def update_item(item_id: str, data: dict) -> dict:
    db = get_db()
    item = await db.inventory_items.find_one({"id": item_id})
    if not item:
        return {"success": False, "message": "ไม่พบสินค้า"}

    fields: dict = {}
    for key in ["name", "category", "unit", "minStock", "unitCost", "location", "note"]:
        if key in data and data[key] is not None:
            fields[key] = data[key]
    fields["updatedAt"] = _now_iso()

    await db.inventory_items.update_one({"id": item_id}, {"$set": fields})
    updated = await db.inventory_items.find_one({"id": item_id}, {"_id": 0})
    return {"success": True, "message": "อัปเดตสินค้าสำเร็จ", "item": updated}


async def delete_item(item_id: str) -> dict:
    db = get_db()
    item = await db.inventory_items.find_one({"id": item_id})
    if not item:
        return {"success": False, "message": "ไม่พบสินค้า"}
    await db.inventory_items.delete_one({"id": item_id})
    await db.inventory_transactions.delete_many({"itemId": item_id})
    return {"success": True, "message": "ลบสินค้าสำเร็จ"}


# ─── Transactions ─────────────────────────────────────────────────────────────

async def _insert_transaction(tx: dict):
    db = get_db()
    tx["id"] = str(uuid.uuid4())
    tx["createdAt"] = _now_iso()
    await db.inventory_transactions.insert_one(tx)


async def create_transaction(data: dict) -> dict:
    db = get_db()
    item = await db.inventory_items.find_one({"id": data["itemId"]})
    if not item:
        return {"success": False, "message": "ไม่พบสินค้า"}

    qty = float(data["quantity"])
    if qty <= 0:
        return {"success": False, "message": "จำนวนต้องมากกว่า 0"}

    tx_type = data["type"]
    qty_before = float(item["currentStock"])

    if tx_type == "receive":
        qty_after = qty_before + qty
    elif tx_type == "issue":
        if qty > qty_before:
            return {"success": False, "message": f"สต็อกไม่พอ (คงเหลือ {qty_before} {item['unit']})"}
        qty_after = qty_before - qty
    elif tx_type == "adjust":
        qty_after = qty
        qty = abs(qty_after - qty_before)
    else:
        return {"success": False, "message": "ประเภทการเคลื่อนไหวไม่ถูกต้อง"}

    await db.inventory_items.update_one(
        {"id": item["id"]},
        {"$set": {"currentStock": qty_after, "updatedAt": _now_iso()}}
    )

    await _insert_transaction({
        "warehouseId":    item.get("warehouseId", ""),
        "itemId":         item["id"],
        "itemCode":       item["code"],
        "itemName":       item["name"],
        "type":           tx_type,
        "quantity":       qty,
        "quantityBefore": qty_before,
        "quantityAfter":  qty_after,
        "unitCost":       float(data.get("unitCost", item.get("unitCost", 0))),
        "reference":      data.get("reference", ""),
        "note":           data.get("note", ""),
        "recorder":       data.get("username", ""),
    })

    updated = await db.inventory_items.find_one({"id": item["id"]}, {"_id": 0})
    return {"success": True, "message": "บันทึกการเคลื่อนไหวสำเร็จ", "item": updated}


async def edit_transaction(tx_id: str, data: dict) -> dict:
    db = get_db()
    tx = await db.inventory_transactions.find_one({"id": tx_id})
    if not tx:
        return {"success": False, "message": "ไม่พบรายการ"}
    item = await db.inventory_items.find_one({"id": tx["itemId"]})
    if not item:
        return {"success": False, "message": "ไม่พบสินค้า"}

    # reverse stock จากรายการเดิม
    old_type = tx["type"]
    old_qty  = float(tx["quantity"])
    current  = float(item["currentStock"])

    if old_type == "receive":
        reversed_stock = current - old_qty
    elif old_type == "issue":
        reversed_stock = current + old_qty
    else:  # adjust — restore to quantityBefore
        reversed_stock = float(tx["quantityBefore"])

    # apply รายการใหม่
    new_type = data.get("type", old_type)
    new_qty  = float(data.get("quantity", old_qty))
    if new_qty <= 0:
        return {"success": False, "message": "จำนวนต้องมากกว่า 0"}

    if new_type == "receive":
        new_stock = reversed_stock + new_qty
    elif new_type == "issue":
        if new_qty > reversed_stock:
            return {"success": False, "message": f"สต็อกไม่พอ (หลัง reverse คงเหลือ {reversed_stock})"}
        new_stock = reversed_stock - new_qty
    else:  # adjust
        new_stock = new_qty

    await db.inventory_items.update_one(
        {"id": item["id"]},
        {"$set": {"currentStock": new_stock, "updatedAt": _now_iso()}}
    )

    update_fields = {
        "type":          new_type,
        "quantity":      new_qty,
        "quantityBefore": reversed_stock,
        "quantityAfter":  new_stock,
        "unitCost":      float(data.get("unitCost", tx.get("unitCost", 0))),
        "reference":     data.get("reference", tx.get("reference", "")),
        "note":          data.get("note", tx.get("note", "")),
        "editedBy":      data.get("username", ""),
        "editedAt":      _now_iso(),
    }
    await db.inventory_transactions.update_one({"id": tx_id}, {"$set": update_fields})
    return {"success": True, "message": "แก้ไขรายการสำเร็จ"}


async def delete_transaction(tx_id: str) -> dict:
    db = get_db()
    tx = await db.inventory_transactions.find_one({"id": tx_id})
    if not tx:
        return {"success": False, "message": "ไม่พบรายการ"}
    item = await db.inventory_items.find_one({"id": tx["itemId"]})
    if not item:
        await db.inventory_transactions.delete_one({"id": tx_id})
        return {"success": True, "message": "ลบรายการสำเร็จ (สินค้าถูกลบแล้ว)"}

    tx_type = tx["type"]
    qty     = float(tx["quantity"])
    current = float(item["currentStock"])

    if tx_type == "receive":
        new_stock = current - qty
    elif tx_type == "issue":
        new_stock = current + qty
    else:  # adjust — restore to quantityBefore
        new_stock = float(tx.get("quantityBefore", current))

    if new_stock < 0:
        return {"success": False, "message": f"ไม่สามารถลบได้ — สต็อกจะติดลบ ({new_stock})"}

    await db.inventory_items.update_one(
        {"id": item["id"]},
        {"$set": {"currentStock": new_stock, "updatedAt": _now_iso()}}
    )
    await db.inventory_transactions.delete_one({"id": tx_id})
    return {"success": True, "message": "ลบรายการและคืนสต็อกสำเร็จ"}


async def get_transactions(warehouse_id: str, item_id: Optional[str] = None, limit: int = 200) -> dict:
    db = get_db()
    query: dict = {"warehouseId": warehouse_id}
    if item_id:
        query["itemId"] = item_id
    cursor = db.inventory_transactions.find(query, {"_id": 0}).sort("createdAt", -1).limit(limit)
    txs = await cursor.to_list(length=limit)
    return {"success": True, "transactions": txs}


# ─── Summary ─────────────────────────────────────────────────────────────────

async def get_summary(warehouse_id: str) -> dict:
    db = get_db()
    items = await db.inventory_items.find({"warehouseId": warehouse_id}, {"_id": 0}).to_list(length=1000)

    total_items = len(items)
    total_value = sum(i["currentStock"] * i["unitCost"] for i in items)
    low_stock = [i for i in items if 0 < i["currentStock"] <= i["minStock"] and i["minStock"] > 0]
    out_of_stock = [i for i in items if i["currentStock"] == 0]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_count = await db.inventory_transactions.count_documents(
        {"warehouseId": warehouse_id, "createdAt": {"$gte": today}}
    )

    # สรุปตาม category
    cat_map: dict = {}
    for i in items:
        cat = i.get("category", "อื่นๆ")
        if cat not in cat_map:
            cat_map[cat] = {"count": 0, "value": 0.0, "stock": 0.0}
        cat_map[cat]["count"] += 1
        cat_map[cat]["value"] = round(cat_map[cat]["value"] + i["currentStock"] * i["unitCost"], 2)
        cat_map[cat]["stock"] += i["currentStock"]

    # top 5 by value
    top5 = sorted(items, key=lambda x: x["currentStock"] * x["unitCost"], reverse=True)[:5]

    return {
        "success": True,
        "summary": {
            "totalItems":      total_items,
            "totalValue":      round(total_value, 2),
            "lowStockCount":   len(low_stock),
            "outOfStockCount": len(out_of_stock),
            "todayMovements":  today_count,
            "byCategory":      cat_map,
            "lowStockItems":   low_stock[:10],
            "topValueItems":   top5,
        }
    }
