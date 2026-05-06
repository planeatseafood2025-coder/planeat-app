"""
Thin wrappers around line_notify_service push primitives.
Import these instead of calling _push/_push_to_uid/_notify_personal directly.
"""

from typing import Optional


async def push_to_uid(db, line_uid: str, messages: list) -> bool:
    """Push Flex/text messages to a personal LINE UID using mainLineOa token."""
    from app.services.line_notify_service import _push_to_uid
    return await _push_to_uid(line_uid, messages)


async def push_to_group(token: str, group_id: str, messages: list) -> bool:
    """Push messages to a LINE group using the given OA token."""
    from app.services.line_notify_service import _push
    return await _push(token, group_id, messages)


async def notify_personal(token: str, message: str) -> bool:
    """Send plain-text LINE Notify message. Fallback when user has no lineUid."""
    from app.services.line_notify_service import _notify_personal
    return await _notify_personal(token, message)


async def push_to_uid_or_notify(
    line_uid: Optional[str],
    notify_token: Optional[str],
    messages: list,
    fallback_text: str,
) -> bool:
    """Try push to UID first; fall back to LINE Notify plain text if no UID."""
    if line_uid:
        return await push_to_uid(None, line_uid, messages)
    if notify_token:
        return await notify_personal(notify_token, fallback_text)
    return False


async def get_expense_group(db) -> tuple[str, str]:
    """Return (token, groupId) for the expense module LINE group."""
    from app.services.line_notify_service import _get_expense_group
    return await _get_expense_group()


async def get_users_by_role(db, roles: list) -> list:
    """Return active users matching roles who have lineUid or lineNotifyToken."""
    from app.services.line_notify_service import _get_users_by_role
    return await _get_users_by_role(roles)
