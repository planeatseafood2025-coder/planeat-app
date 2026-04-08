from pydantic import BaseModel, Field
from typing import Optional, List, Literal

# ─── Field types ─────────────────────────────────────────────────────────────
FieldType = Literal["number", "text", "select"]
CalcRole  = Literal["qty", "price", "addend", "fixed", "note", "none"]

class CategoryField(BaseModel):
    fieldId:     str
    label:       str
    type:        FieldType   = "number"
    unit:        str         = ""
    placeholder: str         = ""
    required:    bool        = True
    calcRole:    CalcRole    = "none"
    options:     List[str]   = []   # สำหรับ type=select

class ReportScheduleItem(BaseModel):
    enabled:        bool = False
    hour:           int  = 8            # 0–23
    lineOaConfigId: str  = ""           # ID ของ LINE OA config ใน settings
    targetId:       str  = ""           # LINE group/user ID (ว่าง=broadcast)

class NotificationSchedule(BaseModel):
    daily:      ReportScheduleItem = ReportScheduleItem()
    weekly:     ReportScheduleItem = ReportScheduleItem()
    weeklyDay:  int = 4                 # 0=จ … 6=อา; default=ศ
    monthly:    ReportScheduleItem = ReportScheduleItem()
    monthlyDay: int = 1                 # วันที่ 1–28

class CreateCategoryRequest(BaseModel):
    name:                 str
    color:                str   = "#3b82f6"
    icon:                 str   = "receipt_long"
    fields:               List[CategoryField] = []
    formula:              str   = "fixed"
    allowedRoles:         List[str] = []
    allowedUsers:         List[str] = []
    order:                int   = 999
    notificationSchedule: Optional[NotificationSchedule] = None

class UpdateCategoryRequest(BaseModel):
    name:                 Optional[str]       = None
    color:                Optional[str]       = None
    icon:                 Optional[str]       = None
    fields:               Optional[List[CategoryField]] = None
    formula:              Optional[str]       = None
    allowedRoles:         Optional[List[str]] = None
    allowedUsers:         Optional[List[str]] = None
    order:                Optional[int]       = None
    isActive:             Optional[bool]      = None
    notificationSchedule: Optional[NotificationSchedule] = None
