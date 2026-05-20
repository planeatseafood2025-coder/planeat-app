"""
Agent Service — orchestrates: load config → permission check → LLM call → tool loop → reply
"""
import json
from ..database import get_db
from ..models.agent import AgentConfig, AgentChatRequest
from .llm_adapter import call_llm
from .agent_tools import EXECUTORS, WRITE_EXECUTORS, get_allowed_schemas


PERSONALITY_PROMPTS = {
    "friendly": "คุณเป็น AI assistant ชื่อ {name} ของ PlaNeat ทำงานเป็นทีมการตลาด ตอบภาษาไทย พูดแบบเป็นมิตร ใช้ emoji บ้าง ถ้าไม่มีสิทธิ์เข้าถึงข้อมูลให้บอกว่า 'อุ๊ย ส่วนนี้ผมเข้าไม่ถึงครับ ลองถามผู้จัดการดูนะครับ 😊'",
    "formal": "คุณเป็น AI assistant ชื่อ {name} ของ PlaNeat ตอบภาษาไทยแบบสุภาพ ถ้าไม่มีสิทธิ์เข้าถึงข้อมูลให้บอกว่า 'ขออภัยครับ ข้อมูลส่วนนี้ต้องผ่านผู้จัดการก่อนนะครับ'",
    "concise": "คุณเป็น AI assistant ชื่อ {name} ตอบสั้น กระชับ ภาษาไทย ตรงประเด็น",
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
    """Returns (allowed_read_tools, allowed_write_tools) for this role."""
    role_perms = config.role_permissions.get(user_role, {"read": [], "write": []})
    read_tools = role_perms.get("read", [])
    write_tools = role_perms.get("write", [])

    if "*" not in read_tools:
        read_tools = [t for t in read_tools if t in config.tools_enabled]
    if "*" not in write_tools:
        write_tools = [t for t in write_tools if t in config.tools_enabled]

    return read_tools, write_tools


async def run_agent(
    req: AgentChatRequest,
    user_username: str,
    user_role: str,
    user_email: str,
    history: list,
) -> dict:
    """
    Main entry point. Returns {"reply": str, "pending_email": dict | None}
    """
    config = await get_agent_config(req.agent_id)
    read_tools, write_tools = get_allowed_tools(config, user_role)
    all_allowed = list(set(read_tools + write_tools)) if ("*" not in read_tools and "*" not in write_tools) else ["*"]

    allowed_schemas = get_allowed_schemas(all_allowed)
    system_prompt = PERSONALITY_PROMPTS.get(config.personality, PERSONALITY_PROMPTS["friendly"]).format(name=config.name)

    messages = list(history)

    # Build user message content (supports image for business card)
    if req.image_base64 and config.provider == "anthropic":
        user_content = [
            {"type": "image", "source": {"type": "base64", "media_type": req.image_media_type or "image/jpeg", "data": req.image_base64}},
            {"type": "text", "text": req.message or "อ่านข้อมูลจากนามบัตรนี้แล้วเตรียมเพิ่มเข้าระบบ"},
        ]
    else:
        user_content = req.message

    # If user is confirming a pending email send
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
    for _ in range(5):
        llm_result = await call_llm(
            provider=config.provider,
            model=config.model,
            api_key=config.api_key,
            system_prompt=system_prompt,
            messages=messages,
            tools=allowed_schemas,
        )

        if llm_result["type"] == "text":
            return {"reply": llm_result["content"], "pending_email": pending_email}

        # Handle tool calls
        tool_results = []
        for call in llm_result["calls"]:
            tool_name = call["name"]
            tool_input = call["input"]

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
                result = {"error": f"tool {tool_name} not available for your role"}

            tool_results.append({"tool_use_id": call.get("id", tool_name), "name": tool_name, "result": result})

        # Append tool results back to messages (Anthropic format)
        messages.append({"role": "assistant", "content": llm_result.get("raw_content", [])})
        messages.append({
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": r["tool_use_id"], "content": json.dumps(r["result"], ensure_ascii=False)}
                for r in tool_results
            ],
        })

    return {"reply": "ขออภัยครับ ไม่สามารถประมวลผลได้ในขณะนี้", "pending_email": pending_email}
