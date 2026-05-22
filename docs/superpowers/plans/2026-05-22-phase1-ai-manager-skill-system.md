# AI Manager + Skill System — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง Skill System (CRUD ใน MongoDB) และ AI Manager agent ที่มีสิทธิ์จัดการ agents + skills พร้อม dashboard สำหรับ IT Manager

**Architecture:** Skills เก็บใน MongoDB collection `ai_skills` แต่ละ skill มี `prompt_snippet` + `allowed_tools` เมื่อ agent ถูก assign skills ระบบจะ merge prompt snippets เข้า system prompt และ union allowed_tools โดยอัตโนมัติ AI Manager คือ agent ปกติที่มี `is_manager: true` และถูก assign skill พิเศษที่มี admin tools (listAgents, createAgent, updateAgentSkills)

**Tech Stack:** FastAPI + Motor (async MongoDB), Next.js 14 App Router, TypeScript, Pydantic v2

---

## File Map

**Backend — สร้างใหม่:**
- `backend/app/models/skill.py` — Pydantic models: Skill, SkillCreate
- `backend/app/routers/skills.py` — CRUD endpoints for ai_skills collection
- `backend/app/services/skill_service.py` — business logic: get_skill, list_skills, create_skill, update_skill, delete_skill
- `backend/app/services/manager_tools.py` — tool schemas + executors สำหรับ admin tools (listAgents, createAgent, updateAgentSkills, listSkills, assignSkill)

**Backend — แก้ไข:**
- `backend/app/models/agent.py` — เพิ่ม `skill_ids: List[str]`, `is_manager: bool`
- `backend/app/services/agent_service.py` — merge skills เข้า system prompt + tools ก่อนรัน agentic loop
- `backend/app/routers/agent.py` — เพิ่ม endpoint `GET /api/agent/list` ให้ return ครบ, เพิ่ม endpoint delete agent
- `backend/app/main.py` — include skills router

**Frontend — สร้างใหม่:**
- `frontend/app/(app)/ai-manager/page.tsx` — dashboard: รายการ agents ทั้งหมด + สร้าง/แก้ไข agent
- `frontend/app/(app)/ai-manager/skills/page.tsx` — จัดการ skills (สร้าง/แก้ไข/ลบ)

**Frontend — แก้ไข:**
- `frontend/lib/api.ts` — เพิ่ม skillApi (CRUD), เพิ่ม agentApi.createAgent, agentApi.deleteAgent
- `frontend/components/layout/Sidebar.tsx` — เพิ่ม link ไป /ai-manager สำหรับ IT roles

---

## Task 1: Skill Model + Service (Backend)

**Files:**
- Create: `backend/app/models/skill.py`
- Create: `backend/app/services/skill_service.py`

- [ ] **Step 1: สร้าง Pydantic model สำหรับ Skill**

```python
# backend/app/models/skill.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class Skill(BaseModel):
    skill_id: str
    name: str
    description: str = ""
    prompt_snippet: str = ""
    allowed_tools: List[str] = Field(default_factory=list)
    created_by: str = ""
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class SkillCreate(BaseModel):
    skill_id: str
    name: str
    description: str = ""
    prompt_snippet: str = ""
    allowed_tools: List[str] = Field(default_factory=list)
```

- [ ] **Step 2: สร้าง skill_service.py**

```python
# backend/app/services/skill_service.py
from ..database import get_db
from ..models.skill import Skill, SkillCreate
from datetime import datetime


async def list_skills() -> list[Skill]:
    db = get_db()
    docs = await db.ai_skills.find({}).to_list(None)
    for d in docs:
        d.pop("_id", None)
    return [Skill(**d) for d in docs]


async def get_skill(skill_id: str) -> Skill | None:
    db = get_db()
    doc = await db.ai_skills.find_one({"skill_id": skill_id})
    if not doc:
        return None
    doc.pop("_id", None)
    return Skill(**doc)


async def upsert_skill(data: SkillCreate, username: str) -> Skill:
    db = get_db()
    doc = data.model_dump()
    doc["created_by"] = username
    doc["created_at"] = datetime.utcnow().isoformat()
    await db.ai_skills.update_one(
        {"skill_id": data.skill_id},
        {"$set": doc},
        upsert=True,
    )
    return Skill(**doc)


async def delete_skill(skill_id: str) -> bool:
    db = get_db()
    result = await db.ai_skills.delete_one({"skill_id": skill_id})
    return result.deleted_count > 0
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/skill.py backend/app/services/skill_service.py
git commit -m "feat(skills): add Skill model and skill_service CRUD"
```

---

## Task 2: Skills Router (Backend)

**Files:**
- Create: `backend/app/routers/skills.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: สร้าง skills router**

```python
# backend/app/routers/skills.py
from fastapi import APIRouter, Depends, HTTPException
from ..models.skill import Skill, SkillCreate
from ..services.skill_service import list_skills, get_skill, upsert_skill, delete_skill
from ..routers.auth import get_current_user

router = APIRouter(prefix="/api/skills", tags=["skills"])

IT_ROLES = {"admin", "it_manager", "super_admin"}


def _require_it(current: dict):
    if current.get("role") not in IT_ROLES:
        raise HTTPException(403, "IT manager only")


@router.get("")
async def get_skills(current: dict = Depends(get_current_user)):
    skills = await list_skills()
    return {"skills": [s.model_dump() for s in skills]}


@router.get("/{skill_id}")
async def get_skill_by_id(skill_id: str, current: dict = Depends(get_current_user)):
    skill = await get_skill(skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    return skill.model_dump()


@router.put("/{skill_id}")
async def create_or_update_skill(skill_id: str, body: SkillCreate, current: dict = Depends(get_current_user)):
    _require_it(current)
    body.skill_id = skill_id
    skill = await upsert_skill(body, current.get("username", ""))
    return skill.model_dump()


@router.delete("/{skill_id}")
async def remove_skill(skill_id: str, current: dict = Depends(get_current_user)):
    _require_it(current)
    deleted = await delete_skill(skill_id)
    if not deleted:
        raise HTTPException(404, "Skill not found")
    return {"success": True}
```

- [ ] **Step 2: Register router ใน main.py**

เปิดไฟล์ `backend/app/main.py` หา section ที่ include routers แล้วเพิ่ม:

```python
from .routers import skills as skills_router
# ...
app.include_router(skills_router.router)
```

- [ ] **Step 3: Test endpoints ด้วย curl**

```bash
# สร้าง skill ทดสอบ (ต้องมี JWT token ก่อน)
curl -X PUT http://localhost:8001/api/skills/crm_expert \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"skill_id":"crm_expert","name":"CRM Expert","prompt_snippet":"คุณเชี่ยวชาญด้าน CRM","allowed_tools":["getDeals","getAccounts"]}'

# Expected: {"skill_id":"crm_expert","name":"CRM Expert",...}

curl http://localhost:8001/api/skills \
  -H "Authorization: Bearer <token>"
# Expected: {"skills":[{"skill_id":"crm_expert",...}]}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/skills.py backend/app/main.py
git commit -m "feat(skills): add skills CRUD router and register in main"
```

---

## Task 3: Update AgentConfig + agent_service to support skills

**Files:**
- Modify: `backend/app/models/agent.py`
- Modify: `backend/app/services/agent_service.py`

- [ ] **Step 1: เพิ่ม skill_ids และ is_manager ใน AgentConfig**

เปิด `backend/app/models/agent.py` แก้ class AgentConfig:

```python
# backend/app/models/agent.py
from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime


class AgentConfig(BaseModel):
    id: str = "marketing_agent_1"
    name: str = "PlaNeat AI (การตลาด)"
    avatar: str = "🤖"
    provider: Literal["anthropic", "openai", "google", "openrouter"] = "anthropic"
    model: str = "claude-sonnet-4-6"
    api_key: str = ""
    personality: Literal["friendly", "formal", "concise"] = "friendly"
    tools_enabled: List[str] = Field(default_factory=lambda: [
        "getDeals", "getAccounts", "getContacts",
        "getActivities", "getReminders",
        "createReminder", "logActivity", "createContact",
        "sendPreviewEmail", "sendEmail",
    ])
    role_permissions: dict = Field(default_factory=lambda: {
        "general_user": {
            "read": ["getDeals", "getAccounts", "getContacts", "getActivities", "getReminders"],
            "write": [],
        },
        "marketing_staff": {
            "read": ["getDeals", "getAccounts", "getContacts", "getActivities", "getReminders"],
            "write": ["createReminder", "logActivity", "createContact"],
        },
        "marketing_manager": {
            "read": ["getDeals", "getAccounts", "getContacts", "getActivities", "getReminders"],
            "write": ["createReminder", "logActivity", "createContact", "sendPreviewEmail", "sendEmail"],
        },
        "admin": {"read": ["*"], "write": ["*"]},
        "it_manager": {"read": ["*"], "write": ["*"]},
        "super_admin": {"read": ["*"], "write": ["*"]},
    })
    skill_ids: List[str] = Field(default_factory=list)
    is_manager: bool = False


class AgentChatRequest(BaseModel):
    agent_id: str = "marketing_agent_1"
    message: str
    image_base64: Optional[str] = None
    image_media_type: Optional[str] = None
    pending_email: Optional[dict] = None


class AgentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
```

- [ ] **Step 2: เพิ่ม function `_build_system_prompt_with_skills` ใน agent_service.py**

เปิด `backend/app/services/agent_service.py` เพิ่มฟังก์ชันนี้หลัง import section:

```python
from .skill_service import list_skills as _list_skills_svc


async def _build_system_prompt_with_skills(config: AgentConfig) -> str:
    """Merge base personality prompt + all assigned skill prompt_snippets."""
    base = PERSONALITY_PROMPTS.get(config.personality, PERSONALITY_PROMPTS["friendly"]).format(name=config.name)
    if not config.skill_ids:
        return base
    all_skills = await _list_skills_svc()
    skill_map = {s.skill_id: s for s in all_skills}
    snippets = []
    for sid in config.skill_ids:
        skill = skill_map.get(sid)
        if skill and skill.prompt_snippet:
            snippets.append(f"\n\n--- ความสามารถพิเศษ: {skill.name} ---\n{skill.prompt_snippet}")
    return base + "".join(snippets)
```

- [ ] **Step 3: เพิ่ม function `_get_tools_with_skills` ใน agent_service.py**

เพิ่มฟังก์ชันนี้ใน agent_service.py:

```python
async def _get_tools_with_skills(config: AgentConfig, user_role: str) -> list:
    """Get allowed tool schemas, including tools unlocked by assigned skills."""
    read_tools, write_tools = get_allowed_tools(config, user_role)

    # Merge tools from skills
    if config.skill_ids:
        all_skills = await _list_skills_svc()
        skill_map = {s.skill_id: s for s in all_skills}
        for sid in config.skill_ids:
            skill = skill_map.get(sid)
            if skill:
                for t in skill.allowed_tools:
                    if t not in read_tools:
                        read_tools = list(read_tools) + [t] if read_tools != ["*"] else ["*"]

    all_allowed = list(set(list(read_tools) + list(write_tools))) if ("*" not in list(read_tools) and "*" not in list(write_tools)) else ["*"]

    # For manager agents, also include manager tool schemas
    from .manager_tools import MANAGER_TOOL_SCHEMAS
    if config.is_manager:
        all_allowed_schemas = get_allowed_schemas(all_allowed) + MANAGER_TOOL_SCHEMAS
    else:
        all_allowed_schemas = get_allowed_schemas(all_allowed)

    return all_allowed_schemas
```

- [ ] **Step 4: แก้ฟังก์ชัน `run_agent` ให้ใช้ฟังก์ชันใหม่**

ใน `backend/app/services/agent_service.py` แก้ฟังก์ชัน `run_agent` ส่วนที่สร้าง allowed_schemas และ system_prompt:

```python
async def run_agent(
    req: AgentChatRequest,
    user_username: str,
    user_role: str,
    user_email: str,
    history: list,
) -> dict:
    """Main entry point. Returns {"reply": str, "pending_email": dict | None}"""
    config = await get_agent_config(req.agent_id)

    # Use skill-aware functions
    allowed_schemas = await _get_tools_with_skills(config, user_role)
    system_prompt = await _build_system_prompt_with_skills(config)

    logger.info(f"Agent: provider={config.provider} model={config.model} role={user_role} tools={len(allowed_schemas)} skills={config.skill_ids}")

    # Filter history to only include string-content messages (skip Anthropic tool_result blocks)
    messages = [m for m in history if isinstance(m.get("content"), str)]

    # ... rest of function unchanged ...
```

(เฉพาะ 3 บรรทัดแรกใน run_agent ที่เปลี่ยน ส่วนที่เหลือคงเดิม)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/agent.py backend/app/services/agent_service.py
git commit -m "feat(agent): add skill_ids, is_manager fields; merge skills into system prompt and tools"
```

---

## Task 4: Manager Tools (Backend)

**Files:**
- Create: `backend/app/services/manager_tools.py`

Manager tools คือ tools พิเศษที่มีแค่ AI Manager เท่านั้นที่ใช้ได้ ทำให้ AI Manager สามารถสร้าง/จัดการ agents และ skills ผ่านแชทได้

- [ ] **Step 1: สร้าง manager_tools.py**

```python
# backend/app/services/manager_tools.py
"""
Manager-only tools: เฉพาะ AI Manager (is_manager=True) เท่านั้นที่ใช้ได้
Allows AI Manager to manage agents and skills via chat.
"""
from ..database import get_db
from datetime import datetime
import uuid as _uuid

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
```

- [ ] **Step 2: แก้ agent_service.py ให้ dispatch manager tools ด้วย**

ใน `backend/app/services/agent_service.py` แก้ส่วน tool execution ใน agentic loop ให้รู้จัก manager tools:

```python
# ใน run_agent function, ใน for loop ที่ handle tool calls:
# เพิ่มบรรทัดนี้ก่อน if tool_name in EXECUTORS:
from .manager_tools import MANAGER_EXECUTORS

# แก้ส่วน tool dispatch:
if tool_name in EXECUTORS:
    result = await EXECUTORS[tool_name](tool_input)
elif tool_name in WRITE_EXECUTORS:
    executor = WRITE_EXECUTORS[tool_name]
    if tool_name in ("createReminder", "logActivity", "createContact"):
        result = await executor(tool_input, user_username)
    elif tool_name == "sendPreviewEmail":
        smtp_conf = await get_smtp_conf()
        result = await executor(tool_input, user_email, smtp_conf)
        if result.get("success"):
            pending_email = result.get("pending_email")
    elif tool_name == "sendEmail":
        smtp_conf = await get_smtp_conf()
        result = await executor(tool_input, smtp_conf)
    else:
        result = {"error": "unknown write tool"}
elif tool_name in MANAGER_EXECUTORS:
    result = await MANAGER_EXECUTORS[tool_name](tool_input)
else:
    result = {"error": f"tool {tool_name} not found"}
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/manager_tools.py backend/app/services/agent_service.py
git commit -m "feat(manager): add manager tools (listAgents, createAgent, updateAgentSkills, listSkills, deleteAgent)"
```

---

## Task 5: Agent Router — เพิ่ม delete endpoint + ปรับ list

**Files:**
- Modify: `backend/app/routers/agent.py`

- [ ] **Step 1: เพิ่ม DELETE endpoint และปรับ list ให้ return ครบ**

```python
# backend/app/routers/agent.py
# เพิ่ม endpoint นี้หลัง list_agents:

@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, current: dict = Depends(get_current_user)):
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/routers/agent.py
git commit -m "feat(agent): add DELETE agent endpoint"
```

---

## Task 6: Seed AI Manager agent ใน MongoDB

AI Manager ต้องถูกสร้างใน MongoDB ก่อน โดยใช้ script หรือ endpoint

- [ ] **Step 1: สร้าง seed script**

```python
# backend/seed_manager.py
"""Run once to create AI Manager agent in MongoDB."""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "planeat")

MANAGER_DOC = {
    "id": "ai_manager",
    "name": "AI Manager",
    "avatar": "🧠",
    "provider": "openrouter",
    "model": "openai/gpt-4o-mini",
    "api_key": "",  # ต้องตั้งค่าผ่าน dashboard
    "personality": "formal",
    "skill_ids": [],
    "is_manager": True,
    "tools_enabled": ["*"],
    "role_permissions": {
        "general_user": {"read": [], "write": []},
        "admin": {"read": ["*"], "write": ["*"]},
        "it_manager": {"read": ["*"], "write": ["*"]},
        "super_admin": {"read": ["*"], "write": ["*"]},
    },
}


async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[MONGO_DB]
    existing = await db.ai_agents.find_one({"id": "ai_manager"})
    if existing:
        print("AI Manager already exists")
        return
    await db.ai_agents.insert_one(MANAGER_DOC)
    print("AI Manager created successfully")
    client.close()


asyncio.run(seed())
```

- [ ] **Step 2: รัน seed script บน VPS (หรือ local)**

```bash
# บน local (ถ้า MongoDB accessible):
cd backend
python seed_manager.py

# Expected output:
# AI Manager created successfully
```

- [ ] **Step 3: Commit**

```bash
git add backend/seed_manager.py
git commit -m "feat(manager): add seed script to create AI Manager agent"
```

---

## Task 7: Frontend API functions

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: เพิ่ม skillApi และ update agentApi**

เปิด `frontend/lib/api.ts` หา `agentApi` object แล้วเพิ่ม methods:

```typescript
// ใน agentApi object เพิ่ม:
createAgent: (data: any) => request('POST', '/api/agent/create', data),
deleteAgent: (agentId: string) => request('DELETE', `/api/agent/${agentId}`),
listAgents: () => request('GET', '/api/agent/list'),
```

```typescript
// เพิ่ม skillApi object ใหม่ (หลัง agentApi):
export const skillApi = {
  list: () => request('GET', '/api/skills'),
  get: (skillId: string) => request('GET', `/api/skills/${skillId}`),
  upsert: (skillId: string, data: any) => request('PUT', `/api/skills/${skillId}`, data),
  delete: (skillId: string) => request('DELETE', `/api/skills/${skillId}`),
}
```

หมายเหตุ: `request` คือ function helper ที่มีอยู่แล้วใน api.ts ที่ attach JWT token และ handle errors

- [ ] **Step 2: เพิ่ม endpoint create agent ใน backend**

เปิด `backend/app/routers/agent.py` เพิ่ม:

```python
@router.post("/create")
async def create_agent(body: AgentConfig, current: dict = Depends(get_current_user)):
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
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts backend/app/routers/agent.py
git commit -m "feat(api): add skillApi, createAgent, deleteAgent frontend functions and backend endpoint"
```

---

## Task 8: AI Manager Dashboard Page (Frontend)

**Files:**
- Create: `frontend/app/(app)/ai-manager/page.tsx`

Dashboard สำหรับ IT Manager ดู/สร้าง/ลบ agents และ assign skills

- [ ] **Step 1: สร้าง AI Manager dashboard page**

```tsx
// frontend/app/(app)/ai-manager/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { agentApi, skillApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const IT_ROLES = ['admin', 'it_manager', 'super_admin']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

const PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter']
const PERSONALITIES = ['friendly', 'formal', 'concise']

export default function AiManagerPage() {
  const session = getSession()
  const router = useRouter()

  useEffect(() => {
    if (session && !IT_ROLES.includes(session.role)) router.push('/chat')
  }, [session, router])

  const [agents, setAgents] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newAgent, setNewAgent] = useState({
    id: '', name: '', avatar: '🤖', provider: 'openrouter',
    model: 'openai/gpt-4o-mini', personality: 'friendly',
  })
  const [creating, setCreating] = useState(false)
  const [assigningSkills, setAssigningSkills] = useState<string | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])

  async function loadData() {
    setLoading(true)
    try {
      const [agRes, skRes] = await Promise.all([agentApi.listAgents(), skillApi.list()])
      setAgents((agRes as any).agents || [])
      setSkills((skRes as any).skills || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function handleCreate() {
    if (!newAgent.id || !newAgent.name) return alert('กรุณาใส่ id และชื่อ')
    setCreating(true)
    try {
      await agentApi.createAgent(newAgent)
      setShowCreate(false)
      setNewAgent({ id: '', name: '', avatar: '🤖', provider: 'openrouter', model: 'openai/gpt-4o-mini', personality: 'friendly' })
      await loadData()
    } catch (e: any) { alert(e.message || 'เกิดข้อผิดพลาด') }
    setCreating(false)
  }

  async function handleDelete(agentId: string, agentName: string) {
    if (!confirm(`ลบ agent "${agentName}" ใช่ไหม?`)) return
    try {
      await agentApi.deleteAgent(agentId)
      await loadData()
    } catch (e: any) { alert(e.message || 'ลบไม่ได้') }
  }

  function openAssignSkills(agent: any) {
    setAssigningSkills(agent.id)
    setSelectedSkills(agent.skill_ids || [])
  }

  async function handleSaveSkills() {
    if (!assigningSkills) return
    try {
      await agentApi.updateConfig(assigningSkills, { skill_ids: selectedSkills })
      setAssigningSkills(null)
      await loadData()
    } catch (e: any) { alert(e.message || 'บันทึกไม่ได้') }
  }

  if (session && !IT_ROLES.includes(session.role)) return null

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 900 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>🧠 AI Manager Dashboard</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>จัดการ AI agents และ skills ทั้งหมด</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/ai-manager/skills" style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>
              ⚡ จัดการ Skills
            </Link>
            <button onClick={() => setShowCreate(true)} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + สร้าง Agent ใหม่
            </button>
          </div>
        </div>

        {/* Create Agent Form */}
        {showCreate && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>สร้าง Agent ใหม่</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ID (unique)</label>
                <input value={newAgent.id} onChange={e => setNewAgent(a => ({ ...a, id: e.target.value }))} placeholder="sales_agent_1" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ชื่อ</label>
                <input value={newAgent.name} onChange={e => setNewAgent(a => ({ ...a, name: e.target.value }))} placeholder="Sales AI" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Avatar</label>
                <input value={newAgent.avatar} onChange={e => setNewAgent(a => ({ ...a, avatar: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Provider</label>
                <select value={newAgent.provider} onChange={e => setNewAgent(a => ({ ...a, provider: e.target.value }))} style={inputStyle}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Model</label>
                <input value={newAgent.model} onChange={e => setNewAgent(a => ({ ...a, model: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>บุคลิก</label>
                <select value={newAgent.personality} onChange={e => setNewAgent(a => ({ ...a, personality: e.target.value }))} style={inputStyle}>
                  {PERSONALITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreate} disabled={creating} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                {creating ? 'กำลังสร้าง...' : 'สร้าง Agent'}
              </button>
              <button onClick={() => setShowCreate(false)} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {/* Assign Skills Modal */}
        {assigningSkills && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Assign Skills — {agents.find(a => a.id === assigningSkills)?.name}</h3>
              {skills.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 13 }}>ยังไม่มี skills — <Link href="/ai-manager/skills">สร้าง skill ก่อน</Link></p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {skills.map(s => (
                    <label key={s.skill_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: selectedSkills.includes(s.skill_id) ? '#eff6ff' : '#fff' }}>
                      <input type="checkbox" checked={selectedSkills.includes(s.skill_id)} onChange={() => {
                        setSelectedSkills(prev => prev.includes(s.skill_id) ? prev.filter(x => x !== s.skill_id) : [...prev, s.skill_id])
                      }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{s.description}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Tools: {(s.allowed_tools || []).join(', ') || 'ไม่มี'}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={handleSaveSkills} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>บันทึก</button>
                <button onClick={() => setAssigningSkills(null)} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>ยกเลิก</button>
              </div>
            </div>
          </div>
        )}

        {/* Agent List */}
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: 13, padding: 20 }}>กำลังโหลด...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {agents.map(agent => (
              <div key={agent.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ fontSize: 32 }}>{agent.avatar || '🤖'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{agent.name}</span>
                    {agent.is_manager && <span style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>MANAGER</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {agent.id} · {agent.provider}/{agent.model}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    Skills: {(agent.skill_ids || []).length > 0 ? agent.skill_ids.join(', ') : 'ไม่มี'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openAssignSkills(agent)} style={{ padding: '6px 12px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ⚡ Skills
                  </button>
                  <Link href={`/chat/agent-settings?id=${agent.id}`} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    ⚙️ ตั้งค่า
                  </Link>
                  {!agent.is_manager && (
                    <button onClick={() => handleDelete(agent.id, agent.name)} style={{ padding: '6px 12px', background: '#fff1f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      🗑️ ลบ
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/\(app\)/ai-manager/page.tsx
git commit -m "feat(dashboard): add AI Manager dashboard page with agent list, create, delete, assign skills"
```

---

## Task 9: Skills Management Page (Frontend)

**Files:**
- Create: `frontend/app/(app)/ai-manager/skills/page.tsx`

- [ ] **Step 1: สร้าง skills management page**

```tsx
// frontend/app/(app)/ai-manager/skills/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { skillApi } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const IT_ROLES = ['admin', 'it_manager', 'super_admin']

const ALL_TOOLS = [
  'getDeals', 'getAccounts', 'getContacts', 'getActivities', 'getReminders',
  'createReminder', 'logActivity', 'createContact', 'sendPreviewEmail', 'sendEmail',
  'listAgents', 'createAgent', 'updateAgentSkills', 'listSkills', 'deleteAgent',
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
  borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

const EMPTY_SKILL = { skill_id: '', name: '', description: '', prompt_snippet: '', allowed_tools: [] as string[] }

export default function SkillsPage() {
  const session = getSession()
  const router = useRouter()

  useEffect(() => {
    if (session && !IT_ROLES.includes(session.role)) router.push('/chat')
  }, [session, router])

  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)

  async function loadSkills() {
    setLoading(true)
    try {
      const res = await skillApi.list() as any
      setSkills(res.skills || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadSkills() }, [])

  async function handleSave() {
    if (!editing.skill_id || !editing.name) return alert('กรุณาใส่ skill_id และชื่อ')
    setSaving(true)
    try {
      await skillApi.upsert(editing.skill_id, editing)
      setEditing(null)
      await loadSkills()
    } catch (e: any) { alert(e.message || 'บันทึกไม่ได้') }
    setSaving(false)
  }

  async function handleDelete(skillId: string, skillName: string) {
    if (!confirm(`ลบ skill "${skillName}" ใช่ไหม?`)) return
    try {
      await skillApi.delete(skillId)
      await loadSkills()
    } catch (e: any) { alert(e.message || 'ลบไม่ได้') }
  }

  function toggleTool(tool: string) {
    setEditing((s: any) => ({
      ...s,
      allowed_tools: s.allowed_tools.includes(tool)
        ? s.allowed_tools.filter((t: string) => t !== tool)
        : [...s.allowed_tools, tool],
    }))
  }

  if (session && !IT_ROLES.includes(session.role)) return null

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Link href="/ai-manager" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>← AI Manager</Link>
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>⚡ จัดการ Skills</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Skills คือชุดความสามารถที่ assign ให้ agent ได้</p>
          </div>
          <button onClick={() => setEditing({ ...EMPTY_SKILL })} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + สร้าง Skill ใหม่
          </button>
        </div>

        {/* Edit Form */}
        {editing && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{editing.skill_id ? `แก้ไข: ${editing.name}` : 'สร้าง Skill ใหม่'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Skill ID (unique, ไม่มีช่องว่าง)</label>
                <input value={editing.skill_id} onChange={e => setEditing((s: any) => ({ ...s, skill_id: e.target.value }))} placeholder="crm_sales_expert" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>ชื่อ Skill</label>
                <input value={editing.name} onChange={e => setEditing((s: any) => ({ ...s, name: e.target.value }))} placeholder="CRM Sales Expert" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>คำอธิบาย</label>
              <input value={editing.description} onChange={e => setEditing((s: any) => ({ ...s, description: e.target.value }))} placeholder="วิเคราะห์ deals และบัญชีลูกค้า" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Prompt Snippet (เพิ่มเข้า system prompt)</label>
              <textarea value={editing.prompt_snippet} onChange={e => setEditing((s: any) => ({ ...s, prompt_snippet: e.target.value }))}
                placeholder="คุณเชี่ยวชาญด้านการวิเคราะห์ข้อมูล CRM B2B..."
                style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 8 }}>Tools ที่ skill นี้อนุญาต</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_TOOLS.map(tool => (
                  <button key={tool} onClick={() => toggleTool(tool)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid', borderColor: editing.allowed_tools.includes(tool) ? '#2563eb' : '#e2e8f0', background: editing.allowed_tools.includes(tool) ? '#eff6ff' : '#fff', color: editing.allowed_tools.includes(tool) ? '#1d4ed8' : '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    {editing.allowed_tools.includes(tool) ? '✓ ' : ''}{tool}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                {saving ? 'กำลังบันทึก...' : 'บันทึก Skill'}
              </button>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 20px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>ยกเลิก</button>
            </div>
          </div>
        )}

        {/* Skills List */}
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: 13, padding: 20 }}>กำลังโหลด...</div>
        ) : skills.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            ยังไม่มี skills กด "สร้าง Skill ใหม่" เพื่อเริ่มต้น
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {skills.map(skill => (
              <div key={skill.skill_id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{skill.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{skill.skill_id} · {skill.description}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Tools: {(skill.allowed_tools || []).length > 0 ? skill.allowed_tools.join(', ') : 'ไม่มี'}
                  </div>
                  {skill.prompt_snippet && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📝 {skill.prompt_snippet}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setEditing({ ...skill })} style={{ padding: '6px 12px', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    แก้ไข
                  </button>
                  <button onClick={() => handleDelete(skill.skill_id, skill.name)} style={{ padding: '6px 12px', background: '#fff1f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/\(app\)/ai-manager/skills/page.tsx
git commit -m "feat(dashboard): add Skills management page with create/edit/delete and tool assignment"
```

---

## Task 10: Sidebar Navigation

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: เพิ่ม AI Manager link ใน sidebar สำหรับ IT roles**

เปิด `frontend/components/layout/Sidebar.tsx` หาส่วนที่ render navigation links แล้วเพิ่ม:

```tsx
// เพิ่มใน navigation items สำหรับ IT roles เท่านั้น
// หา section ที่ check role === 'it_manager' หรือ IT_ROLES แล้วเพิ่ม:
{IT_ROLES.includes(session?.role) && (
  <Link href="/ai-manager" ...>
    🧠 AI Manager
  </Link>
)}
```

คำแนะนำ: เปิดไฟล์ Sidebar.tsx ก่อน ดูว่า IT-only links แสดงอย่างไร แล้ว follow pattern เดิม

- [ ] **Step 2: Commit**

```bash
git add frontend/components/layout/Sidebar.tsx
git commit -m "feat(nav): add AI Manager link in sidebar for IT roles"
```

---

## Task 11: Deploy และทดสอบ

- [ ] **Step 1: Build และ deploy ไป VPS**

```bash
# บน local machine:
ssh -i C:/Users/hot/.ssh/planeat-vps root@76.13.211.161

# บน VPS:
cd /root/planeat-app
git pull
docker compose build --no-cache backend frontend
docker compose up -d
```

- [ ] **Step 2: รัน seed script สร้าง AI Manager**

```bash
# บน VPS ใน backend container:
docker compose exec backend python seed_manager.py
# Expected: AI Manager created successfully
```

- [ ] **Step 3: ทดสอบ flow ทั้งหมด**

1. Login ด้วย IT Manager account
2. เข้า sidebar → คลิก "🧠 AI Manager" → เห็น dashboard
3. กด "สร้าง Agent ใหม่" → กรอกข้อมูล → กด "สร้าง" → agent ปรากฏในรายการ
4. เข้า "⚡ จัดการ Skills" → สร้าง skill ใหม่ที่มี prompt_snippet และ allowed_tools
5. กลับ dashboard → กด "⚡ Skills" ของ agent → assign skill → บันทึก
6. เข้าแชทกับ AI Manager → พิมพ์ "รายการ agents ที่มีในระบบ" → AI ควรเรียก listAgents tool และตอบ
7. พิมพ์ "สร้าง agent ชื่อ Sales AI" → AI ควรเรียก createAgent tool

- [ ] **Step 4: Commit หากมี hotfix**

```bash
git add -p  # stage เฉพาะไฟล์ที่แก้
git commit -m "fix: [describe fix]"
git push origin main
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - AI Manager as superagent → Task 4 (manager_tools) + Task 6 (seed)
  - Skill system CRUD → Task 1-2 (backend) + Task 9 (frontend)
  - Dashboard IT → Task 8 (dashboard page)
  - Agent creation → Task 5, 7 (endpoint + frontend)
  - Skill assignment → Task 8 (assign skills modal)
  - Sidebar navigation → Task 10

- [x] **No placeholders:** code ทุก step มีตัวอย่างสมบูรณ์

- [x] **Type consistency:**
  - `skill_ids: List[str]` ใช้ consistent ทั้ง backend model และ frontend
  - `is_manager: bool` ทั้ง Python และ JS
  - `MANAGER_EXECUTORS` dict ใช้ consistent กับ `MANAGER_TOOL_SCHEMAS`
