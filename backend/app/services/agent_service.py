"""
Agent Service — orchestrates: load config → permission check → LLM call → tool loop → reply
"""
import json
import logging
from ..database import get_db
from ..models.agent import AgentConfig, AgentChatRequest
from .llm_adapter import call_llm
from .agent_tools import EXECUTORS, WRITE_EXECUTORS, get_allowed_schemas
from .skill_service import list_skills as _list_skills_svc

logger = logging.getLogger(__name__)

READ_ALL_TOOLS = ["getDeals", "getAccounts", "getContacts", "getActivities", "getReminders"]

_BASE_RULES = """
สิ่งที่ทำได้ (มี tool):
- ดูข้อมูล: getDeals, getAccounts, getContacts, getActivities, getReminders
- สร้างใหม่: createReminder, logActivity, createContact
- ส่งอีเมล: sendPreviewEmail, sendEmail

สิ่งที่ทำไม่ได้ (ไม่มี tool) — ต้องบอกตรงๆ และแนะนำให้ไปแก้ในหน้า UI แทน:
- แก้ไข/อัปเดตข้อมูลที่มีอยู่ เช่น เปลี่ยน Tier, แก้ชื่อ, อัปเดต Deal stage
- ลบข้อมูล
- ทำอะไรนอกเหนือจาก tools ที่มี

กฎเด็ดขาด:
1. ถ้าถูกถามเรื่องข้อมูลในระบบ ต้องเรียก tool ก่อนเสมอ
2. ห้ามบอกว่าทำสำเร็จหากไม่มี tool รองรับ — ให้บอกตรงๆ ว่าทำไม่ได้และแนะนำช่องทางที่ถูกต้อง
3. ห้ามแต่งเรื่อง หรืออ้างว่าทำบางอย่างสำเร็จทั้งที่ไม่ได้ทำ
"""

PERSONALITY_PROMPTS = {
    "friendly": (
        "คุณเป็น AI assistant ชื่อ {name} ของ PlaNeat ทำงานช่วยทีมการตลาด ตอบภาษาไทย พูดแบบเป็นมิตร ใช้ emoji บ้าง\n"
        + _BASE_RULES
    ),
    "formal": (
        "คุณเป็น AI assistant ชื่อ {name} ของ PlaNeat ตอบภาษาไทยแบบสุภาพ\n"
        + _BASE_RULES
    ),
    "concise": (
        "คุณเป็น AI assistant ชื่อ {name} ตอบสั้น กระชับ ภาษาไทย\n"
        + _BASE_RULES
    ),
}


async def get_agent_config(agent_id: str) -> AgentConfig:
    db = get_db()
    doc = await db.ai_agents.find_one({"id": agent_id})
    if doc:
        doc.pop("_id", None)
        return AgentConfig(**doc)
    return AgentConfig(id=agent_id)


async def get_smtp_conf() -> dict:
    db = get_db()
    settings = await db.system_settings.find_one({"_id": "settings"})
    if not settings:
        return {}
    smtp = settings.get("smtp", {})
    return {
        "host": smtp.get("host", "smtp.gmail.com"),
        "port": smtp.get("port", 587),
        "username": smtp.get("username", ""),
        "password": smtp.get("password", ""),
        "from_addr": smtp.get("fromAddr", smtp.get("username", "")),
    }


def get_allowed_tools(config: AgentConfig, user_role: str) -> tuple:
    """Returns (allowed_read_tools, allowed_write_tools) for this role.
    All roles can read by default; write is role-restricted.
    """
    role_perms = config.role_permissions.get(user_role, {"read": READ_ALL_TOOLS, "write": []})
    read_tools = role_perms.get("read", READ_ALL_TOOLS)
    write_tools = role_perms.get("write", [])

    # Fallback: if role not found or read is empty, still allow read tools
    if not read_tools:
        read_tools = READ_ALL_TOOLS

    if "*" not in read_tools:
        read_tools = [t for t in read_tools if t in config.tools_enabled]
    if "*" not in write_tools:
        write_tools = [t for t in write_tools if t in config.tools_enabled]

    return read_tools, write_tools


def _build_tool_result_messages(provider: str, llm_result: dict, tool_results: list) -> list:
    """Build tool result messages in the correct format for each provider."""
    if provider == "anthropic":
        return [
            {"role": "assistant", "content": llm_result.get("raw_content", [])},
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": r["tool_use_id"], "content": json.dumps(r["result"], ensure_ascii=False)}
                    for r in tool_results
                ],
            },
        ]
    else:
        # OpenAI / OpenRouter format
        raw_calls = llm_result.get("raw_tool_calls", [])
        assistant_msg = {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": r["tool_use_id"],
                    "type": "function",
                    "function": {"name": r["name"], "arguments": json.dumps(r["result_input"], ensure_ascii=False)},
                }
                for r in tool_results
            ],
        }
        tool_msgs = [
            {"role": "tool", "tool_call_id": r["tool_use_id"], "content": json.dumps(r["result"], ensure_ascii=False)}
            for r in tool_results
        ]
        return [assistant_msg] + tool_msgs


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


async def _get_tools_with_skills(config: AgentConfig, user_role: str) -> list:
    """Get allowed tool schemas, including tools unlocked by assigned skills."""
    read_tools, write_tools = get_allowed_tools(config, user_role)

    # Merge tools from skills
    if config.skill_ids:
        all_skills = await _list_skills_svc()
        skill_map = {s.skill_id: s for s in all_skills}
        skill_extra_tools = []
        for sid in config.skill_ids:
            skill = skill_map.get(sid)
            if skill:
                skill_extra_tools.extend(skill.allowed_tools)
        if "*" not in list(read_tools):
            read_tools = list(read_tools) + [t for t in skill_extra_tools if t not in read_tools]

    all_allowed = (
        list(set(list(read_tools) + list(write_tools)))
        if ("*" not in list(read_tools) and "*" not in list(write_tools))
        else ["*"]
    )

    base_schemas = get_allowed_schemas(all_allowed)

    # For manager agents, also include manager tool schemas
    if config.is_manager:
        from .manager_tools import MANAGER_TOOL_SCHEMAS
        return base_schemas + MANAGER_TOOL_SCHEMAS
    return base_schemas


async def run_agent(
    req: AgentChatRequest,
    user_username: str,
    user_role: str,
    user_email: str,
    history: list,
) -> dict:
    """Main entry point. Returns {"reply": str, "pending_email": dict | None}"""
    config = await get_agent_config(req.agent_id)
    allowed_schemas = await _get_tools_with_skills(config, user_role)
    system_prompt = await _build_system_prompt_with_skills(config)
    logger.info(f"Agent: provider={config.provider} model={config.model} role={user_role} tools={len(allowed_schemas)} skills={config.skill_ids}")

    # Filter history to only include string-content messages (skip Anthropic tool_result blocks)
    messages = [m for m in history if isinstance(m.get("content"), str)]

    # Build user message
    if req.image_base64 and config.provider == "anthropic":
        user_content = [
            {"type": "image", "source": {"type": "base64", "media_type": req.image_media_type or "image/jpeg", "data": req.image_base64}},
            {"type": "text", "text": req.message or "อ่านข้อมูลจากนามบัตรนี้แล้วเตรียมเพิ่มเข้าระบบ"},
        ]
    else:
        user_content = req.message

    # Handle pending email confirmation
    if req.pending_email and any(word in req.message.lower() for word in ["โอเค", "ok", "ส่งได้", "confirm", "ยืนยัน", "ส่งเลย"]):
        smtp_conf = await get_smtp_conf()
        from .agent_tools import execute_sendEmail
        result = await execute_sendEmail(req.pending_email, smtp_conf)
        if result.get("success"):
            return {"reply": f"✅ ส่งอีเมลไปที่ {result['sent_to']} เรียบร้อยแล้วครับ!", "pending_email": None}
        return {"reply": f"❌ ส่งไม่สำเร็จครับ: {result.get('error', 'unknown error')}", "pending_email": req.pending_email}

    messages.append({"role": "user", "content": user_content})

    # Agentic loop — max 5 iterations
    pending_email = None
    for iteration in range(5):
        llm_result = await call_llm(
            provider=config.provider,
            model=config.model,
            api_key=config.api_key.strip(),
            system_prompt=system_prompt,
            messages=messages,
            tools=allowed_schemas,
        )

        logger.info(f"Agent iteration {iteration}: type={llm_result['type']}")

        if llm_result["type"] == "text":
            return {"reply": llm_result["content"], "pending_email": pending_email}

        # Handle tool calls
        tool_results = []
        for call in llm_result["calls"]:
            tool_name = call["name"]
            tool_input = call["input"]
            logger.info(f"Calling tool: {tool_name} input={tool_input}")

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
            else:
                result = {"error": f"tool {tool_name} not found"}

            logger.info(f"Tool {tool_name} result keys: {list(result.keys()) if isinstance(result, dict) else 'non-dict'}")
            tool_results.append({
                "tool_use_id": call.get("id", tool_name),
                "name": tool_name,
                "result": result,
                "result_input": tool_input,
            })

        # Append tool results in provider-correct format
        new_msgs = _build_tool_result_messages(config.provider, llm_result, tool_results)
        messages.extend(new_msgs)

    return {"reply": "ขออภัยครับ ไม่สามารถประมวลผลได้ในขณะนี้", "pending_email": pending_email}
