import json
import re
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.clinical_case_quiz import CASE_QUIZ_QUESTION_COUNT, build_fallback_case_quiz_questions
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.clinical_case_attempt import ClinicalCaseAttempt
from app.models.clinical_case import (
    ClinicalCase,
    ClinicalCaseFact,
    ClinicalCaseQuizOption,
    ClinicalCaseQuizQuestion,
    ClinicalCaseRecord,
)


SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
CORRUPTED_TEXT_RATIO = 0.25
MIN_CORRUPTED_TEXT_LENGTH = 6


class ClinicalCaseRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_case_records(self) -> list[ClinicalCaseRecord]:
        result = await self.session.execute(
            select(ClinicalCaseRecord).order_by(
                ClinicalCaseRecord.section_name,
                ClinicalCaseRecord.topic_name,
                ClinicalCaseRecord.title,
                ClinicalCaseRecord.slug,
            )
        )
        return list(result.scalars().all())

    async def list_cases(self) -> list[ClinicalCase]:
        return [self._to_domain(record) for record in await self.list_case_records()]

    async def get_by_slug(self, slug: str) -> ClinicalCase:
        record = await self._get_record_by_slug(slug)

        if record is None:
            raise NotFoundError("Кейс не найден")

        return self._to_domain(record)

    async def save_case(
        self,
        clinical_case: ClinicalCase,
        *,
        topic_id: int | None = None,
        previous_slug: str | None = None,
    ) -> ClinicalCase:
        normalized_slug = self._normalize_slug(clinical_case.slug)
        normalized_previous_slug = self._normalize_slug(previous_slug) if previous_slug is not None else None
        existing_record = await self._get_record_by_slug(normalized_previous_slug or normalized_slug)
        is_rename = (
            existing_record is not None
            and normalized_previous_slug is not None
            and normalized_previous_slug != normalized_slug
        )

        if existing_record is None:
            existing_record = ClinicalCaseRecord(slug=normalized_slug)
            self.session.add(existing_record)

        self._apply_domain(existing_record, clinical_case, topic_id=topic_id)

        if is_rename:
            await self._rename_case_references(normalized_previous_slug, normalized_slug)

        await self.session.flush()
        return await self.get_by_slug(normalized_slug)

    async def delete_case(self, slug: str) -> None:
        record = await self._get_record_by_slug(slug)

        if record is None:
            raise NotFoundError("Кейс не найден")

        await self.session.delete(record)
        await self.session.flush()

    async def exists(self, slug: str) -> bool:
        return await self._get_record_by_slug(slug) is not None

    async def _get_record_by_slug(self, slug: str) -> ClinicalCaseRecord | None:
        normalized_slug = self._normalize_slug(slug)
        result = await self.session.execute(select(ClinicalCaseRecord).where(ClinicalCaseRecord.slug == normalized_slug))
        return result.scalar_one_or_none()

    def _normalize_slug(self, slug: str) -> str:
        normalized_slug = slug.strip().lower()

        if not SLUG_PATTERN.fullmatch(normalized_slug):
            raise BadRequestError("Некорректный slug кейса")

        return normalized_slug

    def _apply_domain(
        self,
        record: ClinicalCaseRecord,
        clinical_case: ClinicalCase,
        *,
        topic_id: int | None,
    ) -> None:
        record.slug = self._normalize_slug(clinical_case.slug)
        record.topic_id = topic_id if topic_id is not None else clinical_case.topic_id
        record.faculty_codes = list(clinical_case.faculty_codes)
        record.title = clinical_case.title
        record.subtitle = clinical_case.subtitle
        record.section_name = clinical_case.section_name
        record.topic_name = clinical_case.topic_name
        record.difficulty = clinical_case.difficulty
        record.duration_minutes = clinical_case.duration_minutes
        record.summary = clinical_case.summary
        record.patient_summary = clinical_case.patient_summary
        record.focus_points = list(clinical_case.focus_points)
        record.exam_targets = list(clinical_case.exam_targets)
        record.discussion_questions = list(clinical_case.discussion_questions)
        record.quiz_questions = [
            {
                "id": question.id,
                "prompt": question.prompt,
                "options": [
                    {"label": option.label, "text": option.text}
                    for option in question.options
                ],
                "correct_option_label": question.correct_option_label,
                "explanation": question.explanation,
                "hint": question.hint,
            }
            for question in clinical_case.quiz_questions
        ]
        record.clinical_facts = [
            {"label": fact.label, "value": fact.value, "tone": fact.tone}
            for fact in clinical_case.clinical_facts
        ]

    async def _rename_case_references(self, previous_slug: str, normalized_slug: str) -> None:
        await self.session.execute(
            update(ClinicalCaseAttempt)
            .where(ClinicalCaseAttempt.case_slug == previous_slug)
            .values(case_slug=normalized_slug)
        )

    def _to_domain(self, record: ClinicalCaseRecord) -> ClinicalCase:
        quiz_questions = self._questions_from_record(record)

        return ClinicalCase(
            slug=record.slug,
            faculty_codes=list(record.faculty_codes or []),
            title=record.title,
            subtitle=record.subtitle,
            section_name=record.section_name,
            topic_name=record.topic_name,
            difficulty=record.difficulty,
            duration_minutes=record.duration_minutes,
            summary=record.summary,
            patient_summary=record.patient_summary,
            focus_points=list(record.focus_points or []),
            exam_targets=list(record.exam_targets or []),
            discussion_questions=list(record.discussion_questions or []),
            quiz_questions=quiz_questions,
            clinical_facts=[
                ClinicalCaseFact(
                    label=str(item.get("label", "")),
                    value=str(item.get("value", "")),
                    tone=item.get("tone"),
                )
                for item in record.clinical_facts or []
                if isinstance(item, dict)
            ],
            topic_id=record.topic_id,
        )

    def _questions_from_record(self, record: ClinicalCaseRecord) -> list[ClinicalCaseQuizQuestion]:
        questions = self._questions_from_records(record.quiz_questions or [])

        if len(questions) == CASE_QUIZ_QUESTION_COUNT:
            return questions

        return build_fallback_case_quiz_questions(
            slug=record.slug,
            summary=record.summary,
            patient_summary=record.patient_summary,
            focus_points=list(record.focus_points or []),
            exam_targets=list(record.exam_targets or []),
            discussion_questions=list(record.discussion_questions or []),
        )

    def _questions_from_records(self, value: list[object]) -> list[ClinicalCaseQuizQuestion]:
        questions: list[ClinicalCaseQuizQuestion] = []

        for item in value:
            if not isinstance(item, dict):
                continue

            hint = str(item.get("hint")).strip() if item.get("hint") is not None else ""
            options = [
                ClinicalCaseQuizOption(
                    label=str(option.get("label", "")).strip().upper(),
                    text=str(option.get("text", "")).strip(),
                )
                for option in item.get("options", [])
                if isinstance(option, dict)
            ]

            questions.append(
                ClinicalCaseQuizQuestion(
                    id=str(item.get("id", "")).strip().lower(),
                    prompt=str(item.get("prompt", "")).strip(),
                    options=options,
                    correct_option_label=str(item.get("correct_option_label", "")).strip().upper(),
                    explanation=str(item.get("explanation", "")).strip(),
                    hint=hint or None,
                )
            )

        return [
            question
            for question in questions
            if question.id
            and question.prompt
            and question.correct_option_label
            and question.explanation
            and all(option.label and option.text for option in question.options)
            and len(question.options) > 0
        ]


class ClinicalCaseFileReader:
    def list_cases(self) -> list[ClinicalCase]:
        cases_root = self._get_cases_root()

        if not cases_root.exists() or not cases_root.is_dir():
            return []

        files = sorted(
            [path for path in cases_root.iterdir() if path.is_file() and path.suffix.lower() == ".json"],
            key=lambda path: path.name.lower(),
        )

        return [self.read_case(file_path) for file_path in files]

    def read_case(self, file_path: Path) -> ClinicalCase:
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError as exception:
            raise BadRequestError(f"Некорректный файл клинического кейса: {file_path.name}") from exception

        slug = self._normalize_required_text(payload.get("slug"), "slug", file_path)

        if slug != file_path.stem.lower():
            raise BadRequestError(f"Slug клинического кейса не совпадает с именем файла: {file_path.name}")

        if not SLUG_PATTERN.fullmatch(slug):
            raise BadRequestError(f"Некорректный slug клинического кейса в файле: {file_path.name}")

        return ClinicalCase(
            slug=slug,
            faculty_codes=self._normalize_string_list(payload.get("faculty_codes")),
            title=self._normalize_required_text(payload.get("title"), "title", file_path),
            subtitle=self._normalize_optional_text(payload.get("subtitle")),
            section_name=self._normalize_required_text(payload.get("section_name"), "section_name", file_path),
            topic_name=self._normalize_required_text(payload.get("topic_name"), "topic_name", file_path),
            difficulty=self._normalize_required_text(payload.get("difficulty"), "difficulty", file_path),
            duration_minutes=self._normalize_duration(payload.get("duration_minutes"), file_path),
            summary=self._normalize_required_text(payload.get("summary"), "summary", file_path),
            patient_summary=self._normalize_required_text(payload.get("patient_summary"), "patient_summary", file_path),
            focus_points=self._normalize_string_list(payload.get("focus_points")),
            exam_targets=self._normalize_string_list(payload.get("exam_targets")),
            discussion_questions=self._normalize_string_list(payload.get("discussion_questions")),
            quiz_questions=self._normalize_quiz_questions(payload.get("quiz_questions"), file_path),
            clinical_facts=self._normalize_facts(payload.get("clinical_facts"), file_path),
        )

    def _get_cases_root(self) -> Path:
        return (Path(settings.media_storage_path).resolve() / "cases").resolve()

    def _normalize_duration(self, value: object, file_path: Path) -> int:
        if not isinstance(value, int) or value <= 0:
            raise BadRequestError(f"Некорректное значение duration_minutes в файле клинического кейса: {file_path.name}")

        return value

    def _normalize_required_text(self, value: object, field_name: str, file_path: Path) -> str:
        normalized_value = self._normalize_optional_text(value)

        if normalized_value is None:
            raise BadRequestError(f"В файле клинического кейса отсутствует поле {field_name}: {file_path.name}")

        return normalized_value

    def _normalize_optional_text(self, value: object) -> str | None:
        if value is None:
            return None

        if not isinstance(value, str):
            raise BadRequestError("Текстовые поля клинического кейса должны быть строками")

        normalized_value = value.strip()

        if normalized_value and self._looks_corrupted(normalized_value):
            raise BadRequestError("Файл клинического кейса содержит поврежденный текст")

        return normalized_value or None

    def _normalize_string_list(self, value: object) -> list[str]:
        if value is None:
            return []

        if not isinstance(value, list):
            raise BadRequestError("Списковые поля клинического кейса должны быть массивами")

        result: list[str] = []

        for item in value:
            normalized_item = self._normalize_optional_text(item)

            if normalized_item is not None:
                result.append(normalized_item)

        return result

    def _normalize_quiz_questions(self, value: object, file_path: Path) -> list[ClinicalCaseQuizQuestion]:
        if value is None:
            raise BadRequestError(
                f"В файле клинического кейса отсутствует поле quiz_questions: {file_path.name}"
            )

        if not isinstance(value, list):
            raise BadRequestError(f"Некорректное поле quiz_questions в файле клинического кейса: {file_path.name}")

        questions: list[ClinicalCaseQuizQuestion] = []
        seen_ids: set[str] = set()

        for item in value:
            if not isinstance(item, dict):
                raise BadRequestError(f"Некорректный вопрос quiz_questions в файле клинического кейса: {file_path.name}")

            question_id = self._normalize_required_text(item.get("id"), "quiz_questions.id", file_path).lower()

            if question_id in seen_ids:
                raise BadRequestError(f"Дублирующийся id вопроса кейса в файле: {file_path.name}")

            seen_ids.add(question_id)
            options = self._normalize_quiz_options(item.get("options"), file_path)
            correct_option_label = self._normalize_required_text(
                item.get("correct_option_label"),
                "quiz_questions.correct_option_label",
                file_path,
            ).upper()

            if correct_option_label not in {option.label for option in options}:
                raise BadRequestError(f"Некорректный правильный ответ кейса в файле: {file_path.name}")

            questions.append(
                ClinicalCaseQuizQuestion(
                    id=question_id,
                    prompt=self._normalize_required_text(item.get("prompt"), "quiz_questions.prompt", file_path),
                    options=options,
                    correct_option_label=correct_option_label,
                    explanation=self._normalize_required_text(
                        item.get("explanation"),
                        "quiz_questions.explanation",
                        file_path,
                    ),
                    hint=self._normalize_optional_text(item.get("hint")),
                )
            )

        if len(questions) != CASE_QUIZ_QUESTION_COUNT:
            raise BadRequestError(
                f"Кейс должен содержать ровно {CASE_QUIZ_QUESTION_COUNT} проверочных вопросов: {file_path.name}"
            )

        return questions

    def _normalize_quiz_options(self, value: object, file_path: Path) -> list[ClinicalCaseQuizOption]:
        if not isinstance(value, list) or len(value) < 2:
            raise BadRequestError(f"Вопрос кейса должен содержать минимум два варианта ответа: {file_path.name}")

        options: list[ClinicalCaseQuizOption] = []
        seen_labels: set[str] = set()

        for item in value:
            if not isinstance(item, dict):
                raise BadRequestError(f"Некорректный вариант ответа кейса в файле: {file_path.name}")

            label = self._normalize_required_text(item.get("label"), "quiz_questions.options.label", file_path).upper()

            if len(label) != 1:
                raise BadRequestError(f"Метка варианта ответа кейса должна состоять из одного символа: {file_path.name}")

            if label in seen_labels:
                raise BadRequestError(f"Дублирующаяся метка варианта ответа кейса в файле: {file_path.name}")

            seen_labels.add(label)
            options.append(
                ClinicalCaseQuizOption(
                    label=label,
                    text=self._normalize_required_text(item.get("text"), "quiz_questions.options.text", file_path),
                )
            )

        return sorted(options, key=lambda option: option.label)

    def _normalize_facts(self, value: object, file_path: Path) -> list[ClinicalCaseFact]:
        if value is None:
            return []

        if not isinstance(value, list):
            raise BadRequestError(f"Некорректное поле clinical_facts в файле клинического кейса: {file_path.name}")

        facts: list[ClinicalCaseFact] = []

        for item in value:
            if not isinstance(item, dict):
                raise BadRequestError(f"Некорректный факт в файле клинического кейса: {file_path.name}")

            facts.append(
                ClinicalCaseFact(
                    label=self._normalize_required_text(item.get("label"), "clinical_facts.label", file_path),
                    value=self._normalize_required_text(item.get("value"), "clinical_facts.value", file_path),
                    tone=self._normalize_optional_text(item.get("tone")),
                )
            )

        return facts

    def _looks_corrupted(self, value: str) -> bool:
        if "РїС—Р…" in value:
            return True

        visible_characters = [character for character in value if not character.isspace()]

        if len(visible_characters) < MIN_CORRUPTED_TEXT_LENGTH:
            return False

        question_marks = sum(character == "?" for character in visible_characters)
        return question_marks / len(visible_characters) >= CORRUPTED_TEXT_RATIO
