from pydantic import BaseModel
from typing import Optional


class RevenueTargetUpsert(BaseModel):
    year: int
    month: int  # 1-12
    targetThb: float = 0
    domesticTargetThb: float = 0
    internationalTargetThb: float = 0


class CloseMonthRequest(BaseModel):
    year: int
    month: int
    closedActualThb: Optional[float] = None  # ถ้าไม่ส่งมา จะคำนวณจากดีล won ในเดือนนั้นอัตโนมัติ
