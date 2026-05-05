from dataclasses import dataclass, field

from sqlalchemy import ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


@dataclass(slots=True)
class OsceChecklistItem:
    id: str
    title: str
    description: str
    critical: bool = False


@dataclass(slots=True)
class OsceQuizOption:
    label: str
    text: str


@dataclass(slots=True)
class OsceQuizQuestion:
    id: str
    prompt: str
    options: list[OsceQuizOption] = field(default_factory=list)
    correct_option_label: str = ""
    explanation: str = ""


@dataclass(slots=True)
class OsceStation:
    slug: str
    faculty_codes: list[str]
    title: str
    subtitle: str | None
    section_name: str
    topic_name: str
    skill_level: str
    duration_minutes: int
    max_score: int
    summary: str
    checklist_items: list[OsceChecklistItem] = field(default_factory=list)
    quiz_questions: list[OsceQuizQuestion] = field(default_factory=list)
    topic_id: int | None = None


class OsceStationRecord(TimestampMixin, Base):
    __tablename__ = "osce_stations"

    slug: Mapped[str] = mapped_column(String(120), primary_key=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    faculty_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    section_name: Mapped[str] = mapped_column(String(100), nullable=False)
    topic_name: Mapped[str] = mapped_column(String(150), nullable=False)
    skill_level: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    max_score: Mapped[int] = mapped_column(Integer, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    checklist_items: Mapped[list[dict[str, str | bool]]] = mapped_column(JSON, nullable=False, default=list)
    quiz_questions: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)

    topic = relationship("Topic")
