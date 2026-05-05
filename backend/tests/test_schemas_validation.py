from datetime import date

import pytest
from pydantic import ValidationError

from app.models.enums import StudyIntensity
from app.schemas.onboarding import OnboardingCompleteRequest
from app.schemas.schedule import SchedulePreferencesUpdateRequest


def test_onboarding_request_normalizes_study_weekdays() -> None:
    request = OnboardingCompleteRequest(
        faculty_id=1,
        accreditation_date=date(2026, 6, 1),
        daily_study_minutes=45,
        study_intensity=StudyIntensity.STEADY,
        study_weekdays=[6, 0, 0, 2],
    )

    assert request.study_weekdays == [0, 2, 6]


@pytest.mark.parametrize("minutes", [19, 181])
def test_onboarding_request_rejects_invalid_daily_minutes(minutes: int) -> None:
    with pytest.raises(ValidationError):
        OnboardingCompleteRequest(
            faculty_id=1,
            accreditation_date=date(2026, 6, 1),
            daily_study_minutes=minutes,
            study_intensity=StudyIntensity.STEADY,
            study_weekdays=[0, 1, 2],
        )


def test_schedule_preferences_reject_invalid_weekdays() -> None:
    with pytest.raises(ValidationError):
        SchedulePreferencesUpdateRequest(
            daily_study_minutes=45,
            study_intensity=StudyIntensity.STEADY,
            study_weekdays=[0, 7],
        )


def test_schedule_preferences_accept_valid_payload() -> None:
    request = SchedulePreferencesUpdateRequest(
        daily_study_minutes=60,
        study_intensity=StudyIntensity.INTENSIVE,
        study_weekdays=[4, 1],
    )

    assert request.daily_study_minutes == 60
    assert request.study_intensity == StudyIntensity.INTENSIVE
    assert request.study_weekdays == [1, 4]
