from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.exam_simulation import ExamSimulation
    from app.models.topic import Topic
    from app.models.user import User


class ClinicalCaseAttempt(Base):
    __tablename__ = "clinical_case_attempts"
    __table_args__ = (
        Index(
            "ix_clinical_case_attempts_user_submitted_at",
            "user_id",
            "submitted_at",
        ),
        Index(
            "ix_clinical_case_attempts_user_topic_submitted_at",
            "user_id",
            "topic_id",
            "submitted_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    case_slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    case_title: Mapped[str] = mapped_column(String(255), nullable=False)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    simulation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exam_simulations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    attempt_context: Mapped[str] = mapped_column(String(40), nullable=False, default="free_training")
    answered_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_answers: Mapped[int] = mapped_column(Integer, nullable=False)
    accuracy_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    study_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    answer_feedback: Mapped[list[dict[str, str | bool]]] = mapped_column(JSON, nullable=False, default=list)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user: Mapped[User] = relationship()
    topic: Mapped[Topic | None] = relationship()
    simulation: Mapped[ExamSimulation | None] = relationship()
