from datetime import date, datetime

from pydantic import BaseModel, Field


class AnalyticsOverviewResponse(BaseModel):
    total_answered: int
    correct_answers: int
    accuracy_percent: float
    completed_sessions: int
    initial_diagnostic_completed: bool = False
    latest_initial_diagnostic_score_percent: float | None = None
    non_diagnostic_completed_sessions: int = 0
    streak_days: int
    days_until_accreditation: int | None


class TopicAnalyticsResponse(BaseModel):
    topic_id: int
    topic_name: str
    section_name: str
    answered_questions: int
    correct_answers: int
    test_incorrect_answers: int
    accuracy_percent: float
    status: str
    case_attempts_count: int
    repeated_question_struggles: int
    hard_question_accuracy_percent: float | None
    last_activity_at: datetime | None
    recent_struggle_at: datetime | None


class TopicQuestionErrorOptionResponse(BaseModel):
    label: str
    text: str


class TopicQuestionErrorAnalyticsResponse(BaseModel):
    question_id: int
    question_text: str
    difficulty: str
    attempts_count: int
    incorrect_answers: int
    correct_answers: int
    accuracy_percent: float
    last_seen_at: datetime
    last_incorrect_at: datetime | None
    last_selected_option_label: str | None
    last_selected_option_text: str | None
    correct_option_label: str | None
    correct_option_text: str | None
    explanation: str | None
    answer_options: list[TopicQuestionErrorOptionResponse]


class ClinicalCaseAttemptAnalyticsResponse(BaseModel):
    id: str
    case_slug: str
    case_title: str
    topic_id: int | None
    topic_name: str | None
    answered_questions: int
    correct_answers: int
    accuracy_percent: float
    study_minutes: int
    submitted_at: datetime


class ClinicalCaseAttemptReviewItemResponse(BaseModel):
    question_id: str
    prompt: str
    selected_option_label: str | None
    selected_option_text: str | None
    correct_option_label: str | None
    correct_option_text: str | None
    explanation: str | None


class ClinicalCaseAttemptReviewAnalyticsResponse(BaseModel):
    attempt_id: str
    case_slug: str
    case_title: str
    topic_name: str | None
    accuracy_percent: float
    correct_answers: int
    answered_questions: int
    study_minutes: int
    submitted_at: datetime
    patient_summary: str
    focus_points: list[str] = Field(default_factory=list)
    exam_targets: list[str] = Field(default_factory=list)
    review_available: bool
    incorrect_items: list[ClinicalCaseAttemptReviewItemResponse] = Field(default_factory=list)


class RepeatingQuestionErrorAnalyticsResponse(BaseModel):
    question_id: int
    question_preview: str
    difficulty: str
    topic_id: int | None
    topic_name: str | None
    section_name: str | None
    attempts_count: int
    incorrect_answers: int
    accuracy_percent: float
    last_seen_at: datetime
    last_incorrect_at: datetime | None


class OsceStationChecklistGapAnalyticsResponse(BaseModel):
    id: str
    title: str
    description: str
    critical: bool


class OsceStationQuizMistakeAnalyticsResponse(BaseModel):
    question_id: str
    prompt: str
    selected_option_label: str | None
    selected_option_text: str | None
    correct_option_label: str | None
    correct_option_text: str | None
    explanation: str | None


class OsceStationReviewAnalyticsResponse(BaseModel):
    station_slug: str
    station_title: str
    section_name: str
    topic_name: str
    status: str
    attempts_count: int
    best_score_percent: float | None
    latest_attempt_submitted_at: datetime | None
    latest_total_score_percent: float | None
    latest_checklist_score_percent: float | None
    latest_quiz_score_percent: float | None
    missed_checklist_items: list[OsceStationChecklistGapAnalyticsResponse] = Field(default_factory=list)
    incorrect_quiz_items: list[OsceStationQuizMistakeAnalyticsResponse] = Field(default_factory=list)


class ReadinessTrackResponse(BaseModel):
    key: str
    label: str
    readiness_percent: float
    deficit_percent: float
    status: str
    detail: str
    coverage_percent: float
    freshness_percent: float
    consistency_percent: float
    volume_percent: float
    momentum_percent: float


class ExamStageProtocolResponse(BaseModel):
    key: str
    label: str
    status: str
    status_label: str
    result_label: str
    requirement_label: str
    detail: str


class ExamReadinessProtocolResponse(BaseModel):
    overall_status: str
    overall_status_label: str
    summary: str
    stages: list[ExamStageProtocolResponse]
    action_items: list[str] = Field(default_factory=list)


class ReadinessSummaryResponse(BaseModel):
    overall_readiness_percent: float
    recommended_focus_key: str
    recommended_focus_label: str
    tracks: list[ReadinessTrackResponse]
    exam_protocol: ExamReadinessProtocolResponse


class DailyAnalyticsResponse(BaseModel):
    stat_date: date
    questions_answered: int
    correct_answers: int
    accuracy_percent: float
    study_minutes: int
