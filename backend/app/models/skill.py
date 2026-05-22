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
