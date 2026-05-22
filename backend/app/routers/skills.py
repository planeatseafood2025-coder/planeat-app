from fastapi import APIRouter, Depends, HTTPException
from ..models.skill import Skill, SkillCreate
from ..services.skill_service import list_skills, get_skill, upsert_skill, delete_skill
from .auth import get_current_user

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
