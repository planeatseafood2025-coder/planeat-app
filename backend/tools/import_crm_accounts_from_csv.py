import asyncio
import csv
import uuid
from datetime import datetime, timezone

from app.database import connect_db, close_db, get_db


def clean(value: str) -> str:
    text = (value or "").strip()
    if text.lower() in {"nan", "none"}:
        return ""
    return text


def norm(value: str) -> str:
    return clean(value).lower()


async def main() -> None:
    await connect_db()
    db = get_db()

    inserted_accounts = 0
    skipped_duplicate_accounts = 0
    inserted_contacts = 0
    skipped_duplicate_contacts = 0
    now = datetime.now(timezone.utc).isoformat()
    file_path = "/app/customer_import_with_address_import_ready.csv"

    with open(file_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = clean(row.get("company_name", ""))
            country = clean(row.get("country", ""))
            email = clean(row.get("email", ""))
            phone = clean(row.get("phone", ""))
            if not name:
                skipped_duplicate_accounts += 1
                continue

            name_norm = norm(name)
            country_norm = norm(country)
            duplicate = await db.crm_accounts.find_one({"nameNorm": name_norm, "countryNorm": country_norm}, {"_id": 1})

            if duplicate:
                account_id = str(duplicate["_id"])
                skipped_duplicate_accounts += 1
            else:
                address = clean(row.get("address", ""))
                import_note = clean(row.get("import_note", ""))
                doc = {
                    "_id": str(uuid.uuid4()),
                    "name": name,
                    "nameNorm": name_norm,
                    "country": country or "ไม่ระบุ",
                    "countryNorm": country_norm,
                    "city": "",
                    "industry": "ไม่ระบุ",
                    "tier": "A" if address else "C",
                    "website": "",
                    "phone": phone,
                    "email": email,
                    "address": address,
                    "status": "active",
                    "assignedTo": "",
                    "currency": "THB",
                    "dealsOpen": 0,
                    "dealsValueThb": 0,
                    "lastContact": "",
                    "notes": import_note or ("ไม่พบที่อยู่" if not address else ""),
                    "coordinates": [0, 0],
                    "createdAt": now,
                    "createdBy": "admin",
                }
                await db.crm_accounts.insert_one(doc)
                account_id = doc["_id"]
                inserted_accounts += 1

            contact_name = clean(row.get("contact_name", "")) or name
            contact_dup = await db.crm_contacts_b2b.find_one(
                {"accountId": account_id, "firstName": contact_name, "email": email, "phone": phone},
                {"_id": 1},
            )
            if contact_dup:
                skipped_duplicate_contacts += 1
                continue

            await db.crm_contacts_b2b.insert_one(
                {
                    "_id": str(uuid.uuid4()),
                    "accountId": account_id,
                    "accountName": name,
                    "firstName": contact_name,
                    "lastName": "",
                    "position": "",
                    "department": "",
                    "email": email,
                    "phone": phone,
                    "preferredLanguage": "th",
                    "isPrimary": True,
                    "notes": "",
                    "createdAt": now,
                }
            )
            inserted_contacts += 1

    await close_db()
    print(
        "CRM_IMPORT_SUMMARY "
        f"inserted_accounts={inserted_accounts} "
        f"skipped_duplicate_accounts={skipped_duplicate_accounts} "
        f"inserted_contacts={inserted_contacts} "
        f"skipped_duplicate_contacts={skipped_duplicate_contacts}"
    )


if __name__ == "__main__":
    asyncio.run(main())
