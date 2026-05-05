from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ClinicalCaseFactResponse(BaseModel):
    label: str
    value: str
    tone: str | None


class ClinicalCaseQuizOptionResponse(BaseModel):
    label: str
    text: str


class ClinicalCaseQuizQuestionResponse(BaseModel):
    id: str
    prompt: str
    options: list[ClinicalCaseQuizOptionResponse]
    hint: str | None


class ClinicalCaseAnswerFeedbackResponse(BaseModel):
    question_id: str
    selected_option_label: str
    is_correct: bool
    correct_option_label: str
    explanation: str


class ClinicalCaseListItemResponse(BaseModel):
    slug: str
    title: str
    subtitle: str | None
    section_name: str
    topic_name: str
    difficulty: str
    duration_minutes: int
    summary: str
    focus_points: list[str]
    exam_targets: list[str]
    topic_id: int | None


class ClinicalCaseDetailResponse(ClinicalCaseListItemResponse):
    patient_summary: str
    discussion_questions: list[str]
    quiz_questions: list[ClinicalCaseQuizQuestionResponse]
    clinical_facts: list[ClinicalCaseFactResponse]


class ClinicalCaseAnswerRequest(BaseModel):
    question_id: str = Field(min_length=1, max_length=120)
    selected_option_label: str = Field(min_length=1, max_length=1)


class ClinicalCaseAttemptStartRequest(BaseModel):
    topic_id: int | None = None
    planned_task_id: int | None = Field(default=None, ge=1)
    simulation_id: UUID | None = None
    mode: Literal["study", "exam"] = "exam"


class ClinicalCaseAttemptStartResponse(BaseModel):
    attempt_id: UUID
    simulation_id: UUID | None = None
    attempt_context: str
    case_slug: str
    mode: str
    started_at: datetime
    expires_at: datetime
    duration_seconds: int
    server_time: datetime


class ClinicalCaseCompletionRequest(BaseModel):
    attempt_id: UUID | None = None
    slug: str = Field(min_length=1, max_length=120)
    topic_id: int | None = None
    answered_questions: int | None = Field(default=None, ge=1, le=50)
    correct_answers: int | None = Field(default=None, ge=0, le=50)
    study_minutes: int = Field(ge=1, le=240)
    planned_task_id: int | None = Field(default=None, ge=1)
    answers: list[ClinicalCaseAnswerRequest] = Field(default_factory=list, max_length=50)


class ClinicalCaseCompletionResponse(BaseModel):
    attempt_id: UUID
    simulation_id: UUID | None = None
    attempt_context: str
    recorded: bool
    task_completed: bool
    answered_questions: int
    correct_answers: int
    total_questions: int
    accuracy_percent: float
    feedback: list[ClinicalCaseAnswerFeedbackResponse] = Field(default_factory=list)
