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
        "general_user": {"read": [], "write": []},
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
