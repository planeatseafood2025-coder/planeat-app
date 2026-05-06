"""
Shared helpers for user/lineUid lookups.
Centralises the repeated db.users queries found across
line_webhook.py, expense_service.py, auth.py, and worker.py.
"""

from typing import Optional


async def get_user_by_line_uid(db, line_uid: str) -> Optional[dict]:
    """Full user document by lineUid. Returns None if not found."""
    return await db.users.find_one({"lineUid": line_uid})


async def get_user_name_by_line_uid(db, line_uid: str) -> Optional[dict]:
    """Resolve real name fields from lineUid. Returns {username, name, firstName, lastName} or None."""
    return await db.users.find_one(
        {"lineUid": line_uid},
        {"username": 1, "name": 1, "firstName": 1, "lastName": 1, "_id": 0},
    )


async def get_line_uid_by_username(db, username: str) -> str:
    """Return lineUid for a given username, or '' if not found."""
    doc = await db.users.find_one(
        {"username": username},
        {"lineUid": 1, "_id": 0},
    )
    return (doc or {}).get("lineUid", "")


async def get_user_with_line_uid_by_username(db, username: str) -> Optional[dict]:
    """Return {name, firstName, lastName, lineUid} for a given username, or None."""
    return await db.users.find_one(
        {"username": username},
        {"name": 1, "firstName": 1, "lastName": 1, "lineUid": 1, "_id": 0},
    )


async def get_active_users_with_line_uid(db, perm_filter: list) -> list[dict]:
    """Return all active users that have a lineUid and match permission filter.
    perm_filter is a list of $or conditions on permissions field.
    """
    return await db.users.find(
        {
            "status": "active",
            "lineUid": {"$exists": True, "$ne": ""},
            "$or": perm_filter,
        },
        {"lineUid": 1, "name": 1, "firstName": 1, "permissions": 1},
    ).to_list(None)


async def get_customer_by_line_uid(db, line_uid: str, workspace_id: Optional[str] = None) -> Optional[dict]:
    """Find customer document by lineUid, optionally scoped to a workspace."""
    query: dict = {"lineUid": line_uid}
    if workspace_id:
        query["workspaceId"] = workspace_id
    return await db.customers.find_one(query)
