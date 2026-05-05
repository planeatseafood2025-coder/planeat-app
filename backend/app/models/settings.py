from pydantic import BaseModel
from typing import Optional, List

class LineOASetting(BaseModel):
    id: str
    category: str = ""
    name: str = ""
    token: str = ""
    channelId: str = ""
    channelSecret: str = ""
    mode: str = "send"   # "receive", "send", "both"
    targetId: str = ""   # LINE group ID หรือ user ID สำหรับ push

class MainLineOA(BaseModel):
    """การเชื่อมต่อหลัก — ใช้สำหรับ OTP + แจ้งเตือนอนุมัติค่าใช้จ่าย"""
    token: str = ""
    channelId: str = ""
    channelSecret: str = ""
    targetId: str = ""   # Group ID / User ID
    basicId: str = ""    # Basic ID ของ OA เช่น @abc1234 (ใช้สร้าง add friend link)

class ModuleConnections(BaseModel):
    """Target Group ID + ชื่อกลุ่ม + OA ที่ใช้ส่ง แยกต่างหากสำหรับแต่ละโมดูล"""
    expense:        str = ""
    expenseName:    str = ""
    expenseOaId:    str = ""
    inventory:      str = ""
    inventoryName:  str = ""
    inventoryOaId:  str = ""
    crm:            str = ""
    crmName:        str = ""
    crmOaId:        str = ""
    access:         str = ""
    accessName:     str = ""
    accessOaId:     str = ""

class LineLoginConfig(BaseModel):
    clientId: str = ""
    clientSecret: str = ""
    callbackUrl: str = ""

class SystemSettings(BaseModel):
    # ── การเชื่อมต่อหลัก ──
    mainLineOa: Optional[MainLineOA] = None
    lineLogin: Optional[LineLoginConfig] = None
    # ── การเชื่อมต่อขั้นสูง ──
    lineOaConfigs: List[LineOASetting] = []
    moduleConnections: Optional[ModuleConnections] = None
    # ── การเชื่อมต่อเมล ──
    smtpEmail: Optional[str] = ""
    smtpPassword: Optional[str] = ""
    smtpServer: Optional[str] = "smtp.gmail.com"
    smtpPort: Optional[int] = 587
    # ── Budget reminder notifications ──
    budgetReminderEnabled: bool = True
    budgetReminderMessageDay30: str = "📋 เดือนหน้าใกล้มาแล้ว กรุณาระบุงบประมาณประจำเดือน [เดือน] ในระบบ PlaNeat"
    budgetReminderMessageDay4: str = "⚠️ ยังไม่พบการระบุงบประมาณเดือน [เดือน] กรุณาดำเนินการในระบบ PlaNeat"
