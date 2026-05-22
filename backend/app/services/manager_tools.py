"""
Manager-only tools: เฉพาะ AI Manager (is_manager=True) เท่านั้นที่ใช้ได้
Allows AI Manager to manage agents and skills via chat.
"""
from ..database import get_db
from datetime import datetime

MANAGER_TOOL_SCHEMAS = [
    {
        "name": "listAgents",
        "description": "ดูรายการ AI agents ทั้งหมดในระบบ",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "createAgent",
        "description": "สร้าง AI agent ใหม่",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "unique agent id เช่น sales_agent_1"},
                "name": {"type": "string", "description": "ชื่อแสดง เช่น Sales AI"},
                "avatar": {"type": "string", "description": "emoji เช่น 💼"},
                "provider": {"type": "string", "description": "anthropic | openai | google | openrouter"},
                "model": {"type": "string", "description": "ชื่อ model เช่น claude-sonnet-4-6"},
                "personality": {"type": "string", "description": "friendly | formal | concise"},
            },
            "required": ["id", "name", "provider", "model"],
        },
    },
    {
        "name": "updateAgentSkills",
        "description": "เพิ่มหรือลบ skills ของ agent",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "id ของ agent"},
                "skill_ids": {"type": "array", "items": {"type": "string"}, "description": "รายการ skill_ids ทั้งหมดที่ต้องการ assign"},
            },
            "required": ["agent_id", "skill_ids"],
        },
    },
    {
        "name": "listSkills",
        "description": "ดูรายการ skills ทั้งหมดในระบบ",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "deleteAgent",
        "description": "ลบ agent ออกจากระบบ (ไม่สามารถลบ AI Manager ได้)",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_id": {"type": "string", "description": "id ของ agent ที่ต้องการลบ"},
            },
            "required": ["agent_id"],
        },
    },
]


async def execute_listAgents(input: dict) -> dict:
    db = get_db()
    agents = await db.ai_agents.find({}).to_list(None)
    for a in agents:
        a.pop("_id", None)
        a.pop("api_key", None)
    return {"agents": agents, "count": len(agents)}


async def execute_createAgent(input: dict) -> dict:
    db = get_db()
    existing = await db.ai_agents.find_one({"id": input["id"]})
    if existing:
        return {"success": False, "error": f"Agent id '{input['id']}' มีอยู่แล้ว"}
    doc = {
        "id": input["id"],
        "name": input["name"],
        "avatar": input.get("avatar", "🤖"),
        "provider": input.get("provider", "openrouter"),
        "model": input.get("model", "openai/gpt-4o-mini"),
        "personality": input.get("personality", "friendly"),
        "api_key": "",
        "skill_ids": [],
        "is_manager": False,
        "tools_enabled": [],
        "role_permissions": {
            "general_user": {"read": [], "write": []},
            "admin": {"read": ["*"], "write": ["*"]},
            "it_manager": {"read": ["*"], "write": ["*"]},
            "super_admin": {"read": ["*"], "write": ["*"]},
        },
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.ai_agents.insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "agent": doc}


async def execute_updateAgentSkills(input: dict) -> dict:
    db = get_db()
    result = await db.ai_agents.update_one(
        {"id": input["agent_id"]},
        {"$set": {"skill_ids": input["skill_ids"]}},
    )
    if result.matched_count == 0:
        return {"success": False, "error": f"ไม่พบ agent '{input['agent_id']}'"}
    return {"success": True, "agent_id": input["agent_id"], "skill_ids": input["skill_ids"]}


async def execute_listSkills(input: dict) -> dict:
    db = get_db()
    skills = await db.ai_skills.find({}).to_list(None)
    for s in skills:
        s.pop("_id", None)
    return {"skills": skills, "count": len(skills)}


async def execute_deleteAgent(input: dict) -> dict:
    db = get_db()
    agent = await db.ai_agents.find_one({"id": input["agent_id"]})
    if not agent:
        return {"success": False, "error": f"ไม่พบ agent '{input['agent_id']}'"}
    if agent.get("is_manager"):
        return {"success": False, "error": "ไม่สามารถลบ AI Manager ได้"}
    await db.ai_agents.delete_one({"id": input["agent_id"]})
    return {"success": True, "deleted_agent_id": input["agent_id"]}


MANAGER_EXECUTORS = {
    "listAgents": execute_listAgents,
    "createAgent": execute_createAgent,
    "updateAgentSkills": execute_updateAgentSkills,
    "listSkills": execute_listSkills,
    "deleteAgent": execute_deleteAgent,
}
