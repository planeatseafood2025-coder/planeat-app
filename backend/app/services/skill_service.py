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
