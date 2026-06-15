from pydantic import BaseModel
from typing import Optional, List


class CrmAccountCreate(BaseModel):
    name: str
    industry: str = ""
    country: str = ""
    city: str = ""
    currency: str = "USD"
    language: str = "en"
    timezone: str = "UTC"
    tier: str = "C"
    status: str = "active"
    assignedTo: str = ""
    tags: List[str] = []
    coordinates: List[float] = [0.0, 0.0]
    lastContact: Optional[str] = None
    paymentTerms: str = "NET 30"
    website: Optional[str] = None
    notes: Optional[str] = None


class CrmAccountUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    currency: Optional[str] = None
    language: Optional[str] = None
    timezone: Optional[str] = None
    tier: Optional[str] = None
    status: Optional[str] = None
    assignedTo: Optional[str] = None
    tags: Optional[List[str]] = None
    coordinates: Optional[List[float]] = None
    lastContact: Optional[str] = None
    paymentTerms: Optional[str] = None
    website: Optional[str] = None
    notes: Optional[str] = None


class CrmContactCreate(BaseModel):
    accountId: str
    firstName: str
    lastName: str = ""
    position: str = ""
    department: str = ""
    email: str = ""
    phone: str = ""
    preferredLanguage: str = "en"
    isPrimary: bool = False
    notes: Optional[str] = None


class CrmContactUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    preferredLanguage: Optional[str] = None
    isPrimary: Optional[bool] = None
    notes: Optional[str] = None


class EmailCampaignCreate(BaseModel):
    name: str
    subject: str
    body: str
    audience: dict
    perHour: int = 90
    windowStart: str = "09:00"
    windowEnd: str = "18:00"
    respectTimezone: bool = True


class CrmDealCreate(BaseModel):
    accountId: str
    title: str
    value: float = 0
    currency: str = "USD"
    valueThb: float = 0
    stage: str = "lead"
    probability: int = 10
    assignedTo: str = ""
    expectedCloseDate: Optional[str] = None
    notes: Optional[str] = None
    # Revenue fields
    forecastAmount: float = 0
    forecastDate: Optional[str] = None
    actualAmount: float = 0
    actualReceivedAt: Optional[str] = None
    marketType: str = "domestic"  # domestic | international
    revenueStatus: str = "pending"  # pending | partial | received


class CrmDealUpdate(BaseModel):
    title: Optional[str] = None
    value: Optional[float] = None
    currency: Optional[str] = None
    valueThb: Optional[float] = None
    stage: Optional[str] = None
    probability: Optional[int] = None
    assignedTo: Optional[str] = None
    expectedCloseDate: Optional[str] = None
    notes: Optional[str] = None
    # Revenue fields
    forecastAmount: Optional[float] = None
    forecastDate: Optional[str] = None
    actualAmount: Optional[float] = None
    actualReceivedAt: Optional[str] = None
    marketType: Optional[str] = None
    revenueStatus: Optional[str] = None


class CrmActivityCreate(BaseModel):
    accountId: str
    contactId: Optional[str] = None
    dealId: Optional[str] = None
    type: str = "note"
    note: str = ""
    language: str = "th"
    nextAction: Optional[str] = None
    nextActionDate: Optional[str] = None
    createdAt: Optional[str] = None  # allow backdating; defaults to now if not provided


class CrmReminderCreate(BaseModel):
    accountId: str
    dealId: Optional[str] = None
    message: str
    remindAt: str
    channel: str = "email"
    priority: str = "medium"
