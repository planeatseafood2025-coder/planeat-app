"""Run once to create AI Manager agent in MongoDB."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "planeat")

MANAGER_DOC = {
    "id": "ai_manager",
    "name": "AI Manager",
    "avatar": "🧠",
    "provider": "openrouter",
    "model": "openai/gpt-4o-mini",
    "api_key": "",
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
        print("AI Manager already exists — skipping")
        client.close()
        return
    await db.ai_agents.insert_one(MANAGER_DOC)
    print("✅ AI Manager created successfully")
    client.close()


asyncio.run(seed())
