from pydantic import BaseModel
import re
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Query, Depends, HTTPException, BackgroundTasks
from pymongo.errors import DuplicateKeyError
from ..models.crm_b2b import (
    CrmAccountCreate, CrmAccountUpdate,
    CrmContactCreate, CrmContactUpdate,
    EmailCampaignCreate,
    CrmDealCreate, CrmDealUpdate,
    CrmActivityCreate,
    CrmReminderCreate,
)
from ..deps import get_current_user
from ..database import get_db
from ..services.email_service import _send_email_sync

router = APIRouter(prefix="/api/crm-b2b", tags=["crm-b2b"])


def _norm_text(v: Optional[str]) -> str:
    return (v or "").strip().lower()


# Accounts

@router.get("/accounts")
async def list_accounts(
    tier: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    assignedTo: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    sort: Optional[str] = Query("value-desc"),
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=200),
    current: dict = Depends(get_current_user),
):
    db = get_db()
    query: dict = {}
    if tier and tier != "all":
        query["tier"] = tier
    if country and country != "all":
        query["country"] = country
    if assignedTo and assignedTo != "all":
        query["assignedTo"] = assignedTo
    if status and status != "all":
        query["status"] = status
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"country": {"$regex": q, "$options": "i"}},
            {"industry": {"$regex": q, "$options": "i"}},
        ]
    accounts = await db.crm_accounts.find(query).to_list(None)
    for a in accounts:
        a["_id"] = str(a["_id"])
    if sort == "value-desc":
        accounts.sort(key=lambda a: a.get("dealsValueThb", 0), reverse=True)
    elif sort == "name-asc":
        accounts.sort(key=lambda a: a.get("name", "").lower())
    elif sort == "recent":
        accounts.sort(key=lambda a: a.get("lastContact", ""), reverse=True)
    total = len(accounts)
    start = (page - 1) * perPage
    end = start + perPage
    return {
        "accounts": accounts[start:end],
        "total": total,
        "page": page,
        "totalPages": max(1, -(-total // perPage)),
    }


@router.get("/accounts/{account_id}")
async def get_account(account_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    account = await db.crm_accounts.find_one({"_id": account_id})
    if not account:
        raise HTTPException(status_code=404, detail="ไม่พบ account")
    account["_id"] = str(account["_id"])
    return account


@router.post("/accounts")
async def create_account(req: CrmAccountCreate, current: dict = Depends(get_current_user)):
    db = get_db()
    doc = req.dict()
    # Guard against duplicate account created from UI/import
    duplicate = await db.crm_accounts.find_one(
        {
            "nameNorm": _norm_text(doc.get("name")),
            "countryNorm": _norm_text(doc.get("country")),
        },
        {"_id": 1},
    )
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail={"message": "มีบริษัทนี้อยู่แล้วในระบบ", "existingId": str(duplicate["_id"])},
        )

    doc["_id"] = str(uuid.uuid4())
    doc["dealsOpen"] = 0
    doc["dealsValueThb"] = 0
    doc["createdAt"] = datetime.now(timezone.utc).isoformat()
    doc["createdBy"] = current.get("sub", "")
    doc["nameNorm"] = _norm_text(doc.get("name"))
    doc["countryNorm"] = _norm_text(doc.get("country"))
    try:
        await db.crm_accounts.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="มีบริษัทนี้อยู่แล้วในระบบ")
    return {"success": True, "_id": doc["_id"]}


@router.put("/accounts/{account_id}")
async def update_account(account_id: str, req: CrmAccountUpdate, current: dict = Depends(get_current_user)):
    db = get_db()
    updates = {k: v for k, v in req.dict().items() if v is not None}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    await db.crm_accounts.update_one({"_id": account_id}, {"$set": updates})
    return {"success": True}


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    await db.crm_accounts.delete_one({"_id": account_id})
    return {"success": True}


# Overview stats + globe pins

@router.get("/overview")
async def get_overview(current: dict = Depends(get_current_user)):
    db = get_db()
    accounts = await db.crm_accounts.find({}).to_list(None)
    deals = await db.crm_deals_b2b.find({}).to_list(None)
    activities = await db.crm_activities_b2b.find({}).sort("createdAt", -1).limit(5).to_list(None)
    reminders = await db.crm_reminders_b2b.find({"status": "pending"}).sort("remindAt", 1).limit(4).to_list(None)

    for a in accounts:
        a["_id"] = str(a["_id"])
    for d in deals:
        d["_id"] = str(d["_id"])
    for a in activities:
        a["_id"] = str(a["_id"])
    for r in reminders:
        r["_id"] = str(r["_id"])

    open_deals = [d for d in deals if d.get("stage") not in ["won", "lost"]]
    pipeline_thb = sum(d.get("valueThb", 0) for d in open_deals)
    won_thb_mtd = sum(d.get("valueThb", 0) for d in deals if d.get("stage") == "won")

    by_country: dict = {}
    for a in accounts:
        c = a.get("country", "")
        by_country[c] = by_country.get(c, 0) + a.get("dealsValueThb", 0)
    top_countries = sorted(by_country.items(), key=lambda x: x[1], reverse=True)[:6]

    pins = [
        {
            "_id": a["_id"],
            "name": a["name"],
            "country": a.get("country"),
            "city": a.get("city"),
            "tier": a.get("tier"),
            "dealsOpen": a.get("dealsOpen", 0),
            "coordinates": a.get("coordinates", [0, 0]),
        }
        for a in accounts
        if a.get("coordinates") and len(a.get("coordinates", [])) == 2
    ]

    return {
        "stats": {
            "totalAccounts": len(accounts),
            "activeAccounts": len([a for a in accounts if a.get("status") == "active"]),
            "countries": len(set(a.get("country", "") for a in accounts)),
            "pipelineThb": pipeline_thb,
            "wonThbMtd": won_thb_mtd,
            "openDeals": len(open_deals),
        },
        "topCountries": [{"country": c, "value": v} for c, v in top_countries],
        "recentActivities": activities,
        "reminders": reminders,
        "pins": pins,
        "accounts": accounts,
    }


# Contacts

@router.get("/contacts")
async def list_contacts(
    accountId: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=200),
    current: dict = Depends(get_current_user),
):
    db = get_db()
    query: dict = {}
    if accountId:
        query["accountId"] = accountId
    contacts = await db.crm_contacts_b2b.find(query).to_list(None)
    for c in contacts:
        c["_id"] = str(c["_id"])
    total = len(contacts)
    start = (page - 1) * perPage
    end = start + perPage
    return {
        "contacts": contacts[start:end],
        "total": total,
        "page": page,
        "totalPages": max(1, -(-total // perPage)),
    }


@router.post("/contacts")
async def create_contact(req: CrmContactCreate, current: dict = Depends(get_current_user)):
    db = get_db()
    doc = req.dict()
    doc["_id"] = str(uuid.uuid4())
    doc["createdAt"] = datetime.now(timezone.utc).isoformat()
    await db.crm_contacts_b2b.insert_one(doc)
    return {"success": True, "_id": doc["_id"]}


@router.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, req: CrmContactUpdate, current: dict = Depends(get_current_user)):
    db = get_db()
    updates = {k: v for k, v in req.dict().items() if v is not None}
    await db.crm_contacts_b2b.update_one({"_id": contact_id}, {"$set": updates})
    return {"success": True}


@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    await db.crm_contacts_b2b.delete_one({"_id": contact_id})
    return {"success": True}


# Email Campaign

def _fill_template(template: str, ctx: dict) -> str:
    return re.sub(r'\{\{(\w+)\}\}', lambda m: ctx.get(m.group(1), m.group(0)), template)


async def _send_campaign_emails(
    campaign_id: str,
    recipients: list,
    subject_tpl: str,
    body_tpl: str,
    smtp_conf: dict,
    per_hour: int,
):
    db = get_db()
    sent = 0
    failed = 0
    delay = max(0.1, 3600 / max(per_hour, 1))
    for r in recipients:
        ctx = {
            "firstName": r.get("firstName", ""),
            "accountName": r.get("accountName", ""),
            "country": r.get("country", ""),
            "currency": r.get("currency", "USD"),
            "senderName": "PlaNeat CRM",
            "senderCo": "PlaNeat",
        }
        subj = _fill_template(subject_tpl, ctx)
        body_text = _fill_template(body_tpl, ctx)
        html = f"<div style='font-family:sans-serif;line-height:1.6;white-space:pre-wrap;padding:20px;'>{body_text}</div>"
        try:
            await asyncio.to_thread(_send_email_sync, r["email"], subj, html, smtp_conf)
            sent += 1
        except Exception:
            failed += 1
        await db.crm_campaigns.update_one(
            {"_id": campaign_id},
            {"$set": {"sent": sent, "failed": failed}},
        )
        await asyncio.sleep(delay)
    status = "completed"
    await db.crm_campaigns.update_one(
        {"_id": campaign_id},
        {"$set": {"status": status, "completedAt": datetime.now(timezone.utc).isoformat()}},
    )


@router.post("/campaigns")
async def create_campaign(
    req: EmailCampaignCreate,
    background_tasks: BackgroundTasks,
    current: dict = Depends(get_current_user),
):
    db = get_db()
    smtp_conf_doc = await db.system_settings.find_one({"_id": "system_settings"})
    smtp_conf = smtp_conf_doc or {}

    query: dict = {}
    aud = req.audience
    if aud.get("tier") and aud["tier"] != "all":
        query["tier"] = aud["tier"]
    if aud.get("country") and aud["country"] != "all":
        query["country"] = aud["country"]
    if aud.get("status") and aud["status"] != "all":
        query["status"] = aud["status"]

    accounts = await db.crm_accounts.find(query).to_list(None)
    account_ids = [str(a["_id"]) for a in accounts]
    contacts = await db.crm_contacts_b2b.find({"accountId": {"$in": account_ids}}).to_list(None)

    contact_map: dict = {}
    for c in contacts:
        aid = c.get("accountId", "")
        if aid not in contact_map or c.get("isPrimary"):
            contact_map[aid] = c

    recipients = []
    for a in accounts:
        aid = str(a["_id"])
        contact = contact_map.get(aid)
        email = contact.get("email", "") if contact else ""
        if not email:
            continue
        recipients.append({
            "email": email,
            "firstName": contact.get("firstName", a.get("name", "")) if contact else a.get("name", ""),
            "accountName": a.get("name", ""),
            "country": a.get("country", ""),
            "currency": a.get("currency", "USD"),
        })

    campaign_id = str(uuid.uuid4())
    campaign = {
        "_id": campaign_id,
        "name": req.name,
        "subject": req.subject,
        "body": req.body,
        "audience": req.audience,
        "totalRecipients": len(recipients),
        "sent": 0,
        "failed": 0,
        "status": "running",
        "createdBy": current.get("sub", ""),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.crm_campaigns.insert_one(campaign)

    background_tasks.add_task(
        _send_campaign_emails,
        campaign_id, recipients, req.subject, req.body, smtp_conf, req.perHour,
    )
    return {"success": True, "campaignId": campaign_id, "totalRecipients": len(recipients)}


@router.get("/campaigns")
async def list_campaigns(current: dict = Depends(get_current_user)):
    db = get_db()
    campaigns = await db.crm_campaigns.find({}).sort("createdAt", -1).limit(20).to_list(None)
    for c in campaigns:
        c["_id"] = str(c["_id"])
    return {"campaigns": campaigns}


@router.get("/campaigns/{campaign_id}/status")
async def campaign_status(campaign_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    campaign = await db.crm_campaigns.find_one({"_id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="ไม่พบ campaign")
    campaign["_id"] = str(campaign["_id"])
    return campaign


# â”€â”€ Deals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/deals")
async def list_deals(
    accountId: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    assignedTo: Optional[str] = Query(None),
    current: dict = Depends(get_current_user),
):
    db = get_db()
    query: dict = {}
    if accountId:
        query["accountId"] = accountId
    if stage and stage != "all":
        query["stage"] = stage
    if assignedTo and assignedTo != "all":
        query["assignedTo"] = assignedTo
    deals = await db.crm_deals_b2b.find(query).sort("createdAt", -1).to_list(None)
    for d in deals:
        d["_id"] = str(d["_id"])
    return {"deals": deals}


@router.post("/deals")
async def create_deal(req: CrmDealCreate, current: dict = Depends(get_current_user)):
    db = get_db()
    doc = req.dict()
    doc["_id"] = str(uuid.uuid4())
    doc["createdAt"] = datetime.now(timezone.utc).isoformat()
    doc["createdBy"] = current.get("sub", "")
    account = await db.crm_accounts.find_one({"_id": doc["accountId"]})
    if account:
        doc["accountName"] = account.get("name", "")
    await db.crm_deals_b2b.insert_one(doc)
    # Update account dealsOpen count
    open_count = await db.crm_deals_b2b.count_documents({"accountId": doc["accountId"], "stage": {"$nin": ["won", "lost"]}})
    pipeline_val = 0
    async for d in db.crm_deals_b2b.find({"accountId": doc["accountId"]}):
        pipeline_val += d.get("valueThb", 0)
    await db.crm_accounts.update_one({"_id": doc["accountId"]}, {"$set": {"dealsOpen": open_count, "dealsValueThb": pipeline_val}})
    return {"success": True, "_id": doc["_id"]}


@router.put("/deals/{deal_id}")
async def update_deal(deal_id: str, req: CrmDealUpdate, current: dict = Depends(get_current_user)):
    db = get_db()
    updates = {k: v for k, v in req.dict().items() if v is not None}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    await db.crm_deals_b2b.update_one({"_id": deal_id}, {"$set": updates})
    # Refresh account stats
    deal = await db.crm_deals_b2b.find_one({"_id": deal_id})
    if deal:
        aid = deal.get("accountId", "")
        open_count = await db.crm_deals_b2b.count_documents({"accountId": aid, "stage": {"$nin": ["won", "lost"]}})
        pipeline_val = 0
        async for d in db.crm_deals_b2b.find({"accountId": aid}):
            pipeline_val += d.get("valueThb", 0)
        await db.crm_accounts.update_one({"_id": aid}, {"$set": {"dealsOpen": open_count, "dealsValueThb": pipeline_val}})
    return {"success": True}


@router.delete("/deals/{deal_id}")
async def delete_deal(deal_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    deal = await db.crm_deals_b2b.find_one({"_id": deal_id})
    await db.crm_deals_b2b.delete_one({"_id": deal_id})
    if deal:
        aid = deal.get("accountId", "")
        open_count = await db.crm_deals_b2b.count_documents({"accountId": aid, "stage": {"$nin": ["won", "lost"]}})
        pipeline_val = 0
        async for d in db.crm_deals_b2b.find({"accountId": aid}):
            pipeline_val += d.get("valueThb", 0)
        await db.crm_accounts.update_one({"_id": aid}, {"$set": {"dealsOpen": open_count, "dealsValueThb": pipeline_val}})
    return {"success": True}


# â”€â”€ Activities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/activities")
async def list_activities(
    accountId: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    current: dict = Depends(get_current_user),
):
    db = get_db()
    query: dict = {}
    if accountId:
        query["accountId"] = accountId
    if type and type != "all":
        query["type"] = type
    acts = await db.crm_activities_b2b.find(query).sort("createdAt", -1).limit(200).to_list(None)
    for a in acts:
        a["_id"] = str(a["_id"])
    return {"activities": acts}


@router.post("/activities")
async def create_activity(req: CrmActivityCreate, current: dict = Depends(get_current_user)):
    db = get_db()
    doc = req.dict()
    doc["_id"] = str(uuid.uuid4())
    doc["createdAt"] = doc.pop("createdAt", None) or datetime.now(timezone.utc).isoformat()
    doc["createdBy"] = current.get("sub", "")
    account = await db.crm_accounts.find_one({"_id": doc["accountId"]})
    if account:
        doc["accountName"] = account.get("name", "")
        await db.crm_accounts.update_one({"_id": doc["accountId"]}, {"$set": {"lastContact": doc["createdAt"][:10]}})
    await db.crm_activities_b2b.insert_one(doc)
    return {"success": True, "_id": doc["_id"]}


@router.delete("/activities/{activity_id}")
async def delete_activity(activity_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    await db.crm_activities_b2b.delete_one({"_id": activity_id})
    return {"success": True}


# â”€â”€ Reminders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/reminders")
async def list_reminders(
    status: Optional[str] = Query(None),
    accountId: Optional[str] = Query(None),
    current: dict = Depends(get_current_user),
):
    db = get_db()
    query: dict = {}
    if status and status != "all":
        query["status"] = status
    if accountId:
        query["accountId"] = accountId
    reminders = await db.crm_reminders_b2b.find(query).sort("remindAt", 1).to_list(None)
    for r in reminders:
        r["_id"] = str(r["_id"])
    return {"reminders": reminders}


@router.post("/reminders")
async def create_reminder(req: CrmReminderCreate, current: dict = Depends(get_current_user)):
    db = get_db()
    doc = req.dict()
    doc["_id"] = str(uuid.uuid4())
    doc["status"] = "pending"
    doc["createdAt"] = datetime.now(timezone.utc).isoformat()
    doc["createdBy"] = current.get("sub", "")
    account = await db.crm_accounts.find_one({"_id": doc["accountId"]})
    if account:
        doc["accountName"] = account.get("name", "")
    await db.crm_reminders_b2b.insert_one(doc)
    return {"success": True, "_id": doc["_id"]}


@router.put("/reminders/{reminder_id}/done")
async def done_reminder(reminder_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    await db.crm_reminders_b2b.update_one({"_id": reminder_id}, {"$set": {"status": "done", "doneAt": datetime.now(timezone.utc).isoformat()}})
    return {"success": True}


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    await db.crm_reminders_b2b.delete_one({"_id": reminder_id})
    return {"success": True}


class SendContactEmailRequest(BaseModel):
    to: str
    toName: str = ""
    subject: str
    body: str

@router.post("/send-contact-email")
async def send_contact_email(req: SendContactEmailRequest, current: dict = Depends(get_current_user)):
    """ส่งอีเมลหาผู้ติดต่อโดยตรงจากหน้า Contact detail"""
    import asyncio
    db = get_db()
    smtp_doc = await db.system_settings.find_one({"_id": "system_settings"}) or {}
    sender_name = current.get("name") or current.get("sub", "PlaNeat")
    html = f"""<!DOCTYPE html><html><head><meta charset='utf-8'></head>
<body style='font-family:Segoe UI,sans-serif;background:#f4f7fa;margin:0;padding:0;'>
  <div style='max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.07);'>
    <div style='background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:28px 30px;'>
      <h1 style='margin:0;color:#fff;font-size:20px;'>PlaNeat Support</h1>
      <p style='margin:6px 0 0;color:#93c5fd;font-size:13px;'>ข้อความจาก {sender_name}</p>
    </div>
    <div style='padding:30px;'>
      <p style='margin:0 0 6px;font-size:14px;color:#475569;'>เรียน <strong>{req.toName or req.to}</strong>,</p>
      <div style='margin-top:16px;font-size:14px;color:#1e293b;line-height:1.7;white-space:pre-wrap;'>{req.body}</div>
    </div>
    <div style='background:#f1f5f9;padding:16px 30px;text-align:center;font-size:12px;color:#64748b;'>
      PlaNeat Support - ระบบจัดการสำนักงาน
    </div>
  </div>
</body></html>"""
    try:
        await asyncio.to_thread(_send_email_sync, req.to, req.subject, html, smtp_doc)
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}


# â”€â”€â”€ CRM B2B Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CRM_B2B_SETTINGS_ID = "crm_b2b_settings"

@router.get("/settings")
async def get_crm_settings(current: dict = Depends(get_current_user)):
    db = get_db()
    doc = await db.system_settings.find_one({"_id": CRM_B2B_SETTINGS_ID}) or {}
    doc.pop("_id", None)
    return {"success": True, "settings": doc}

class CrmB2bSettingsRequest(BaseModel):
    aiProvider: Optional[str] = None
    aiModel: Optional[str] = None
    aiApiKey: Optional[str] = None
    smtpEmail: Optional[str] = None
    smtpPassword: Optional[str] = None
    smtpServer: Optional[str] = None
    smtpPort: Optional[int] = None
    smtpFromName: Optional[str] = None
    lineGroupId: Optional[str] = None
    lineOaToken: Optional[str] = None
    lineNotifyToken: Optional[str] = None

@router.put("/settings")
async def update_crm_settings(req: CrmB2bSettingsRequest, current: dict = Depends(get_current_user)):
    db = get_db()
    updates = {k: v for k, v in req.dict().items() if v is not None}
    updates["updatedAt"] = datetime.now(timezone.utc).isoformat()
    updates["updatedBy"] = current.get("sub", "")
    await db.system_settings.update_one(
        {"_id": CRM_B2B_SETTINGS_ID},
        {"$set": updates},
        upsert=True,
    )
    return {"success": True}

@router.post("/settings/test-email")
async def test_crm_email(current: dict = Depends(get_current_user)):
    import asyncio as _asyncio
    db = get_db()
    doc = await db.system_settings.find_one({"_id": CRM_B2B_SETTINGS_ID}) or {}
    smtp_conf = {
        "smtpServer": doc.get("smtpServer", "smtp.gmail.com"),
        "smtpPort": doc.get("smtpPort", 587),
        "smtpEmail": doc.get("smtpEmail", ""),
        "smtpPassword": doc.get("smtpPassword", ""),
    }
    test_to = current.get("email") or doc.get("smtpEmail", "")
    if not test_to:
        return {"success": False, "message": "ไม่มีอีเมลสำหรับทดสอบ"}
    try:
        await _asyncio.to_thread(
            _send_email_sync, test_to,
            "PlaNeat CRM - ทดสอบการส่งอีเมล",
            "<p>อีเมล CRM B2B ของคุณทำงานปกติ</p>",
            smtp_conf,
        )
        return {"success": True, "message": f"ส่งทดสอบถึง {test_to} สำเร็จ"}
    except Exception as e:
        return {"success": False, "message": str(e)}
