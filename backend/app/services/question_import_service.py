from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.answer_option import AnswerOption
from app.models.enums import QuestionDifficulty
from app.models.faculty import Faculty
from app.models.question import Question
from app.models.question_explanation import QuestionExplanation
from app.models.section import Section
from app.models.topic import Topic
from app.models.user import User
from app.repositories.faculty_repository import FacultyRepository
from app.repositories.question_repository import QuestionRepository
from app.repositories.section_repository import SectionRepository
from app.repositories.topic_repository import TopicRepository
from app.schemas.import_job import QuestionImportRequest, QuestionImportResponse
from app.schemas.import_job import ImportFileResponse
from app.schemas.import_job import QuestionImportValidationIssue, QuestionImportValidationResponse


FACULTY_CODE_TO_NAME = {
    "060101": "Лечебное дело",
    "060103": "Педиатрия",
    "060201": "Стоматология",
    "060301": "Фармация",
    "060501": "Сестринское дело",
    "60101": "Лечебное дело",
    "60103": "Педиатрия",
    "60201": "Стоматология",
    "60301": "Фармация",
    "60501": "Сестринское дело",
}

TEXT_COLUMNS = {
    "section",
    "topic",
    "question_text",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "option_e",
    "explanation",
}

CORRUPTED_TEXT_RATIO = 0.25
MIN_CORRUPTED_TEXT_LENGTH = 6
OPTION_LABELS = ("A", "B", "C", "D", "E")
MAX_VALIDATION_ISSUES = 30
TEMPLATE_QUESTION_PREFIXES = (
    "клиническая ситуация:",
    "ситуационная задача:",
    "клинический случай:",
)

REQUIRED_COLUMNS = {
    "faculty_code",
    "section",
    "topic",
    "question_text",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "option_e",
    "correct_option",
    "explanation",
    "difficulty",
}


@dataclass
class ImportCounters:
    created_questions: int = 0
    updated_questions: int = 0
    created_sections: int = 0
    created_topics: int = 0


class QuestionImportService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.faculty_repository = FacultyRepository(session)
        self.section_repository = SectionRepository(session)
        self.topic_repository = TopicRepository(session)
        self.question_repository = QuestionRepository(session)

    async def import_questions(self, actor: User, payload: QuestionImportRequest) -> QuestionImportResponse:
        file_path = self._resolve_import_file(payload.file_name)
        counters = ImportCounters()

        with file_path.open("r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            self._validate_columns(reader.fieldnames)

            for row_number, row in enumerate(reader, start=2):
                try:
                    await self._import_row(actor, row, counters)
                except BadRequestError as exception:
                    raise BadRequestError(f"Строка {row_number}: {exception.detail}") from exception

        await self.session.commit()

        return QuestionImportResponse(
            file_name=payload.file_name,
            created_questions=counters.created_questions,
            updated_questions=counters.updated_questions,
            created_sections=counters.created_sections,
            created_topics=counters.created_topics,
        )

    async def validate_questions(self, payload: QuestionImportRequest) -> QuestionImportValidationResponse:
        file_path = self._resolve_import_file(payload.file_name)
        issues: list[QuestionImportValidationIssue] = []
        issue_count = 0
        row_count = 0
        valid_row_count = 0
        faculties: set[str] = set()
        sections: set[tuple[str, str]] = set()
        topics: set[tuple[str, str, str]] = set()
        seen_questions: set[tuple[str, str, str, str]] = set()
        difficulty_counts: dict[str, int] = {}
        known_faculty_codes: dict[str, bool] = {}

        with file_path.open("r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)

            try:
                self._validate_columns(reader.fieldnames)
            except BadRequestError as exception:
                return QuestionImportValidationResponse(
                    file_name=payload.file_name,
                    can_import=False,
                    row_count=0,
                    valid_row_count=0,
                    issue_count=1,
                    issues=[QuestionImportValidationIssue(message=exception.detail)],
                    faculties=[],
                    section_count=0,
                    topic_count=0,
                    difficulty_counts={},
                )

            for row_number, row in enumerate(reader, start=2):
                row_count += 1

                try:
                    row_summary = await self._validate_row_for_preview(row, known_faculty_codes)
                except BadRequestError as exception:
                    issue_count += 1
                    self._append_validation_issue(issues, row_number, exception.detail)
                    continue

                duplicate_key = (
                    row_summary["faculty_code"].lower(),
                    row_summary["section_name"].lower(),
                    row_summary["topic_name"].lower(),
                    row_summary["question_text"].lower(),
                )

                if duplicate_key in seen_questions:
                    issue_count += 1
                    self._append_validation_issue(
                        issues,
                        row_number,
                        "Дубликат вопроса в том же разделе и теме CSV-файла",
                    )
                    continue

                seen_questions.add(duplicate_key)
                valid_row_count += 1
                faculties.add(row_summary["faculty_code"])
                sections.add((row_summary["faculty_code"], row_summary["section_name"].lower()))
                topics.add(
                    (
                        row_summary["faculty_code"],
                        row_summary["section_name"].lower(),
                        row_summary["topic_name"].lower(),
                    )
                )
                difficulty = row_summary["difficulty"]
                difficulty_counts[difficulty] = difficulty_counts.get(difficulty, 0) + 1

        if row_count == 0:
            issue_count += 1
            self._append_validation_issue(issues, None, "В файле нет строк с вопросами")

        return QuestionImportValidationResponse(
            file_name=payload.file_name,
            can_import=issue_count == 0,
            row_count=row_count,
            valid_row_count=valid_row_count,
            issue_count=issue_count,
            issues=issues,
            faculties=sorted(faculties),
            section_count=len(sections),
            topic_count=len(topics),
            difficulty_counts=dict(sorted(difficulty_counts.items())),
        )

    async def list_available_files(self) -> list[ImportFileResponse]:
        import_root = Path(settings.import_source_path).resolve()

        if not import_root.exists() or not import_root.is_dir():
            return []

        files = sorted(
            [path for path in import_root.iterdir() if path.is_file() and path.suffix.lower() == ".csv"],
            key=lambda path: path.name.lower(),
        )

        return [ImportFileResponse(file_name=file.name, size_bytes=file.stat().st_size) for file in files]

    def _resolve_import_file(self, file_name: str) -> Path:
        import_root = Path(settings.import_source_path).resolve()
        requested_path = (import_root / file_name).resolve()

        if import_root not in requested_path.parents and requested_path != import_root:
            raise BadRequestError("Некорректный путь к файлу импорта")

        if requested_path.suffix.lower() != ".csv":
            raise BadRequestError("Поддерживается только импорт из CSV")

        if not requested_path.exists() or not requested_path.is_file():
            raise NotFoundError("Файл импорта не найден")

        return requested_path

    def _validate_columns(self, field_names: list[str] | None) -> None:
        if field_names is None:
            raise BadRequestError("Файл импорта пустой")

        normalized_columns = {
            column.strip()
            for column in field_names
            if isinstance(column, str) and column.strip()
        }
        missing_columns = REQUIRED_COLUMNS - normalized_columns

        if missing_columns:
            raise BadRequestError(f"В файле импорта отсутствуют обязательные колонки: {', '.join(sorted(missing_columns))}")

    async def _validate_row_for_preview(
        self,
        row: dict[str, str | None],
        known_faculty_codes: dict[str, bool],
    ) -> dict[str, str]:
        self._validate_row_text(row)

        faculty_code = self._get_required_row_value(row, "faculty_code")

        if faculty_code not in known_faculty_codes:
            known_faculty_codes[faculty_code] = (
                faculty_code in FACULTY_CODE_TO_NAME
                or await self._get_faculty_by_code(faculty_code) is not None
            )

        if not known_faculty_codes[faculty_code]:
            raise BadRequestError(f"Неизвестный код факультета: {faculty_code}")

        section_name = self._get_required_row_value(row, "section")
        topic_name = self._get_required_row_value(row, "topic")
        question_text = self._get_required_row_value(row, "question_text")
        difficulty = self._parse_difficulty(self._get_required_row_value(row, "difficulty")).value
        self._parse_correct_option(row)

        for label in OPTION_LABELS:
            self._get_required_row_value(row, f"option_{label.lower()}")

        self._get_required_row_value(row, "explanation")

        return {
            "faculty_code": faculty_code,
            "section_name": section_name,
            "topic_name": topic_name,
            "question_text": question_text,
            "difficulty": difficulty,
        }

    def _append_validation_issue(
        self,
        issues: list[QuestionImportValidationIssue],
        row_number: int | None,
        message: str,
    ) -> None:
        if len(issues) >= MAX_VALIDATION_ISSUES:
            return

        issues.append(QuestionImportValidationIssue(row_number=row_number, message=message))

    async def _import_row(self, actor: User, row: dict[str, str | None], counters: ImportCounters) -> None:
        self._validate_row_text(row)

        faculty_code = self._get_required_row_value(row, "faculty_code")
        section_name = self._get_required_row_value(row, "section")
        topic_name = self._get_required_row_value(row, "topic")
        question_text = self._get_required_row_value(row, "question_text")
        explanation_text = self._get_required_row_value(row, "explanation")
        difficulty = self._parse_difficulty(self._get_required_row_value(row, "difficulty"))
        correct_option = self._parse_correct_option(row)

        faculty = await self._get_or_create_faculty(faculty_code)
        section = await self._get_or_create_section(faculty.id, section_name, counters)
        topic = await self._get_or_create_topic(section.id, topic_name, counters)
        question = await self.question_repository.get_by_topic_and_text(topic.id, question_text)

        if question is None:
            question = Question(
                topic_id=topic.id,
                text=question_text,
                difficulty=difficulty,
                is_active=True,
                created_by=actor.id,
            )
            self.question_repository.add(question)
            await self.session.flush()
            self.session.add_all(self._build_answer_options(question.id, row, correct_option))
            self.session.add(QuestionExplanation(question_id=question.id, text=explanation_text))
            counters.created_questions += 1
            return

        question.difficulty = difficulty
        question.is_active = True
        counters.updated_questions += 1

        await self.session.execute(delete(AnswerOption).where(AnswerOption.question_id == question.id))
        self.session.add_all(self._build_answer_options(question.id, row, correct_option))

        if question.explanation is None:
            self.session.add(QuestionExplanation(question_id=question.id, text=explanation_text))
        else:
            question.explanation.text = explanation_text

    async def _get_or_create_faculty(self, faculty_code: str) -> Faculty:
        normalized_code = faculty_code.strip()
        faculty = await self._get_faculty_by_code(normalized_code)

        if faculty is not None:
            return faculty

        faculty_name = FACULTY_CODE_TO_NAME.get(normalized_code)

        if faculty_name is None:
            raise BadRequestError(f"Неизвестный код факультета: {normalized_code}")

        faculty = Faculty(name=faculty_name, code=normalized_code)
        self.faculty_repository.add(faculty)
        await self.session.flush()
        return faculty

    async def _get_or_create_section(self, faculty_id: int, name: str, counters: ImportCounters) -> Section:
        section = await self.section_repository.get_by_faculty_and_name(faculty_id, name)

        if section is not None:
            return section

        section = Section(faculty_id=faculty_id, name=name)
        self.section_repository.add(section)
        await self.session.flush()
        counters.created_sections += 1
        return section

    async def _get_or_create_topic(self, section_id: int, name: str, counters: ImportCounters) -> Topic:
        topic = await self.topic_repository.get_by_section_and_name(section_id, name)

        if topic is not None:
            return topic

        topic = Topic(section_id=section_id, name=name)
        self.topic_repository.add(topic)
        await self.session.flush()
        counters.created_topics += 1
        return topic

    async def _get_faculty_by_code(self, code: str) -> Faculty | None:
        return await self.faculty_repository.get_by_code(code)

    def _validate_row_text(self, row: dict[str, str | None]) -> None:
        missing_columns = sorted(
            column
            for column in TEXT_COLUMNS
            if not isinstance(row.get(column), str)
        )

        if missing_columns:
            raise BadRequestError(
                "В строке импорта отсутствуют текстовые значения в обязательных колонках: "
                f"{', '.join(missing_columns)}"
            )

        corrupted_columns = sorted(
            column
            for column in TEXT_COLUMNS
            if self._is_corrupted_text(row.get(column, ""))
        )

        if corrupted_columns:
            raise BadRequestError(
                "Файл импорта содержит поврежденный текст. "
                f"Замени исходный CSV. Подозрительные колонки: {', '.join(corrupted_columns)}"
            )

        question_text = row.get("question_text")
        if isinstance(question_text, str):
            self._validate_question_text_quality(question_text)

    def _validate_question_text_quality(self, value: str) -> None:
        normalized_value = " ".join(value.strip().lower().split())

        for prefix in TEMPLATE_QUESTION_PREFIXES:
            if normalized_value.startswith(prefix):
                raise BadRequestError(
                    "question_text не должен начинаться с шаблонного префикса "
                    f"«{prefix}». Сразу описывай данные пациента разными формулировками."
                )

    def _parse_difficulty(self, value: str) -> QuestionDifficulty:
        normalized_value = value.lower()

        try:
            return QuestionDifficulty(normalized_value)
        except ValueError as exception:
            raise BadRequestError(f"Неподдерживаемая сложность вопроса: {value}") from exception

    def _parse_correct_option(self, row: dict[str, str | None]) -> str:
        normalized_value = self._get_required_row_value(row, "correct_option").upper()

        if normalized_value not in OPTION_LABELS:
            raise BadRequestError("Некорректное значение correct_option: ожидается одна из меток A, B, C, D, E")

        return normalized_value

    def _get_required_row_value(self, row: dict[str, str | None], column: str) -> str:
        value = row.get(column)

        if not isinstance(value, str):
            raise BadRequestError(f"В строке импорта отсутствует значение в обязательной колонке {column}")

        normalized_value = value.strip()

        if not normalized_value:
            raise BadRequestError(f"В строке импорта отсутствует значение в обязательной колонке {column}")

        return normalized_value

    def _is_corrupted_text(self, value: str | None) -> bool:
        if value is None:
            return False

        text = value.strip()

        if not text:
            return False

        if "пїЅ" in text:
            return True

        visible_characters = [character for character in text if not character.isspace()]

        if len(visible_characters) < MIN_CORRUPTED_TEXT_LENGTH:
            return False

        question_marks = sum(character == "?" for character in visible_characters)
        return question_marks / len(visible_characters) >= CORRUPTED_TEXT_RATIO

    def _build_answer_options(
        self,
        question_id: int,
        row: dict[str, str | None],
        correct_option: str,
    ) -> list[AnswerOption]:
        if correct_option not in OPTION_LABELS:
            raise BadRequestError("Некорректное значение correct_option: ожидается одна из меток A, B, C, D, E")

        return [
            AnswerOption(
                question_id=question_id,
                label=label,
                text=self._get_required_row_value(row, f"option_{label.lower()}"),
                is_correct=label == correct_option,
            )
            for label in OPTION_LABELS
        ]
