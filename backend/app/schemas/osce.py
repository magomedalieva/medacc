from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OsceChecklistItemResponse(BaseModel):
    id: str
    title: str
    description: str
    critical: bool


class OsceQuizOptionResponse(BaseModel):
    label: str
    text: str


class OsceQuizQuestionResponse(BaseModel):
    id: str
    prompt: str
    options: list[OsceQuizOptionResponse]


class OsceAttemptHistoryItemResponse(BaseModel):
    id: str
    attempt_context: str
    checklist_score_percent: float
    quiz_score_percent: float
    total_score_percent: float
    score_points: int
    checklist_completed_count: int
    checklist_total_count: int
    quiz_correct_answers: int
    quiz_total_questions: int
    submitted_at: datetime


class OsceStationListItemResponse(BaseModel):
    slug: str
    title: str
    subtitle: str | None
    section_name: str
    topic_name: str
    skill_level: str
    duration_minutes: int
    max_score: int
    summary: str
    best_score_percent: float | None
    best_score_points: int | None
    attempts_count: int
    status: str


class OsceStationDetailResponse(OsceStationListItemResponse):
    checklist_items: list[OsceChecklistItemResponse]
    quiz_questions: list[OsceQuizQuestionResponse]
    attempts: list[OsceAttemptHistoryItemResponse]


class OsceQuizAnswerRequest(BaseModel):
    question_id: str = Field(min_length=1, max_length=120)
    selected_option_label: str = Field(min_length=1, max_length=1)


class OsceAttemptSubmitRequest(BaseModel):
    attempt_id: UUID | None = None
    checklist_item_ids: list[str] = Field(default_factory=list)
    quiz_answers: list[OsceQuizAnswerRequest] = Field(default_factory=list)
    planned_task_id: int | None = Field(default=None, ge=1)


class OsceAttemptStartRequest(BaseModel):
    planned_task_id: int | None = Field(default=None, ge=1)
    simulation_id: UUID | None = None


class OsceAttemptStartResponse(BaseModel):
    attempt_id: UUID
    simulation_id: UUID | None = None
    attempt_context: str
    station_slug: str
    started_at: datetime
    expires_at: datetime
    duration_seconds: int
    server_time: datetime


class OsceQuizFeedbackResponse(BaseModel):
    question_id: str
    is_correct: bool
    correct_option_label: str
    explanation: str


class OsceAttemptSubmitResponse(OsceAttemptHistoryItemResponse):
    station_slug: str
    station_title: str
    quiz_feedback: list[OsceQuizFeedbackResponse]
