from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.core.study_schedule import normalize_study_weekdays
from app.models.enums import StudyIntensity
from app.schemas.auth import UserResponse


class OnboardingCompleteRequest(BaseModel):
    faculty_id: int = Field(gt=0)
    accreditation_date: date
    daily_study_minutes: int = Field(ge=20, le=180)
    study_intensity: StudyIntensity
    study_weekdays: list[int] = Field(min_length=1, max_length=7)

    @field_validator("study_weekdays")
    @classmethod
    def validate_study_weekdays(cls, value: list[int]) -> list[int]:
        return normalize_study_weekdays(value)


class OnboardingCompleteResponse(BaseModel):
    user: UserResponse
