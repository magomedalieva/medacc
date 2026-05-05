from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum as SqlEnum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import PlanTaskType, PlanTaskVariant, enum_values

if TYPE_CHECKING:
    from app.models.exam_simulation import ExamSimulation
    from app.models.study_plan import StudyPlan
    from app.models.topic import Topic


class PlanTask(Base):
    __tablename__ = "plan_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("study_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    task_type: Mapped[PlanTaskType] = mapped_column(
        SqlEnum(PlanTaskType, name="plan_task_type", values_callable=enum_values),
        nullable=False,
    )
    task_variant: Mapped[PlanTaskVariant] = mapped_column(
        SqlEnum(PlanTaskVariant, name="plan_task_variant", values_callable=enum_values),
        nullable=False,
        default=PlanTaskVariant.STANDARD,
    )
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    task_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    osce_station_slug: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    questions_count: Mapped[int] = mapped_column(Integer, nullable=False)
    estimated_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    is_completed: Mapped[bool] = mapped_column(nullable=False, default=False)
    is_skipped: Mapped[bool] = mapped_column(nullable=False, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_stale: Mapped[bool] = mapped_column(nullable=False, default=False)
    missed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    missed_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)
    intent: Mapped[str] = mapped_column(String(30), nullable=False, default="training")
    exam_checkpoint_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    target_route: Mapped[str] = mapped_column(String(40), nullable=False, default="learning_center")
    completion_source: Mapped[str | None] = mapped_column(String(40), nullable=True)
    linked_simulation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exam_simulations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    plan: Mapped[StudyPlan] = relationship(back_populates="tasks")
    topic: Mapped[Topic | None] = relationship()
    linked_simulation: Mapped[ExamSimulation | None] = relationship()
