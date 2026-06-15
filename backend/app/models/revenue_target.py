from pydantic import BaseModel


class RevenueTargetUpsert(BaseModel):
    year: int
    month: int  # 1-12
    targetThb: float = 0
    domesticTargetThb: float = 0
    internationalTargetThb: float = 0


class CloseMonthRequest(BaseModel):
    year: int
    month: int
    closedActualThb: float
