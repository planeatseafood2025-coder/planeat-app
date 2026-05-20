"""
Agent tool definitions (schemas for LLM) + execution functions.
All execute_* functions return a plain dict result.
"""
from typing import Optional
from ..database import get_db
from datetime import datetime, timezone


# ─── Tool Schemas (Anthropic format, OpenAI adapter converts automatically) ───

TOOL_SCHEMAS = [
    {
        "name": "getDeals",
        "description": "ดึงรายการ deals จาก CRM B2B สามารถ filter ตาม stage หรือ assignedTo ได้",
        "input_schema": {
            "type": "object",
            "properties": {
                "stage": {"type": "string", "description": "lead | qualified | proposal | negotiation | won | lost"},
                "assignedTo": {"type": "string", "description": "username ของเซลล์"},
                "limit": {"type": "integer", "description": "จำนวนสูงสุด default 20"},
            },
        },
    },
    {
        "name": "getAccounts",
        "description": "ดึงรายการบริษัทลูกค้า สามารถ filter ตาม tier, country, status",
        "input_schema": {
            "type": "object",
            "properties": {
                "tier": {"type": "string", "description": "A | B | C"},
                "country": {"type": "string"},
                "status": {"type": "string", "description": "active | inactive"},
                "q": {"type": "string", "description": "ค้นหาชื่อบริษัท"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "getContacts",
        "description": "ดึงรายชื่อผู้ติดต่อ สามารถค้นหาด้วยชื่อหรือ filter ตาม accountId",
        "input_schema": {
            "type": "object",
            "properties": {
                "q": {"type": "string", "description": "ค้นหาชื่อ/อีเมล/ตำแหน่ง"},
                "accountId": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "getActivities",
        "description": "ดึงกิจกรรมล่าสุด เช่น การโทร การประชุม",
        "input_schema": {
            "type": "object",
            "properties": {
                "accountId": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "getReminders",
        "description": "ดึง reminders ที่ยังค้างอยู่",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "pending | done"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "createReminder",
        "description": "สร้าง reminder ใหม่",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "หัวข้อ reminder — required"},
                "dueDate": {"type": "string", "description": "วันที่ ISO format เช่น 2026-05-21T10:00:00"},
                "accountId": {"type": "string"},
                "note": {"type": "string"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "logActivity",
        "description": "บันทึกกิจกรรม เช่น โทรหาลูกค้า ประชุม ส่งอีเมล",
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "description": "call | meeting | email | note"},
                "accountId": {"type": "string", "description": "required"},
                "note": {"type": "string", "description": "รายละเอียด"},
                "outcome": {"type": "string"},
            },
            "required": ["type", "accountId"],
        },
    },
    {
        "name": "createContact",
        "description": "เพิ่มผู้ติดต่อใหม่เข้าระบบ ใช้หลังจากผู้ใช้ยืนยันข้อมูลแล้ว",
        "input_schema": {
            "type": "object",
            "properties": {
                "firstName": {"type": "string", "description": "required"},
                "lastName": {"type": "string"},
                "position": {"type": "string"},
                "department": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "accountId": {"type": "string", "description": "required — _id ของบริษัท"},
                "notes": {"type": "string"},
            },
            "required": ["firstName", "accountId"],
        },
    },
    {
        "name": "sendPreviewEmail",
        "description": "สร้าง HTML email สวยงามและส่ง preview ไปหาผู้ใช้ที่สั่ง ก่อนส่งจริง",
        "input_schema": {
            "type": "object",
            "properties": {
                "toContactId": {"type": "string", "description": "_id ของ contact ที่จะส่งจริง"},
                "subject": {"type": "string", "description": "required"},
                "htmlBody": {"type": "string", "description": "HTML email content — required"},
            },
            "required": ["toContactId", "subject", "htmlBody"],
        },
    },
    {
        "name": "sendEmail",
        "description": "ส่งอีเมลจริงไปหา contact หลังจากผู้ใช้ confirm แล้วเท่านั้น",
        "input_schema": {
            "type": "object",
            "properties": {
                "toContactId": {"type": "string", "description": "required"},
                "subject": {"type": "string", "description": "required"},
                "htmlBody": {"type": "string", "description": "required"},
            },
            "required": ["toContactId", "subject", "htmlBody"],
        },
    },
]


def get_allowed_schemas(allowed_tools: list) -> list:
    """Return only tool schemas that are in allowed_tools list."""
    if "*" in allowed_tools:
        return TOOL_SCHEMAS
    return [t for t in TOOL_SCHEMAS if t["name"] in allowed_tools]


# ─── Read Tool Executors ───

async def execute_getDeals(input: dict) -> dict:
    db = get_db()
    query = {}
    if input.get("stage"):
        query["stage"] = input["stage"]
    if input.get("assignedTo"):
        query["assignedTo"] = input["assignedTo"]
    limit = min(int(input.get("limit", 20)), 50)
    deals = await db.crm_deals_b2b.find(query).limit(limit).to_list(None)
    for d in deals:
        d["_id"] = str(d["_id"])
    return {"deals": deals, "count": len(deals)}


async def execute_getAccounts(input: dict) -> dict:
    db = get_db()
    query = {}
    if input.get("tier"):
        query["tier"] = input["tier"]
    if input.get("country"):
        query["country"] = input["country"]
    if input.get("status"):
        query["status"] = input["status"]
    if input.get("q"):
        import re
        query["name"] = {"$regex": re.escape(input["q"]), "$options": "i"}
    limit = min(int(input.get("limit", 20)), 50)
    accounts = await db.crm_accounts.find(query).limit(limit).to_list(None)
    for a in accounts:
        a["_id"] = str(a["_id"])
    return {"accounts": accounts, "count": len(accounts)}


async def execute_getContacts(input: dict) -> dict:
    db = get_db()
    query = {}
    if input.get("accountId"):
        query["accountId"] = input["accountId"]
    if input.get("q"):
        import re
        q = re.escape(input["q"])
        query["$or"] = [
            {"firstName": {"$regex": q, "$options": "i"}},
            {"lastName": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"position": {"$regex": q, "$options": "i"}},
        ]
    limit = min(int(input.get("limit", 20)), 50)
    contacts = await db.crm_contacts_b2b.find(query).limit(limit).to_list(None)
    for c in contacts:
        c["_id"] = str(c["_id"])
    return {"contacts": contacts, "count": len(contacts)}


async def execute_getActivities(input: dict) -> dict:
    db = get_db()
    query = {}
    if input.get("accountId"):
        query["accountId"] = input["accountId"]
    limit = min(int(input.get("limit", 20)), 50)
    activities = await db.crm_activities_b2b.find(query).sort("createdAt", -1).limit(limit).to_list(None)
    for a in activities:
        a["_id"] = str(a["_id"])
    return {"activities": activities, "count": len(activities)}


async def execute_getReminders(input: dict) -> dict:
    db = get_db()
    query = {"status": input.get("status", "pending")}
    limit = min(int(input.get("limit", 20)), 50)
    reminders = await db.crm_reminders_b2b.find(query).sort("dueDate", 1).limit(limit).to_list(None)
    for r in reminders:
        r["_id"] = str(r["_id"])
    return {"reminders": reminders, "count": len(reminders)}


# ─── Write Tool Executors ───

import uuid as _uuid


async def execute_createReminder(input: dict, created_by: str) -> dict:
    db = get_db()
    doc = {
        "_id": str(_uuid.uuid4()),
        "title": input["title"],
        "dueDate": input.get("dueDate", ""),
        "accountId": input.get("accountId", ""),
        "note": input.get("note", ""),
        "status": "pending",
        "createdBy": created_by,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.crm_reminders_b2b.insert_one(doc)
    return {"success": True, "reminderId": doc["_id"], "title": doc["title"], "dueDate": doc["dueDate"]}


async def execute_logActivity(input: dict, created_by: str) -> dict:
    db = get_db()
    doc = {
        "_id": str(_uuid.uuid4()),
        "type": input["type"],
        "accountId": input["accountId"],
        "note": input.get("note", ""),
        "outcome": input.get("outcome", ""),
        "createdBy": created_by,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.crm_activities_b2b.insert_one(doc)
    await db.crm_accounts.update_one(
        {"_id": doc["accountId"]},
        {"$set": {"lastContact": doc["createdAt"][:10]}},
    )
    return {"success": True, "activityId": doc["_id"]}


async def execute_createContact(input: dict, created_by: str) -> dict:
    db = get_db()
    doc = {
        "_id": str(_uuid.uuid4()),
        "firstName": input["firstName"],
        "lastName": input.get("lastName", ""),
        "position": input.get("position", ""),
        "department": input.get("department", ""),
        "email": input.get("email", ""),
        "phone": input.get("phone", ""),
        "accountId": input["accountId"],
        "notes": input.get("notes", ""),
        "isPrimary": False,
        "preferredLanguage": "th",
        "createdBy": created_by,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.crm_contacts_b2b.insert_one(doc)
    return {"success": True, "contactId": doc["_id"], "name": f"{doc['firstName']} {doc['lastName']}".strip()}


async def execute_sendPreviewEmail(input: dict, requester_email: str, smtp_conf: dict) -> dict:
    """Send draft email to requester for review. Returns pending_email dict for later confirm."""
    import html as _html
    db = get_db()
    contact = await db.crm_contacts_b2b.find_one({"_id": input["toContactId"]})
    contact_name = f"{contact.get('firstName','')} {contact.get('lastName','')}".strip() if contact else input["toContactId"]
    contact_email = contact.get("email", "") if contact else ""

    preview_html = f"""
    <div style="background:#fef3c7;border:2px dashed #f59e0b;padding:12px;margin-bottom:16px;border-radius:8px;font-family:sans-serif;font-size:13px;color:#92400e">
      ⚠️ <strong>PREVIEW EMAIL</strong> — จะส่งจริงไปหา <strong>{_html.escape(contact_name)}</strong> ({_html.escape(contact_email)}) หลัง confirm
    </div>
    {input['htmlBody']}
    """
    await _send_email_async(requester_email, f"[PREVIEW] {input['subject']}", preview_html, smtp_conf)

    return {
        "success": True,
        "preview_sent_to": requester_email,
        "pending_email": {
            "toContactId": input["toContactId"],
            "toContactName": contact_name,
            "toContactEmail": contact_email,
            "subject": input["subject"],
            "htmlBody": input["htmlBody"],
        },
    }


async def execute_sendEmail(input: dict, smtp_conf: dict) -> dict:
    """Send email for real — only called after user confirms."""
    db = get_db()
    contact = await db.crm_contacts_b2b.find_one({"_id": input["toContactId"]})
    if not contact or not contact.get("email"):
        return {"success": False, "error": "ไม่พบอีเมลของผู้รับ"}
    await _send_email_async(contact["email"], input["subject"], input["htmlBody"], smtp_conf)
    return {"success": True, "sent_to": contact["email"]}


async def _send_email_async(to: str, subject: str, html: str, smtp_conf: dict):
    import asyncio
    from .email_service import send_email_sync
    await asyncio.to_thread(send_email_sync, to, subject, html, smtp_conf)


# ─── Dispatchers ───

EXECUTORS = {
    "getDeals": execute_getDeals,
    "getAccounts": execute_getAccounts,
    "getContacts": execute_getContacts,
    "getActivities": execute_getActivities,
    "getReminders": execute_getReminders,
}

WRITE_EXECUTORS = {
    "createReminder": execute_createReminder,
    "logActivity": execute_logActivity,
    "createContact": execute_createContact,
    "sendPreviewEmail": execute_sendPreviewEmail,
    "sendEmail": execute_sendEmail,
}
