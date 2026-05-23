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

    try:
        result = await run_agent(req, user_username, user_role, user_email, history)
    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg or "rate" in err_msg.lower():
            reply = "⚠️ โมเดล AI ติด rate limit ครับ กรุณารอสักครู่แล้วลองใหม่ หรือเปลี่ยนโมเดลในหน้าตั้งค่า"
        elif "401" in err_msg or "auth" in err_msg.lower():
            reply = "⚠️ API Key ไม่ถูกต้องครับ กรุณาตรวจสอบในหน้าตั้งค่า AI Agent"
        else:
            reply = f"⚠️ เกิดข้อผิดพลาด: {err_msg[:200]}"
        return {"reply": reply, "pending_email": None}

    now = datetime.datetime.utcnow().isoformat()
    await db.agent_messages.insert_many([
        {"agent_id": req.agent_id, "username": user_username, "role": "user", "content": req.message, "created_at": now},
        {"agent_id": req.agent_id, "username": user_username, "role": "assistant", "content": result["reply"], "created_at": now},
    ])

    return result


@router.get("/history/{agent_id}")
async def get_history(agent_id: str, current: dict = Depends(get_current_user)):
    db = get_db()
    username = current.get("username", "")
    docs = await db.agent_messages.find(
        {"agent_id": agent_id, "username": username}
    ).sort("created_at", 1).limit(100).to_list(None)
    return {"messages": [{"role": d["role"], "content": d["content"], "created_at": d.get("created_at", "")} for d in docs]}


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


@router.get("/activity")
async def get_agent_activity(
    limit: int = 20,
    db=Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") not in IT_ROLES:
        raise HTTPException(status_code=403, detail="Access denied")
    cursor = db.agent_activity.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit)
    activities = await cursor.to_list(length=limit)
    for a in activities:
        if "timestamp" in a and hasattr(a["timestamp"], "isoformat"):
            a["timestamp"] = a["timestamp"].isoformat()
    return {"activities": activities}


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


@router.post("/create")
async def create_agent_endpoint(body: AgentConfig, current: dict = Depends(get_current_user)):
    """Create a new agent (IT roles only)."""
    if current.get("role") not in IT_ROLES:
        raise HTTPException(403, "IT manager only")
    db = get_db()
    existing = await db.ai_agents.find_one({"id": body.id})
    if existing:
        raise HTTPException(400, f"Agent id '{body.id}' already exists")
    doc = body.model_dump()
    await db.ai_agents.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("api_key", None)
    return doc


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, current: dict = Depends(get_current_user)):
    """Delete an agent (IT roles only, cannot delete AI Manager)."""
    if current.get("role") not in IT_ROLES:
        raise HTTPException(403, "IT manager only")
    db = get_db()
    agent = await db.ai_agents.find_one({"id": agent_id})
    if not agent:
        raise HTTPException(404, "Agent not found")
    if agent.get("is_manager"):
        raise HTTPException(400, "Cannot delete AI Manager")
    await db.ai_agents.delete_one({"id": agent_id})
    return {"success": True}
