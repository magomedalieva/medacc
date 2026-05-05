from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Date, DateTime, Enum as SqlEnum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.study_schedule import DEFAULT_STUDY_WEEKDAYS
from app.models.base import Base, TimestampMixin
from app.models.enums import StudyIntensity, UserRole, enum_values

if TYPE_CHECKING:
    from app.models.faculty import Faculty


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SqlEnum(UserRole, name="user_role", values_callable=enum_values),
        nullable=False,
        default=UserRole.STUDENT,
    )
    faculty_id: Mapped[int | None] = mapped_column(ForeignKey("faculties.id", ondelete="SET NULL"), nullable=True)
    accreditation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    daily_study_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=45)
    study_intensity: Mapped[StudyIntensity] = mapped_column(
        SqlEnum(StudyIntensity, name="study_intensity", values_callable=enum_values),
        nullable=False,
        default=StudyIntensity.STEADY,
    )
    study_weekdays: Mapped[list[int]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: list(DEFAULT_STUDY_WEEKDAYS),
    )
    onboarding_completed: Mapped[bool] = mapped_column(nullable=False, default=False)
    streak_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    faculty: Mapped[Faculty | None] = relationship(back_populates="users")
