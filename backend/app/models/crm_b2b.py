from pydantic import BaseModel, field_validator
from typing import Optional, List


MAX_PROFILE_PHOTO_LENGTH = 700_000
DEFAULT_ACCOUNT_TIER = "C"


def _validate_profile_photo(value: Optional[str]) -> Optional[str]:
    if value is None or value == "":
        return value
    if not value.startswith("data:image/"):
        raise ValueError("Invalid image data URL")
    if len(value) > MAX_PROFILE_PHOTO_LENGTH:
        raise ValueError("Image file is too large")
    return value


def _norm_text(value: Optional[str]) -> str:
    return (value or "").strip().lower()


class CrmAccountCreate(BaseModel):
    name: str
    industry: str = ""
    country: str = ""
    city: str = ""
    currency: str = "USD"
    language: str = "en"
    timezone: str = "UTC"
    tier: str = DEFAULT_ACCOUNT_TIER
    status: str = "active"
    assignedTo: str = ""
    tags: List[str] = []
    coordinates: List[float] = [0.0, 0.0]
    lastContact: Optional[str] = None
    paymentTerms: str = "NET 30"
    website: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    marketScope: Optional[str] = None
    customerStatus: str = "prospect"
    growthFocus: str = "relationship"
    countryCode: Optional[str] = None
    regionKey: Optional[str] = None
    geoStatus: Optional[str] = None
    lastContactAt: Optional[str] = None
    nextFollowUpAt: Optional[str] = None


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
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    marketScope: Optional[str] = None
    customerStatus: Optional[str] = None
    growthFocus: Optional[str] = None
    countryCode: Optional[str] = None
    regionKey: Optional[str] = None
    geoStatus: Optional[str] = None
    lastContactAt: Optional[str] = None
    nextFollowUpAt: Optional[str] = None


def build_account_update_payload(req: CrmAccountUpdate) -> dict:
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if "name" in updates:
        updates["nameNorm"] = _norm_text(updates.get("name"))
    if "country" in updates:
        updates["countryNorm"] = _norm_text(updates.get("country"))
    return updates


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
    profilePhoto: Optional[str] = None

    @field_validator("profilePhoto")
    @classmethod
    def validate_profile_photo(cls, value: Optional[str]) -> Optional[str]:
        return _validate_profile_photo(value)


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
    profilePhoto: Optional[str] = None

    @field_validator("profilePhoto")
    @classmethod
    def validate_profile_photo(cls, value: Optional[str]) -> Optional[str]:
        return _validate_profile_photo(value)


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
    dealType: str = "new_business"
    owner: Optional[str] = None
    marketScope: Optional[str] = None
    country: Optional[str] = None
    countryCode: Optional[str] = None
    stageUpdatedAt: Optional[str] = None
    priority: str = "medium"
    riskLevel: str = "low"
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
    dealType: Optional[str] = None
    owner: Optional[str] = None
    marketScope: Optional[str] = None
    country: Optional[str] = None
    countryCode: Optional[str] = None
    stageUpdatedAt: Optional[str] = None
    priority: Optional[str] = None
    riskLevel: Optional[str] = None
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
    outcome: Optional[str] = None
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
    owner: Optional[str] = None
    marketScope: Optional[str] = None
