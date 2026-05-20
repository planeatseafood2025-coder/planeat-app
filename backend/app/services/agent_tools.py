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


# ─── Placeholder dicts (write executors added in Task 4) ───
EXECUTORS = {
    "getDeals": execute_getDeals,
    "getAccounts": execute_getAccounts,
    "getContacts": execute_getContacts,
    "getActivities": execute_getActivities,
    "getReminders": execute_getReminders,
}

WRITE_EXECUTORS: dict = {}
