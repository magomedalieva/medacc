from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.faculty import Faculty
    from app.models.topic import Topic


class Section(TimestampMixin, Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(primary_key=True)
    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculties.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    faculty: Mapped[Faculty] = relationship(back_populates="sections")
    topics: Mapped[list[Topic]] = relationship(back_populates="section", cascade="all, delete-orphan")
