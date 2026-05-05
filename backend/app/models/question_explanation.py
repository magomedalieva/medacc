from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.question import Question


class QuestionExplanation(Base):
    __tablename__ = "question_explanations"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    question: Mapped[Question] = relationship(back_populates="explanation")
