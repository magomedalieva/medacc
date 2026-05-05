from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Enum as SqlEnum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import QuestionDifficulty, enum_values

if TYPE_CHECKING:
    from app.models.answer_option import AnswerOption
    from app.models.question_explanation import QuestionExplanation
    from app.models.topic import Topic


class Question(TimestampMixin, Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[QuestionDifficulty] = mapped_column(
        SqlEnum(QuestionDifficulty, name="question_difficulty", values_callable=enum_values),
        nullable=False,
        default=QuestionDifficulty.MEDIUM,
    )
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    topic: Mapped[Topic | None] = relationship(back_populates="questions")
    answer_options: Mapped[list[AnswerOption]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="AnswerOption.label",
    )
    explanation: Mapped[QuestionExplanation | None] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        uselist=False,
    )
