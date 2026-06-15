from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional


OPEN_DEAL_STAGES = {"lead", "qualified", "proposal", "negotiation"}
STALLED_STAGE_THRESHOLDS = {
    "lead": 14,
    "qualified": 21,
    "proposal": 30,
    "negotiation": 45,
}

COUNTRY_META = {
    "thailand": {"countryCode": "TH", "regionKey": "asean", "marketScope": "domestic"},
    "ไทย": {"countryCode": "TH", "regionKey": "asean", "marketScope": "domestic"},
    "japan": {"countryCode": "JP", "regionKey": "east_asia", "marketScope": "international"},
    "ญี่ปุ่น": {"countryCode": "JP", "regionKey": "east_asia", "marketScope": "international"},
    "china": {"countryCode": "CN", "regionKey": "east_asia", "marketScope": "international"},
    "taiwan": {"countryCode": "TW", "regionKey": "east_asia", "marketScope": "international"},
    "south korea": {"countryCode": "KR", "regionKey": "east_asia", "marketScope": "international"},
    "singapore": {"countryCode": "SG", "regionKey": "asean", "marketScope": "international"},
    "malaysia": {"countryCode": "MY", "regionKey": "asean", "marketScope": "international"},
    "vietnam": {"countryCode": "VN", "regionKey": "asean", "marketScope": "international"},
    "indonesia": {"countryCode": "ID", "regionKey": "asean", "marketScope": "international"},
    "philippines": {"countryCode": "PH", "regionKey": "asean", "marketScope": "international"},
    "usa": {"countryCode": "US", "regionKey": "north_america", "marketScope": "international"},
    "united states": {"countryCode": "US", "regionKey": "north_america", "marketScope": "international"},
}


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _number_or_zero(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def _has_coordinates(value: Any) -> bool:
    if not isinstance(value, list) or len(value) != 2:
        return False
    try:
        lng = float(value[0])
        lat = float(value[1])
    except (TypeError, ValueError):
        return False
    return not (lng == 0 and lat == 0)


def derive_account_business_fields(account: dict[str, Any]) -> dict[str, str]:
    country = str(account.get("country") or "").strip()
    meta = COUNTRY_META.get(country.lower(), {})
    fields: dict[str, str] = {}

    if meta.get("countryCode"):
        fields["countryCode"] = meta["countryCode"]
    elif country:
        fields["countryCode"] = str(account.get("countryCode") or "").strip()

    if meta.get("regionKey"):
        fields["regionKey"] = meta["regionKey"]
    elif country:
        fields["regionKey"] = str(account.get("regionKey") or "other").strip()

    if account.get("marketScope"):
        fields["marketScope"] = str(account["marketScope"])
    elif meta.get("marketScope"):
        fields["marketScope"] = meta["marketScope"]
    elif country:
        fields["marketScope"] = "international"

    if _has_coordinates(account.get("coordinates")):
        fields["geoStatus"] = "mapped"
    elif country:
        fields["geoStatus"] = "country_only"
    else:
        fields["geoStatus"] = "unmapped"

    return fields


def get_account_health(last_contact_at: Optional[str], now: Optional[datetime] = None) -> str:
    current = now or datetime.now(timezone.utc)
    last_contact = _parse_datetime(last_contact_at)
    if not last_contact:
        return "dormant"
    age_days = (current - last_contact).days
    if age_days <= 30:
        return "healthy"
    if age_days <= 90:
        return "watchlist"
    return "dormant"


def get_stage_aging_days(deal: dict[str, Any], now: Optional[datetime] = None) -> int:
    current = now or datetime.now(timezone.utc)
    stage_updated_at = _parse_datetime(deal.get("stageUpdatedAt") or deal.get("createdAt"))
    if not stage_updated_at:
        return 0
    return max(0, (current - stage_updated_at).days)


def is_stalled_deal(deal: dict[str, Any], now: Optional[datetime] = None) -> bool:
    stage = str(deal.get("stage") or "").lower()
    if stage not in OPEN_DEAL_STAGES:
        return False
    threshold = STALLED_STAGE_THRESHOLDS.get(stage)
    if threshold is None:
        return False
    return get_stage_aging_days(deal, now) > threshold


def _matches_filters(doc: dict[str, Any], filters: dict[str, str]) -> bool:
    market_scope = filters.get("marketScope", "all")
    country = filters.get("country", "all")
    owner = filters.get("owner", "all")
    if market_scope != "all" and doc.get("marketScope") != market_scope:
        return False
    if country != "all" and doc.get("countryCode") != country and doc.get("country") != country:
        return False
    if owner != "all" and doc.get("owner", doc.get("assignedTo")) != owner:
        return False
    return True


def _is_in_period(doc: dict[str, Any], filters: dict[str, str], now: datetime) -> bool:
    period = filters.get("period", "this_month")
    value = (
        doc.get("wonAt")
        or doc.get("closedAt")
        or doc.get("stageUpdatedAt")
        or doc.get("updatedAt")
        or doc.get("expectedCloseDate")
    )
    date_value = _parse_datetime(value)
    if not date_value:
        return False
    if period == "this_month":
        return date_value.year == now.year and date_value.month == now.month
    if period == "this_quarter":
        return date_value.year == now.year and ((date_value.month - 1) // 3) == ((now.month - 1) // 3)
    if period == "ytd":
        return date_value.year == now.year
    if period == "month":
        year = int(filters.get("year") or now.year)
        month = int(filters.get("month") or now.month)
        return date_value.year == year and date_value.month == month
    return True


async def get_executive_dashboard(db: Any, filters: dict[str, str]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    accounts = await db.crm_accounts.find({}).to_list(None)
    deals = await db.crm_deals_b2b.find({}).to_list(None)
    reminders = await db.crm_reminders_b2b.find({"status": "pending"}).to_list(None)

    account_map = {str(a.get("_id")): a for a in accounts}
    for account in accounts:
        account.update(derive_account_business_fields(account))
        account["accountHealth"] = get_account_health(account.get("lastContactAt") or account.get("lastContact"), now)

    for deal in deals:
        account = account_map.get(str(deal.get("accountId")), {})
        for key in ("marketScope", "country", "countryCode", "assignedTo"):
            if not deal.get(key) and account.get(key):
                deal[key] = account.get(key)
        if not deal.get("owner"):
            deal["owner"] = deal.get("assignedTo") or account.get("assignedTo") or ""

    filtered_accounts = [a for a in accounts if _matches_filters(a, filters)]
    filtered_deals = [d for d in deals if _matches_filters(d, filters)]

    open_deals = [d for d in filtered_deals if str(d.get("stage", "")).lower() in OPEN_DEAL_STAGES]
    won_deals = [
        d for d in filtered_deals
        if str(d.get("stage", "")).lower() == "won" and _is_in_period(d, filters, now)
    ]
    stalled_deals = [d for d in open_deals if is_stalled_deal(d, now)]

    overdue_accounts = [
        a for a in filtered_accounts
        if (follow_at := _parse_datetime(a.get("nextFollowUpAt"))) and follow_at < now
    ]

    def split_value(items: list[dict[str, Any]], value_key: str) -> dict[str, float]:
        domestic = sum(_number_or_zero(item.get(value_key)) for item in items if item.get("marketScope") == "domestic")
        international = sum(_number_or_zero(item.get(value_key)) for item in items if item.get("marketScope") == "international")
        return {"domestic": domestic, "international": international, "total": domestic + international}

    pipeline = split_value(open_deals, "valueThb")
    won = split_value(won_deals, "valueThb")

    return {
        "filters": filters,
        "kpis": {
            "openPipeline": {
                "totalThb": pipeline["total"],
                "domesticThb": pipeline["domestic"],
                "internationalThb": pipeline["international"],
                "openDealCount": len(open_deals),
            },
            "wonThisMonth": {
                "totalThb": won["total"],
                "domesticThb": won["domestic"],
                "internationalThb": won["international"],
                "wonDealCount": len(won_deals),
            },
            "overdueFollowUps": {
                "totalAccounts": len(overdue_accounts),
                "domesticAccounts": len([a for a in overdue_accounts if a.get("marketScope") == "domestic"]),
                "internationalAccounts": len([a for a in overdue_accounts if a.get("marketScope") == "international"]),
            },
            "stalledDeals": {
                "totalDeals": len(stalled_deals),
                "domesticDeals": len([d for d in stalled_deals if d.get("marketScope") == "domestic"]),
                "internationalDeals": len([d for d in stalled_deals if d.get("marketScope") == "international"]),
            },
        },
        "accountHealth": {
            "healthy": len([a for a in filtered_accounts if a.get("accountHealth") == "healthy"]),
            "watchlist": len([a for a in filtered_accounts if a.get("accountHealth") == "watchlist"]),
            "dormant": len([a for a in filtered_accounts if a.get("accountHealth") == "dormant"]),
        },
        "priorityActions": {
            "stalledDeals": [
                {
                    "dealId": str(d.get("_id", "")),
                    "title": d.get("title", ""),
                    "accountId": d.get("accountId", ""),
                    "accountName": d.get("accountName", ""),
                    "marketScope": d.get("marketScope", ""),
                    "stage": d.get("stage", ""),
                    "stageAgingDays": get_stage_aging_days(d, now),
                    "owner": d.get("owner", ""),
                    "valueThb": _number_or_zero(d.get("valueThb")),
                }
                for d in sorted(stalled_deals, key=lambda item: get_stage_aging_days(item, now), reverse=True)[:5]
            ],
            "overdueAccounts": [
                {
                    "accountId": str(a.get("_id", "")),
                    "accountName": a.get("name", ""),
                    "marketScope": a.get("marketScope", ""),
                    "country": a.get("country", ""),
                    "assignedTo": a.get("assignedTo", ""),
                    "lastContactAt": a.get("lastContactAt") or a.get("lastContact"),
                    "nextFollowUpAt": a.get("nextFollowUpAt"),
                    "accountHealth": a.get("accountHealth", ""),
                }
                for a in sorted(overdue_accounts, key=lambda item: item.get("nextFollowUpAt") or "")[:5]
            ],
            "todayReminders": [
                {
                    "reminderId": str(r.get("_id", "")),
                    "accountId": r.get("accountId", ""),
                    "accountName": r.get("accountName", ""),
                    "marketScope": r.get("marketScope", ""),
                    "remindAt": r.get("remindAt"),
                    "priority": r.get("priority", ""),
                    "owner": r.get("owner", ""),
                    "message": r.get("message", ""),
                }
                for r in sorted(reminders, key=lambda item: item.get("remindAt") or "")[:5]
            ],
        },
    }
