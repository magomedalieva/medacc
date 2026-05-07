from app.services.analytics_service import AnalyticsService
from app.services.readiness_engine import _resolve_status as resolve_readiness_status
from app.services.schedule_service import PlannedTopic, ScheduleService


def test_topic_analytics_uses_70_pass_and_85_mastery_thresholds() -> None:
    service = object.__new__(AnalyticsService)

    assert service._resolve_status(69.99) == "weak"
    assert service._resolve_status(70.0) == "medium"
    assert service._resolve_status(84.99) == "medium"
    assert service._resolve_status(85.0) == "strong"


def test_schedule_topic_stable_status_starts_at_85_percent() -> None:
    service = object.__new__(ScheduleService)

    assert service._resolve_topic_status(
        answered_questions=12,
        accuracy_percent=84.99,
        repeated_question_struggles=0,
        hard_question_accuracy_percent=None,
    ) == "developing"
    assert service._resolve_topic_status(
        answered_questions=12,
        accuracy_percent=85.0,
        repeated_question_struggles=0,
        hard_question_accuracy_percent=None,
    ) == "stable"


def test_schedule_developing_topic_counts_as_stable_only_from_85_percent() -> None:
    service = object.__new__(ScheduleService)

    def planned_topic(accuracy_percent: float) -> PlannedTopic:
        return PlannedTopic(
            topic=object(),
            answered_questions=8,
            correct_answers=7,
            accuracy_percent=accuracy_percent,
            status="developing",
            recommended_repeats=0,
            case_attempts_count=0,
            repeated_question_struggles=0,
            hard_question_accuracy_percent=None,
            last_activity_at=None,
            last_struggle_at=None,
            review_interval_days=0,
            review_urgency="fresh",
            review_overdue_days=0,
        )

    assert service._counts_as_stable_topic(planned_topic(84.99)) is False
    assert service._counts_as_stable_topic(planned_topic(85.0)) is True


def test_readiness_status_uses_70_and_85_bands() -> None:
    assert resolve_readiness_status(69.99) == "risk"
    assert resolve_readiness_status(70.0) == "building"
    assert resolve_readiness_status(84.99) == "building"
    assert resolve_readiness_status(85.0) == "ready"
