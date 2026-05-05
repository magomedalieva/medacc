from datetime import date, datetime

from pydantic import BaseModel, EmailStr


class AdminStudentProgressResponse(BaseModel):
    overall_percent: int
    tests_percent: int
    cases_percent: int
    osce_percent: int
    protocol_status: str
    protocol_label: str
    latest_simulation_status: str | None
    latest_simulation_score_percent: float | None
    latest_simulation_started_at: datetime | None
    latest_simulation_finished_at: datetime | None


class AdminStudentListItemResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    faculty_id: int | None
    faculty_name: str | None
    accreditation_date: date | None
    onboarding_completed: bool
    created_at: datetime
    last_login_at: datetime | None
    last_activity_date: date | None
    progress: AdminStudentProgressResponse


class AdminStudentListResponse(BaseModel):
    items: list[AdminStudentListItemResponse]
    total: int
    limit: int
    offset: int
