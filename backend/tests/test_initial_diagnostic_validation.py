import pytest

from app.core.exceptions import BadRequestError
from app.models.enums import TestSessionMode
from app.schemas.test import TestSessionCreateRequest
from app.services.evidence_context import ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC
from app.services.test_service import INITIAL_DIAGNOSTIC_QUESTION_COUNT, TestService


def diagnostic_payload(**overrides) -> TestSessionCreateRequest:
    payload = {
        "topic_id": None,
        "question_count": INITIAL_DIAGNOSTIC_QUESTION_COUNT,
        "mode": TestSessionMode.EXAM,
        "planned_task_id": None,
        "simulation_id": None,
        "attempt_context": ATTEMPT_CONTEXT_INITIAL_DIAGNOSTIC,
    }
    payload.update(overrides)
    return TestSessionCreateRequest(**payload)


def test_initial_diagnostic_requires_exact_question_count() -> None:
    payload = diagnostic_payload(question_count=INITIAL_DIAGNOSTIC_QUESTION_COUNT - 1)

    with pytest.raises(BadRequestError, match="ровно 30 вопросов"):
        TestService._validate_initial_diagnostic_request(payload, explicit_question_ids=None)


def test_initial_diagnostic_requires_full_available_question_set() -> None:
    payload = diagnostic_payload()

    with pytest.raises(BadRequestError, match="нужно 30 активных вопросов"):
        TestService._validate_initial_diagnostic_availability(
            payload,
            available_question_count=INITIAL_DIAGNOSTIC_QUESTION_COUNT - 1,
        )


def test_initial_diagnostic_accepts_strict_start_shape() -> None:
    payload = diagnostic_payload()

    TestService._validate_initial_diagnostic_request(payload, explicit_question_ids=None)
    TestService._validate_initial_diagnostic_availability(
        payload,
        available_question_count=INITIAL_DIAGNOSTIC_QUESTION_COUNT,
    )
