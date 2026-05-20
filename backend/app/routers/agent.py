from fastapi import APIRouter, Depends, HTTPException
from ..models.agent import AgentChatRequest, AgentConfig
from ..services.agent_service import run_agent, get_agent_config
from ..routers.auth import get_current_user
from ..database import get_db
import datetime

router = APIRouter(prefix="/api/agent", tags=["agent"])

IT_ROLES = {"admin", "it_manager", "super_admin"}


@router.post("/chat")
async def agent_chat(
    req: AgentChatRequest,
    current: dict = Depends(get_current_user),
):
    db = get_db()
    user_role = current.get("role", "general_user")
    user_username = current.get("username", "")
    user_email = current.get("email", "")

    # Load recent history (last 20 messages)
    history_docs = await db.agent_messages.find(
        {"agent_id": req.agent_id, "username": user_username}
    ).sort("created_at", -1).limit(20).to_list(None)
    history = [{"role": d["role"], "content": d["content"]} for d in reversed(history_docs)]

    result = await run_agent(req, user_username, user_role, user_email, history)

    now = datetime.datetime.utcnow().isoformat()
    await db.agent_messages.insert_many([
        {"agent_id": req.agent_id, "username": user_username, "role": "user", "content": req.message, "created_at": now},
        {"agent_id": req.agent_id, "username": user_username, "role": "assistant", "content": result["reply"], "created_at": now},
    ])

    return result


@router.get("/config/{agent_id}")
async def get_config(agent_id: str, current: dict = Depends(get_current_user)):
    if current.get("role") not in IT_ROLES:
        raise HTTPException(403, "IT manager only")
    config = await get_agent_config(agent_id)
    return config.model_dump()


@router.put("/config/{agent_id}")
async def update_config(agent_id: str, body: AgentConfig, current: dict = Depends(get_current_user)):
    if current.get("role") not in IT_ROLES:
        raise HTTPException(403, "IT manager only")
    db = get_db()
    doc = body.model_dump()
    doc["id"] = agent_id
    await db.ai_agents.update_one({"id": agent_id}, {"$set": doc}, upsert=True)
    return {"success": True}


@router.get("/list")
async def list_agents(current: dict = Depends(get_current_user)):
    """Return all configured agents (api_key stripped)."""
    db = get_db()
    agents = await db.ai_agents.find({}).to_list(None)
    if not agents:
        return {"agents": [{"id": "marketing_agent_1", "name": "PlaNeat AI (การตลาด)", "avatar": "🤖", "provider": "anthropic"}]}
    for a in agents:
        a.pop("_id", None)
        a.pop("api_key", None)
    return {"agents": agents}
