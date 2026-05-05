from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.faculty import Faculty
from app.models.osce_station import OsceChecklistItem, OsceQuizOption, OsceQuizQuestion, OsceStation
from app.models.osce_station import OsceStationRecord
from app.models.topic import Topic
from app.repositories.faculty_repository import FacultyRepository
from app.repositories.osce_station_repository import OsceStationRepository
from app.repositories.topic_repository import TopicRepository
from app.schemas.admin_osce_station import (
    AdminOsceChecklistItemResponse,
    AdminOsceOptionResponse,
    AdminOsceQuestionResponse,
    AdminOsceStationDeleteResponse,
    AdminOsceStationDetailsResponse,
    AdminOsceStationListItemResponse,
    AdminOsceStationWriteRequest,
)


class AdminOsceStationService:
    def __init__(self, session: AsyncSession) -> None:
        self.faculty_repository = FacultyRepository(session)
        self.topic_repository = TopicRepository(session)
        self.session = session
        self.osce_station_repository = OsceStationRepository(session)

    async def list_stations(self) -> list[AdminOsceStationListItemResponse]:
        faculty_map = await self._build_faculty_map()
        topic_map = await self._build_topic_map(faculty_map)
        stations = await self.osce_station_repository.list_station_records()
        return [self._to_record_list_response(station, faculty_map, topic_map) for station in stations]

    async def get_station(self, slug: str) -> AdminOsceStationDetailsResponse:
        faculty_map = await self._build_faculty_map()
        topic_map = await self._build_topic_map(faculty_map)
        station = await self.osce_station_repository.get_by_slug(slug)
        return self._to_details_response(station, faculty_map, topic_map)

    async def create_station(self, payload: AdminOsceStationWriteRequest) -> AdminOsceStationDetailsResponse:
        existing_station = await self._find_station(payload.slug)

        if existing_station is not None:
            raise ConflictError("Станция ОСКЭ с таким slug уже существует")

        station = await self._build_station_from_payload(payload)
        await self.osce_station_repository.save_station(station, topic_id=payload.topic_id)
        await self.session.commit()
        return await self.get_station(station.slug)

    async def update_station(self, slug: str, payload: AdminOsceStationWriteRequest) -> AdminOsceStationDetailsResponse:
        current_station = await self._find_station(slug)

        if current_station is None:
            raise NotFoundError("Станция ОСКЭ не найдена")

        if payload.slug != slug:
            conflicting_station = await self._find_station(payload.slug)

            if conflicting_station is not None:
                raise ConflictError("Станция ОСКЭ с таким slug уже существует")

        station = await self._build_station_from_payload(payload)
        await self.osce_station_repository.save_station(station, topic_id=payload.topic_id, previous_slug=slug)
        await self.session.commit()
        return await self.get_station(station.slug)

    async def delete_station(self, slug: str) -> AdminOsceStationDeleteResponse:
        await self.osce_station_repository.delete_station(slug)
        await self.session.commit()
        return AdminOsceStationDeleteResponse(slug=slug, deleted=True)

    async def _build_station_from_payload(self, payload: AdminOsceStationWriteRequest) -> OsceStation:
        topic = await self.topic_repository.get_with_section(payload.topic_id)

        if topic is None or topic.section is None or topic.section.faculty is None:
            raise NotFoundError("Тема не найдена")

        faculty = topic.section.faculty

        return OsceStation(
            slug=payload.slug,
            faculty_codes=[faculty.code],
            title=payload.title,
            subtitle=payload.subtitle,
            section_name=topic.section.name,
            topic_name=topic.name,
            skill_level=payload.skill_level,
            duration_minutes=payload.duration_minutes,
            max_score=payload.max_score,
            summary=payload.summary,
            checklist_items=[
                OsceChecklistItem(
                    id=item.id,
                    title=item.title,
                    description=item.description,
                    critical=item.critical,
                )
                for item in payload.checklist_items
            ],
            quiz_questions=[
                OsceQuizQuestion(
                    id=question.id,
                    prompt=question.prompt,
                    options=[
                        OsceQuizOption(label=option.label, text=option.text)
                        for option in question.options
                    ],
                    correct_option_label=question.correct_option_label,
                    explanation=question.explanation,
                )
                for question in payload.quiz_questions
            ],
            topic_id=payload.topic_id,
        )

    async def _build_faculty_map(self) -> dict[str, Faculty]:
        faculties = await self.faculty_repository.list_all()
        return {faculty.code: faculty for faculty in faculties}

    async def _build_topic_map(self, faculty_map: dict[str, Faculty]) -> dict[tuple[str, str], Topic]:
        topic_map: dict[tuple[str, str], Topic] = {}

        for faculty in faculty_map.values():
            topics = await self.topic_repository.list_by_faculty(faculty.id)

            for topic in topics:
                topic_map[(faculty.code, self._normalize_key(topic.name))] = topic

        return topic_map

    async def _find_station(self, slug: str) -> OsceStation | None:
        try:
            return await self.osce_station_repository.get_by_slug(slug)
        except NotFoundError:
            return None

    def _normalize_key(self, value: str) -> str:
        return " ".join(value.strip().lower().split())

    def _resolve_context(
        self,
        station: OsceStation,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> tuple[Faculty | None, Topic | None]:
        if station.topic_id is not None:
            for (faculty_code, _), topic in topic_map.items():
                if topic.id == station.topic_id:
                    return faculty_map.get(faculty_code), topic

        faculty = next((faculty_map.get(code) for code in station.faculty_codes if code in faculty_map), None)

        if faculty is None:
            return None, None

        topic = topic_map.get((faculty.code, self._normalize_key(station.topic_name)))
        return faculty, topic

    def _resolve_record_context(
        self,
        station: OsceStationRecord,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> tuple[Faculty | None, Topic | None]:
        if station.topic_id is not None:
            for (faculty_code, _), topic in topic_map.items():
                if topic.id == station.topic_id:
                    return faculty_map.get(faculty_code), topic

        faculty = next((faculty_map.get(code) for code in station.faculty_codes if code in faculty_map), None)

        if faculty is None:
            return None, None

        topic = topic_map.get((faculty.code, self._normalize_key(station.topic_name)))
        return faculty, topic

    def _to_list_response(
        self,
        station: OsceStation,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> AdminOsceStationListItemResponse:
        faculty, topic = self._resolve_context(station, faculty_map, topic_map)

        return AdminOsceStationListItemResponse(
            slug=station.slug,
            faculty_code=station.faculty_codes[0] if station.faculty_codes else "",
            faculty_name=faculty.name if faculty is not None else None,
            section_name=station.section_name,
            topic_id=topic.id if topic is not None else None,
            topic_name=station.topic_name,
            title=station.title,
            subtitle=station.subtitle,
            skill_level=station.skill_level,
            duration_minutes=station.duration_minutes,
            max_score=station.max_score,
            summary=station.summary,
            checklist_items_count=len(station.checklist_items),
            quiz_questions_count=len(station.quiz_questions),
        )

    def _to_record_list_response(
        self,
        station: OsceStationRecord,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> AdminOsceStationListItemResponse:
        faculty, topic = self._resolve_record_context(station, faculty_map, topic_map)

        return AdminOsceStationListItemResponse(
            slug=station.slug,
            faculty_code=station.faculty_codes[0] if station.faculty_codes else "",
            faculty_name=faculty.name if faculty is not None else None,
            section_name=station.section_name,
            topic_id=topic.id if topic is not None else None,
            topic_name=station.topic_name,
            title=station.title,
            subtitle=station.subtitle,
            skill_level=station.skill_level,
            duration_minutes=station.duration_minutes,
            max_score=station.max_score,
            summary=station.summary,
            checklist_items_count=len(station.checklist_items or []),
            quiz_questions_count=len(station.quiz_questions or []),
        )

    def _to_details_response(
        self,
        station: OsceStation,
        faculty_map: dict[str, Faculty],
        topic_map: dict[tuple[str, str], Topic],
    ) -> AdminOsceStationDetailsResponse:
        faculty, topic = self._resolve_context(station, faculty_map, topic_map)

        return AdminOsceStationDetailsResponse(
            slug=station.slug,
            faculty_code=station.faculty_codes[0] if station.faculty_codes else "",
            faculty_name=faculty.name if faculty is not None else None,
            section_name=station.section_name,
            topic_id=topic.id if topic is not None else None,
            topic_name=station.topic_name,
            title=station.title,
            subtitle=station.subtitle,
            skill_level=station.skill_level,
            duration_minutes=station.duration_minutes,
            max_score=station.max_score,
            summary=station.summary,
            checklist_items_count=len(station.checklist_items),
            quiz_questions_count=len(station.quiz_questions),
            checklist_items=[
                AdminOsceChecklistItemResponse(
                    id=item.id,
                    title=item.title,
                    description=item.description,
                    critical=item.critical,
                )
                for item in station.checklist_items
            ],
            quiz_questions=[
                AdminOsceQuestionResponse(
                    id=question.id,
                    prompt=question.prompt,
                    options=[
                        AdminOsceOptionResponse(label=option.label, text=option.text)
                        for option in question.options
                    ],
                    correct_option_label=question.correct_option_label,
                    explanation=question.explanation,
                )
                for question in station.quiz_questions
            ],
        )
