from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ExamSimulationCreateRequest(BaseModel):
    simulation_type: str = Field(default="full_accreditation", min_length=1, max_length=40)


class ExamSimulationStageResponse(BaseModel):
    key: str
    status: str
    score_percent: float | None
    passed: bool | None
    details: dict
    started_at: datetime | None
    finished_at: datetime | None


class ExamSimulationResponse(BaseModel):
    id: UUID
    simulation_type: str
    status: str
    score_percent: float | None
    passed: bool | None
    started_at: datetime | None
    expires_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime
    stages: list[ExamSimulationStageResponse]
