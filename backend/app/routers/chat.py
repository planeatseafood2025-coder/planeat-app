from fastapi import APIRouter, Query, Depends
from pydantic import BaseModel
from ..services.chat_service import (
    get_contacts, get_messages, send_message,
    make_room_id, get_conversations,
)
from ..deps import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


class SendMessageRequest(BaseModel):
    content: str


@router.get("/contacts")
async def contacts(current: dict = Depends(get_current_user)):
    return await get_contacts(current["sub"])


@router.get("/conversations")
async def conversations(current: dict = Depends(get_current_user)):
    return await get_conversations(current["sub"])


@router.get("/messages/{other_username}")
async def messages(
    other_username: str,
    limit: int = Query(50, ge=1, le=200),
    before: str = Query(""),
    current: dict = Depends(get_current_user),
):
    room_id = make_room_id(current["sub"], other_username)
    return await get_messages(room_id, limit=limit, before=before)


@router.post("/messages/{other_username}")
async def send(
    other_username: str,
    req: SendMessageRequest,
    current: dict = Depends(get_current_user),
):
    room_id = make_room_id(current["sub"], other_username)
    return await send_message(room_id, sender=current["sub"], content=req.content)
