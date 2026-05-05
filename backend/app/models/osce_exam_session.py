from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.exam_simulation import ExamSimulation
    from app.models.plan_task import PlanTask
    from app.models.user import User


class OsceExamSession(Base):
    __tablename__ = "osce_exam_sessions"
    __table_args__ = (
        Index(
            "ix_osce_exam_sessions_user_station_status",
            "user_id",
            "station_slug",
            "status",
        ),
        Index(
            "ix_osce_exam_sessions_user_expires_at",
            "user_id",
            "expires_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    station_slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    planned_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("plan_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    simulation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exam_simulations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    attempt_context: Mapped[str] = mapped_column(String(40), nullable=False, default="free_training")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()
    planned_task: Mapped[PlanTask | None] = relationship()
    simulation: Mapped[ExamSimulation | None] = relationship()
