from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.clock import today
from app.models.enums import StudyIntensity


class RegisterRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class ProfileUpdateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    role: str
    faculty_id: int | None
    accreditation_date: date | None
    daily_study_minutes: int
    study_intensity: StudyIntensity
    study_weekdays: list[int]
    onboarding_completed: bool
    server_today: date = Field(default_factory=today)

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    session_type: str = "cookie"
    user: UserResponse


class LogoutResponse(BaseModel):
    logged_out: bool = True


class PasswordChangeResponse(BaseModel):
    changed: bool = True
