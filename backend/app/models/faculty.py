from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.section import Section
    from app.models.user import User


class Faculty(TimestampMixin, Base):
    __tablename__ = "faculties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    sections: Mapped[list[Section]] = relationship(back_populates="faculty", cascade="all, delete-orphan")
    users: Mapped[list[User]] = relationship(back_populates="faculty")
