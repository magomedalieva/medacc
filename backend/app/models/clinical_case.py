from dataclasses import dataclass, field

from sqlalchemy import ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


@dataclass(slots=True)
class ClinicalCaseFact:
    label: str
    value: str
    tone: str | None = None


@dataclass(slots=True)
class ClinicalCaseQuizOption:
    label: str
    text: str


@dataclass(slots=True)
class ClinicalCaseQuizQuestion:
    id: str
    prompt: str
    options: list[ClinicalCaseQuizOption] = field(default_factory=list)
    correct_option_label: str = ""
    explanation: str = ""
    hint: str | None = None


@dataclass(slots=True)
class ClinicalCase:
    slug: str
    faculty_codes: list[str]
    title: str
    subtitle: str | None
    section_name: str
    topic_name: str
    difficulty: str
    duration_minutes: int
    summary: str
    patient_summary: str
    focus_points: list[str] = field(default_factory=list)
    exam_targets: list[str] = field(default_factory=list)
    discussion_questions: list[str] = field(default_factory=list)
    quiz_questions: list[ClinicalCaseQuizQuestion] = field(default_factory=list)
    clinical_facts: list[ClinicalCaseFact] = field(default_factory=list)
    topic_id: int | None = None


class ClinicalCaseRecord(TimestampMixin, Base):
    __tablename__ = "clinical_cases"

    slug: Mapped[str] = mapped_column(String(120), primary_key=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"), nullable=True, index=True)
    faculty_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    section_name: Mapped[str] = mapped_column(String(100), nullable=False)
    topic_name: Mapped[str] = mapped_column(String(150), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    patient_summary: Mapped[str] = mapped_column(Text, nullable=False)
    focus_points: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    exam_targets: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    discussion_questions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    quiz_questions: Mapped[list[dict[str, object]]] = mapped_column(JSON, nullable=False, default=list)
    clinical_facts: Mapped[list[dict[str, str | None]]] = mapped_column(JSON, nullable=False, default=list)

    topic = relationship("Topic")
