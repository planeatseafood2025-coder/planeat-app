"""
crm_workspace.py — Pydantic models สำหรับ CRM Workspace (Multi-business)
"""
from pydantic import BaseModel
from typing import Optional, List


class CreateWorkspaceRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#7c3aed"
    icon: Optional[str] = "business"
    lineOaConfigId: Optional[str] = ""      # ผูก LINE OA config
    memberUsernames: List[str] = []         # username ที่เข้าถึงได้


class UpdateWorkspaceRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    lineOaConfigId: Optional[str] = None
    memberUsernames: Optional[List[str]] = None
