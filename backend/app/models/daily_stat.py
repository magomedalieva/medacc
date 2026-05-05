from __future__ import annotations

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class DailyStat(TimestampMixin, Base):
    __tablename__ = "daily_stats"
    __table_args__ = (UniqueConstraint("user_id", "stat_date", name="uq_daily_stats_user_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    stat_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    questions_answered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct_answers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    study_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    study_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    user = relationship("User")
