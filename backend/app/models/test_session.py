from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Index, Integer, JSON, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import TestSessionMode, TestSessionStatus, enum_values

if TYPE_CHECKING:
    from app.models.exam_simulation import ExamSimulation
    from app.models.test_session_answer import TestSessionAnswer
    from app.models.user import User


class TestSession(Base):
    __tablename__ = "test_sessions"
    __table_args__ = (
        Index(
            "ix_test_sessions_user_status_mode_finished_at",
            "user_id",
            "status",
            "mode",
            "finished_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    mode: Mapped[TestSessionMode] = mapped_column(
        SqlEnum(TestSessionMode, name="test_session_mode", values_callable=enum_values),
        nullable=False,
    )
    status: Mapped[TestSessionStatus] = mapped_column(
        SqlEnum(TestSessionStatus, name="test_session_status", values_callable=enum_values),
        nullable=False,
        default=TestSessionStatus.ACTIVE,
    )
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    planned_task_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    simulation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exam_simulations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    attempt_context: Mapped[str] = mapped_column(String(40), nullable=False, default="free_training")
    question_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    current_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    time_limit_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_percent: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()
    simulation: Mapped[ExamSimulation | None] = relationship()
    answers: Mapped[list[TestSessionAnswer]] = relationship(back_populates="session", cascade="all, delete-orphan")
