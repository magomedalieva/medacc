from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.clock import today
from app.core.study_schedule import normalize_study_weekdays
from app.models.enums import StudyIntensity
from app.schemas.auth import UserResponse


class PlanTaskResponse(BaseModel):
    id: int
    scheduled_date: date
    task_type: str
    task_variant: str
    intent: str = "training"
    exam_checkpoint_type: str | None = None
    target_route: str = "learning_center"
    completion_source: str | None = None
    linked_simulation_id: UUID | None = None
    title: str
    topic_id: int | None
    topic_name: str | None
    topic_section_name: str | None = None
    osce_station_slug: str | None
    questions_count: int
    estimated_minutes: int
    is_completed: bool
    is_skipped: bool
    is_stale: bool = False
    missed_at: datetime | None = None
    missed_reason: str | None = None
    planner_reason: str | None = None


class PlanEventResponse(BaseModel):
    id: int
    event_type: str
    tone: str
    title: str
    description: str
    created_at: datetime


class PlanTaskRescheduleRequest(BaseModel):
    target_date: date


class SchedulePreferencesUpdateRequest(BaseModel):
    daily_study_minutes: int = Field(ge=20, le=180)
    study_intensity: StudyIntensity
    study_weekdays: list[int] = Field(min_length=1, max_length=7)

    @field_validator("study_weekdays")
    @classmethod
    def validate_study_weekdays(cls, value: list[int]) -> list[int]:
        return normalize_study_weekdays(value)


class ScheduleResponse(BaseModel):
    days_until_accreditation: int | None
    server_today: date = Field(default_factory=today)
    daily_study_seconds: int = 0
    today_study_seconds: int = 0
    remaining_study_seconds: int = 0
    tasks: list[PlanTaskResponse]
    events: list[PlanEventResponse]


class SchedulePreferencesUpdateResponse(BaseModel):
    user: UserResponse
    schedule: ScheduleResponse


class ScheduleTodayResponse(BaseModel):
    scheduled_date: date
    server_today: date = Field(default_factory=today)
    daily_study_seconds: int = 0
    today_study_seconds: int = 0
    remaining_study_seconds: int = 0
    tasks: list[PlanTaskResponse]
