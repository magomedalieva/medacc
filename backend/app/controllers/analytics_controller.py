from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.dependencies import DbSession, get_current_user
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsOverviewResponse,
    ClinicalCaseAttemptAnalyticsResponse,
    ClinicalCaseAttemptReviewAnalyticsResponse,
    DailyAnalyticsResponse,
    ExamReadinessProtocolResponse,
    OsceStationReviewAnalyticsResponse,
    ReadinessSummaryResponse,
    RepeatingQuestionErrorAnalyticsResponse,
    TopicAnalyticsResponse,
    TopicQuestionErrorAnalyticsResponse,
)
from app.services.analytics_service import AnalyticsService


router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_overview(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> AnalyticsOverviewResponse:
    return await AnalyticsService(session).get_overview(user)


@router.get("/topics", response_model=list[TopicAnalyticsResponse])
async def get_topics(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[TopicAnalyticsResponse]:
    return await AnalyticsService(session).get_topics(user)


@router.get("/topics/{topic_id}/errors", response_model=list[TopicQuestionErrorAnalyticsResponse])
async def get_topic_question_errors(
    topic_id: int,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[TopicQuestionErrorAnalyticsResponse]:
    return await AnalyticsService(session).get_topic_question_errors(user, topic_id)


@router.get("/history", response_model=list[DailyAnalyticsResponse])
async def get_history(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[DailyAnalyticsResponse]:
    return await AnalyticsService(session).get_history(user)


@router.get("/cases", response_model=list[ClinicalCaseAttemptAnalyticsResponse])
async def get_case_attempts(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[ClinicalCaseAttemptAnalyticsResponse]:
    return await AnalyticsService(session).get_case_attempts(user)


@router.get("/cases/{attempt_id}/review", response_model=ClinicalCaseAttemptReviewAnalyticsResponse)
async def get_case_attempt_review(
    attempt_id: str,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ClinicalCaseAttemptReviewAnalyticsResponse:
    return await AnalyticsService(session).get_case_attempt_review(user, attempt_id)


@router.get("/repeating-errors", response_model=list[RepeatingQuestionErrorAnalyticsResponse])
async def get_repeating_question_errors(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> list[RepeatingQuestionErrorAnalyticsResponse]:
    return await AnalyticsService(session).get_repeating_question_errors(user)


@router.get("/osce/{station_slug}/review", response_model=OsceStationReviewAnalyticsResponse)
async def get_osce_station_review(
    station_slug: str,
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> OsceStationReviewAnalyticsResponse:
    return await AnalyticsService(session).get_osce_station_review(user, station_slug)


@router.get("/readiness", response_model=ReadinessSummaryResponse)
async def get_readiness(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ReadinessSummaryResponse:
    return await AnalyticsService(session).get_readiness(user)


@router.get("/learning/readiness", response_model=ReadinessSummaryResponse)
async def get_learning_readiness(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ReadinessSummaryResponse:
    return await AnalyticsService(session).get_learning_readiness(user)


@router.get("/exam/protocol", response_model=ExamReadinessProtocolResponse)
async def get_exam_protocol(
    session: DbSession,
    user: Annotated[User, Depends(get_current_user)],
) -> ExamReadinessProtocolResponse:
    return await AnalyticsService(session).get_exam_protocol(user)
