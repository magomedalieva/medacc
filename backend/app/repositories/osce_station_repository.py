import json
import re
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.osce_attempt import OsceAttempt
from app.models.osce_station import (
    OsceChecklistItem,
    OsceQuizOption,
    OsceQuizQuestion,
    OsceStation,
    OsceStationRecord,
)
from app.models.plan_task import PlanTask


SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
ITEM_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
OPTION_LABEL_PATTERN = re.compile(r"^[A-Z]$")


class OsceStationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_station_records(self) -> list[OsceStationRecord]:
        result = await self.session.execute(
            select(OsceStationRecord).order_by(
                OsceStationRecord.section_name,
                OsceStationRecord.topic_name,
                OsceStationRecord.title,
                OsceStationRecord.slug,
            )
        )
        return list(result.scalars().all())

    async def list_stations(self) -> list[OsceStation]:
        return [self._to_domain(record) for record in await self.list_station_records()]

    async def get_by_slug(self, slug: str) -> OsceStation:
        record = await self._get_record_by_slug(slug)

        if record is None:
            raise NotFoundError("Станция ОСКЭ не найдена")

        return self._to_domain(record)

    async def save_station(
        self,
        station: OsceStation,
        *,
        topic_id: int | None = None,
        previous_slug: str | None = None,
    ) -> OsceStation:
        normalized_slug = self._normalize_slug(station.slug)
        normalized_previous_slug = self._normalize_slug(previous_slug) if previous_slug is not None else None
        existing_record = await self._get_record_by_slug(normalized_previous_slug or normalized_slug)
        is_rename = (
            existing_record is not None
            and normalized_previous_slug is not None
            and normalized_previous_slug != normalized_slug
        )

        if existing_record is None:
            existing_record = OsceStationRecord(slug=normalized_slug)
            self.session.add(existing_record)

        self._apply_domain(existing_record, station, topic_id=topic_id)

        if is_rename:
            await self._rename_station_references(normalized_previous_slug, normalized_slug)

        await self.session.flush()
        return await self.get_by_slug(normalized_slug)

    async def delete_station(self, slug: str) -> None:
        record = await self._get_record_by_slug(slug)

        if record is None:
            raise NotFoundError("Станция ОСКЭ не найдена")

        await self.session.delete(record)
        await self.session.flush()

    async def exists(self, slug: str) -> bool:
        return await self._get_record_by_slug(slug) is not None

    async def _get_record_by_slug(self, slug: str) -> OsceStationRecord | None:
        normalized_slug = self._normalize_slug(slug)
        result = await self.session.execute(select(OsceStationRecord).where(OsceStationRecord.slug == normalized_slug))
        return result.scalar_one_or_none()

    def _normalize_slug(self, slug: str) -> str:
        normalized_slug = slug.strip().lower()

        if not SLUG_PATTERN.fullmatch(normalized_slug):
            raise BadRequestError("Некорректный slug станции ОСКЭ")

        return normalized_slug

    def _apply_domain(
        self,
        record: OsceStationRecord,
        station: OsceStation,
        *,
        topic_id: int | None,
    ) -> None:
        record.slug = self._normalize_slug(station.slug)
        record.topic_id = topic_id if topic_id is not None else station.topic_id
        record.faculty_codes = list(station.faculty_codes)
        record.title = station.title
        record.subtitle = station.subtitle
        record.section_name = station.section_name
        record.topic_name = station.topic_name
        record.skill_level = station.skill_level
        record.duration_minutes = station.duration_minutes
        record.max_score = station.max_score
        record.summary = station.summary
        record.checklist_items = [
            {
                "id": item.id,
                "title": item.title,
                "description": item.description,
                "critical": item.critical,
            }
            for item in station.checklist_items
        ]
        record.quiz_questions = [
            {
                "id": question.id,
                "prompt": question.prompt,
                "options": [
                    {
                        "label": option.label,
                        "text": option.text,
                    }
                    for option in question.options
                ],
                "correct_option_label": question.correct_option_label,
                "explanation": question.explanation,
            }
            for question in station.quiz_questions
        ]

    async def _rename_station_references(self, previous_slug: str, normalized_slug: str) -> None:
        await self.session.execute(
            update(OsceAttempt)
            .where(OsceAttempt.station_slug == previous_slug)
            .values(station_slug=normalized_slug)
        )
        await self.session.execute(
            update(PlanTask)
            .where(PlanTask.osce_station_slug == previous_slug)
            .values(osce_station_slug=normalized_slug)
        )

    def _to_domain(self, record: OsceStationRecord) -> OsceStation:
        return OsceStation(
            slug=record.slug,
            faculty_codes=list(record.faculty_codes or []),
            title=record.title,
            subtitle=record.subtitle,
            section_name=record.section_name,
            topic_name=record.topic_name,
            skill_level=record.skill_level,
            duration_minutes=record.duration_minutes,
            max_score=record.max_score,
            summary=record.summary,
            checklist_items=[
                OsceChecklistItem(
                    id=str(item.get("id", "")),
                    title=str(item.get("title", "")),
                    description=str(item.get("description", "")),
                    critical=bool(item.get("critical", False)),
                )
                for item in record.checklist_items or []
                if isinstance(item, dict)
            ],
            quiz_questions=[
                self._question_from_payload(item)
                for item in record.quiz_questions or []
                if isinstance(item, dict)
            ],
            topic_id=record.topic_id,
        )

    def _question_from_payload(self, payload: dict[str, object]) -> OsceQuizQuestion:
        options_payload = payload.get("options")
        options = options_payload if isinstance(options_payload, list) else []

        return OsceQuizQuestion(
            id=str(payload.get("id", "")),
            prompt=str(payload.get("prompt", "")),
            options=[
                OsceQuizOption(
                    label=str(option.get("label", "")),
                    text=str(option.get("text", "")),
                )
                for option in options
                if isinstance(option, dict)
            ],
            correct_option_label=str(payload.get("correct_option_label", "")),
            explanation=str(payload.get("explanation", "")),
        )


class OsceStationFileReader:
    def list_stations(self) -> list[OsceStation]:
        stations_root = self._get_stations_root()

        if not stations_root.exists() or not stations_root.is_dir():
            return []

        files = sorted(
            [path for path in stations_root.iterdir() if path.is_file() and path.suffix.lower() == ".json"],
            key=lambda path: path.name.lower(),
        )

        return [self.read_station(file_path) for file_path in files]

    def read_station(self, file_path: Path) -> OsceStation:
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError as exception:
            raise BadRequestError(f"Некорректный файл станции ОСКЭ: {file_path.name}") from exception

        slug = self._normalize_required_text(payload.get("slug"), "slug", file_path).lower()

        if slug != file_path.stem.lower():
            raise BadRequestError(f"Slug станции ОСКЭ не совпадает с именем файла: {file_path.name}")

        if not SLUG_PATTERN.fullmatch(slug):
            raise BadRequestError(f"Некорректный slug станции ОСКЭ в файле: {file_path.name}")

        return OsceStation(
            slug=slug,
            faculty_codes=self._normalize_string_list(payload.get("faculty_codes")),
            title=self._normalize_required_text(payload.get("title"), "title", file_path),
            subtitle=self._normalize_optional_text(payload.get("subtitle")),
            section_name=self._normalize_required_text(payload.get("section_name"), "section_name", file_path),
            topic_name=self._normalize_required_text(payload.get("topic_name"), "topic_name", file_path),
            skill_level=self._normalize_required_text(payload.get("skill_level"), "skill_level", file_path),
            duration_minutes=self._normalize_positive_int(payload.get("duration_minutes"), "duration_minutes", file_path),
            max_score=self._normalize_positive_int(payload.get("max_score"), "max_score", file_path),
            summary=self._normalize_required_text(payload.get("summary"), "summary", file_path),
            checklist_items=self._normalize_checklist_items(payload.get("checklist_items"), file_path),
            quiz_questions=self._normalize_quiz_questions(payload.get("quiz_questions"), file_path),
        )

    def _get_stations_root(self) -> Path:
        return (Path(settings.media_storage_path).resolve() / "osce").resolve()

    def _normalize_positive_int(self, value: object, field_name: str, file_path: Path) -> int:
        if not isinstance(value, int) or value <= 0:
            raise BadRequestError(f"Некорректное поле {field_name} в файле станции ОСКЭ: {file_path.name}")

        return value

    def _normalize_required_text(self, value: object, field_name: str, file_path: Path) -> str:
        normalized_value = self._normalize_optional_text(value)

        if normalized_value is None:
            raise BadRequestError(f"В файле станции ОСКЭ отсутствует поле {field_name}: {file_path.name}")

        return normalized_value

    def _normalize_optional_text(self, value: object) -> str | None:
        if value is None:
            return None

        if not isinstance(value, str):
            raise BadRequestError("Текстовые поля станции ОСКЭ должны быть строками")

        normalized_value = value.strip()
        return normalized_value or None

    def _normalize_string_list(self, value: object) -> list[str]:
        if value is None:
            return []

        if not isinstance(value, list):
            raise BadRequestError("Списковые поля станции ОСКЭ должны быть массивами")

        result: list[str] = []

        for item in value:
            normalized_item = self._normalize_optional_text(item)

            if normalized_item is not None:
                result.append(normalized_item)

        return result

    def _normalize_checklist_items(self, value: object, file_path: Path) -> list[OsceChecklistItem]:
        if not isinstance(value, list) or len(value) == 0:
            raise BadRequestError(f"Некорректное поле checklist_items в файле станции ОСКЭ: {file_path.name}")

        items: list[OsceChecklistItem] = []
        seen_ids: set[str] = set()

        for item in value:
            if not isinstance(item, dict):
                raise BadRequestError(f"Некорректный пункт чек-листа в файле станции ОСКЭ: {file_path.name}")

            item_id = self._normalize_required_text(item.get("id"), "checklist_items.id", file_path).lower()

            if not ITEM_ID_PATTERN.fullmatch(item_id):
                raise BadRequestError(f"Некорректный id пункта чек-листа в файле станции ОСКЭ: {file_path.name}")

            if item_id in seen_ids:
                raise BadRequestError(f"Повторяется id пункта чек-листа в файле станции ОСКЭ: {file_path.name}")

            seen_ids.add(item_id)
            critical = item.get("critical", False)

            if not isinstance(critical, bool):
                raise BadRequestError(f"Некорректное поле checklist_items.critical в файле станции ОСКЭ: {file_path.name}")

            items.append(
                OsceChecklistItem(
                    id=item_id,
                    title=self._normalize_required_text(item.get("title"), "checklist_items.title", file_path),
                    description=self._normalize_required_text(
                        item.get("description"),
                        "checklist_items.description",
                        file_path,
                    ),
                    critical=critical,
                )
            )

        return items

    def _normalize_quiz_questions(self, value: object, file_path: Path) -> list[OsceQuizQuestion]:
        if not isinstance(value, list) or len(value) == 0:
            raise BadRequestError(f"Некорректное поле quiz_questions в файле станции ОСКЭ: {file_path.name}")

        questions: list[OsceQuizQuestion] = []
        seen_ids: set[str] = set()

        for item in value:
            if not isinstance(item, dict):
                raise BadRequestError(f"Некорректный вопрос квиза в файле станции ОСКЭ: {file_path.name}")

            question_id = self._normalize_required_text(item.get("id"), "quiz_questions.id", file_path).lower()

            if not ITEM_ID_PATTERN.fullmatch(question_id):
                raise BadRequestError(f"Некорректный id вопроса квиза в файле станции ОСКЭ: {file_path.name}")

            if question_id in seen_ids:
                raise BadRequestError(f"Повторяется id вопроса квиза в файле станции ОСКЭ: {file_path.name}")

            seen_ids.add(question_id)
            options = self._normalize_quiz_options(item.get("options"), file_path)
            correct_option_label = self._normalize_option_label(item.get("correct_option_label"), file_path)

            if correct_option_label not in {option.label for option in options}:
                raise BadRequestError(f"Некорректное поле correct_option_label в файле станции ОСКЭ: {file_path.name}")

            questions.append(
                OsceQuizQuestion(
                    id=question_id,
                    prompt=self._normalize_required_text(item.get("prompt"), "quiz_questions.prompt", file_path),
                    options=options,
                    correct_option_label=correct_option_label,
                    explanation=self._normalize_required_text(
                        item.get("explanation"),
                        "quiz_questions.explanation",
                        file_path,
                    ),
                )
            )

        return questions

    def _normalize_quiz_options(self, value: object, file_path: Path) -> list[OsceQuizOption]:
        if not isinstance(value, list) or len(value) < 2:
            raise BadRequestError(f"Некорректные варианты ответа в вопросе квиза станции ОСКЭ: {file_path.name}")

        options: list[OsceQuizOption] = []
        seen_labels: set[str] = set()

        for item in value:
            if not isinstance(item, dict):
                raise BadRequestError(f"Некорректный вариант ответа квиза в файле станции ОСКЭ: {file_path.name}")

            label = self._normalize_option_label(item.get("label"), file_path)

            if label in seen_labels:
                raise BadRequestError(f"Повторяется метка варианта ответа квиза в файле станции ОСКЭ: {file_path.name}")

            seen_labels.add(label)
            options.append(
                OsceQuizOption(
                    label=label,
                    text=self._normalize_required_text(item.get("text"), "quiz_questions.options.text", file_path),
                )
            )

        return options

    def _normalize_option_label(self, value: object, file_path: Path) -> str:
        label = self._normalize_required_text(value, "option label", file_path).upper()

        if not OPTION_LABEL_PATTERN.fullmatch(label):
            raise BadRequestError(f"Некорректная метка варианта ответа в файле станции ОСКЭ: {file_path.name}")

        return label
