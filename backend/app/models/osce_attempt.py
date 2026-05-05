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
    from app.models.user import User


class OsceAttempt(Base):
    __tablename__ = "osce_attempts"
    __table_args__ = (
        Index(
            "ix_osce_attempts_user_submitted_at",
            "user_id",
            "submitted_at",
        ),
        Index(
            "ix_osce_attempts_user_station_submitted_at",
            "user_id",
            "station_slug",
            "submitted_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    simulation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exam_simulations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    attempt_context: Mapped[str] = mapped_column(String(40), nullable=False, default="free_training")
    station_slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    station_title: Mapped[str] = mapped_column(String(255), nullable=False)
    checklist_item_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    quiz_answers: Mapped[list[dict[str, str | None]]] = mapped_column(JSON, nullable=False, default=list)
    checklist_completed_count: Mapped[int] = mapped_column(Integer, nullable=False)
    checklist_total_count: Mapped[int] = mapped_column(Integer, nullable=False)
    quiz_correct_answers: Mapped[int] = mapped_column(Integer, nullable=False)
    quiz_total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    checklist_score_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    quiz_score_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    total_score_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    score_points: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user: Mapped[User] = relationship()
    simulation: Mapped[ExamSimulation | None] = relationship()
