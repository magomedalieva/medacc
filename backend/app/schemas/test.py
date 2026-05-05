from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import TestSessionMode
from app.schemas.question import QuestionResponse


class TestSessionCreateRequest(BaseModel):
    topic_id: int | None = None
    question_count: int = Field(default=20, ge=1, le=80)
    mode: TestSessionMode = TestSessionMode.LEARNING
    planned_task_id: int | None = Field(default=None, ge=1)
    simulation_id: UUID | None = None
    question_ids: list[int] | None = Field(default=None, min_length=1, max_length=80)


class TestSessionAnswerResultResponse(BaseModel):
    question_id: int
    selected_option_label: str
    is_correct: bool | None
    correct_option_label: str | None
    explanation: str | None


class TestSessionResponse(BaseModel):
    id: UUID
    simulation_id: UUID | None = None
    attempt_context: str
    mode: str
    status: str
    topic_id: int | None
    total_questions: int
    current_index: int
    time_limit_minutes: int | None
    questions: list[QuestionResponse]
    answers: list[TestSessionAnswerResultResponse] = Field(default_factory=list)


class TestSessionAnswerRequest(BaseModel):
    question_id: int
    selected_option_label: str = Field(min_length=1, max_length=1)


class TestSessionAnswerResponse(TestSessionAnswerResultResponse):
    pass


class TestSessionFinishRequest(BaseModel):
    planned_task_id: int | None = Field(default=None, ge=1)


class TestSessionFinishResponse(BaseModel):
    session_id: UUID
    simulation_id: UUID | None = None
    attempt_context: str
    score_percent: float
    correct_answers: int
    answered_questions: int
    total_questions: int
    status: str
    answers: list[TestSessionAnswerResultResponse] = Field(default_factory=list)
