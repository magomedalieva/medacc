from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.faculty import Faculty
from app.models.question import Question
from app.models.section import Section
from app.models.topic import Topic
from app.repositories.clinical_case_repository import ClinicalCaseRepository
from app.repositories.osce_station_repository import OsceStationRepository
from app.schemas.admin_content import (
    AdminContentCoverageFacultyResponse,
    AdminContentCoverageResponse,
    AdminContentCoverageSectionResponse,
    AdminContentCoverageTargetsResponse,
    AdminContentCoverageTopicResponse,
    AdminContentCoverageTotalsResponse,
)
from app.services.accreditation_service import (
    CASE_STAGE_CASE_COUNT,
    CASE_STAGE_TOTAL_QUESTIONS,
    FULL_EXAM_QUESTION_COUNT,
    OSCE_STAGE_STATION_COUNT,
)


@dataclass
class CoverageCounter:
    active_question_count: int = 0
    inactive_question_count: int = 0
    case_count: int = 0
    case_quiz_question_count: int = 0
    osce_station_count: int = 0
    osce_checklist_item_count: int = 0
    osce_quiz_question_count: int = 0

    def add(self, other: "CoverageCounter") -> None:
        self.active_question_count += other.active_question_count
        self.inactive_question_count += other.inactive_question_count
        self.case_count += other.case_count
        self.case_quiz_question_count += other.case_quiz_question_count
        self.osce_station_count += other.osce_station_count
        self.osce_checklist_item_count += other.osce_checklist_item_count
        self.osce_quiz_question_count += other.osce_quiz_question_count


@dataclass
class TopicCoverage:
    topic_id: int
    topic_name: str
    section_id: int
    section_name: str
    counter: CoverageCounter = field(default_factory=CoverageCounter)


@dataclass
class SectionCoverage:
    section_id: int
    section_name: str
    counter: CoverageCounter = field(default_factory=CoverageCounter)
    topics: list[TopicCoverage] = field(default_factory=list)


@dataclass
class FacultyCoverage:
    faculty_id: int
    faculty_code: str
    faculty_name: str
    counter: CoverageCounter = field(default_factory=CoverageCounter)
    sections: list[SectionCoverage] = field(default_factory=list)


class AdminContentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.case_repository = ClinicalCaseRepository(session)
        self.osce_station_repository = OsceStationRepository(session)

    async def get_coverage(self) -> AdminContentCoverageResponse:
        faculties = await self._list_faculties()
        faculty_coverages, topic_by_id, topic_by_context = self._build_coverage_index(faculties)

        await self._apply_question_counts(topic_by_id)
        self._roll_up_faculty_counts(faculty_coverages)

        for clinical_case in await self.case_repository.list_cases():
            for topic_coverage in self._resolve_topic_coverages(
                topic_by_id,
                topic_by_context,
                clinical_case.topic_id,
                clinical_case.faculty_codes,
                clinical_case.topic_name,
            ):
                topic_coverage.counter.case_count += 1
                topic_coverage.counter.case_quiz_question_count += len(clinical_case.quiz_questions)

        for station in await self.osce_station_repository.list_stations():
            for topic_coverage in self._resolve_topic_coverages(
                topic_by_id,
                topic_by_context,
                station.topic_id,
                station.faculty_codes,
                station.topic_name,
            ):
                topic_coverage.counter.osce_station_count += 1
                topic_coverage.counter.osce_checklist_item_count += len(station.checklist_items)
                topic_coverage.counter.osce_quiz_question_count += len(station.quiz_questions)

        self._roll_up_faculty_counts(faculty_coverages)
        totals = CoverageCounter()

        for faculty_coverage in faculty_coverages:
            totals.add(faculty_coverage.counter)

        return AdminContentCoverageResponse(
            targets=AdminContentCoverageTargetsResponse(
                active_question_count=FULL_EXAM_QUESTION_COUNT,
                case_count=CASE_STAGE_CASE_COUNT,
                case_quiz_question_count=CASE_STAGE_TOTAL_QUESTIONS,
                osce_station_count=OSCE_STAGE_STATION_COUNT,
            ),
            totals=self._to_totals_response(totals),
            faculties=[self._to_faculty_response(faculty_coverage) for faculty_coverage in faculty_coverages],
        )

    async def _list_faculties(self) -> list[Faculty]:
        result = await self.session.execute(
            select(Faculty)
            .options(selectinload(Faculty.sections).selectinload(Section.topics))
            .order_by(Faculty.name)
        )
        return list(result.scalars().unique().all())

    def _build_coverage_index(
        self,
        faculties: list[Faculty],
    ) -> tuple[list[FacultyCoverage], dict[int, TopicCoverage], dict[tuple[str, str], list[TopicCoverage]]]:
        faculty_coverages: list[FacultyCoverage] = []
        topic_by_id: dict[int, TopicCoverage] = {}
        topic_by_context: dict[tuple[str, str], list[TopicCoverage]] = {}

        for faculty in faculties:
            faculty_coverage = FacultyCoverage(
                faculty_id=faculty.id,
                faculty_code=faculty.code,
                faculty_name=faculty.name,
            )

            for section in sorted(faculty.sections, key=lambda item: (item.order_index, item.name, item.id)):
                section_coverage = SectionCoverage(section_id=section.id, section_name=section.name)

                for topic in sorted(section.topics, key=lambda item: (item.order_index, item.name, item.id)):
                    topic_coverage = TopicCoverage(
                        topic_id=topic.id,
                        topic_name=topic.name,
                        section_id=section.id,
                        section_name=section.name,
                    )
                    section_coverage.topics.append(topic_coverage)
                    topic_by_id[topic.id] = topic_coverage
                    topic_by_context.setdefault((faculty.code, self._normalize_key(topic.name)), []).append(topic_coverage)

                faculty_coverage.sections.append(section_coverage)

            faculty_coverages.append(faculty_coverage)

        return faculty_coverages, topic_by_id, topic_by_context

    async def _apply_question_counts(self, topic_by_id: dict[int, TopicCoverage]) -> None:
        result = await self.session.execute(
            select(Question.topic_id, Question.is_active, func.count(Question.id))
            .group_by(Question.topic_id, Question.is_active)
        )

        for topic_id, is_active, count in result.all():
            topic_coverage = topic_by_id.get(topic_id)

            if topic_coverage is None:
                continue

            if is_active:
                topic_coverage.counter.active_question_count += int(count)
            else:
                topic_coverage.counter.inactive_question_count += int(count)

    def _roll_up_faculty_counts(self, faculty_coverages: list[FacultyCoverage]) -> None:
        for faculty_coverage in faculty_coverages:
            faculty_coverage.counter = CoverageCounter()

            for section_coverage in faculty_coverage.sections:
                section_coverage.counter = CoverageCounter()

                for topic_coverage in section_coverage.topics:
                    section_coverage.counter.add(topic_coverage.counter)

                faculty_coverage.counter.add(section_coverage.counter)

    def _resolve_topic_coverages(
        self,
        topic_by_id: dict[int, TopicCoverage],
        topic_by_context: dict[tuple[str, str], list[TopicCoverage]],
        topic_id: int | None,
        faculty_codes: list[str],
        topic_name: str,
    ) -> list[TopicCoverage]:
        if topic_id is not None and topic_id in topic_by_id:
            return [topic_by_id[topic_id]]

        normalized_topic = self._normalize_key(topic_name)

        if faculty_codes:
            resolved: list[TopicCoverage] = []

            for faculty_code in faculty_codes:
                resolved.extend(topic_by_context.get((faculty_code, normalized_topic), []))

            return resolved

        return [
            topic_coverage
            for (__, context_topic_name), coverages in topic_by_context.items()
            if context_topic_name == normalized_topic
            for topic_coverage in coverages
        ]

    def _to_faculty_response(self, faculty_coverage: FacultyCoverage) -> AdminContentCoverageFacultyResponse:
        gaps: list[str] = []

        if faculty_coverage.counter.active_question_count < FULL_EXAM_QUESTION_COUNT:
            gaps.append("tests")

        if (
            faculty_coverage.counter.case_count < CASE_STAGE_CASE_COUNT
            or faculty_coverage.counter.case_quiz_question_count < CASE_STAGE_TOTAL_QUESTIONS
        ):
            gaps.append("cases")

        if faculty_coverage.counter.osce_station_count < OSCE_STAGE_STATION_COUNT:
            gaps.append("osce")

        return AdminContentCoverageFacultyResponse(
            faculty_id=faculty_coverage.faculty_id,
            faculty_code=faculty_coverage.faculty_code,
            faculty_name=faculty_coverage.faculty_name,
            **self._counter_payload(faculty_coverage.counter),
            strict_simulation_ready=len(gaps) == 0,
            gaps=gaps,
            sections=[
                AdminContentCoverageSectionResponse(
                    section_id=section_coverage.section_id,
                    section_name=section_coverage.section_name,
                    **self._counter_payload(section_coverage.counter),
                    topics=[
                        AdminContentCoverageTopicResponse(
                            topic_id=topic_coverage.topic_id,
                            topic_name=topic_coverage.topic_name,
                            section_id=topic_coverage.section_id,
                            section_name=topic_coverage.section_name,
                            **self._counter_payload(topic_coverage.counter),
                        )
                        for topic_coverage in section_coverage.topics
                    ],
                )
                for section_coverage in faculty_coverage.sections
            ],
        )

    def _to_totals_response(self, counter: CoverageCounter) -> AdminContentCoverageTotalsResponse:
        return AdminContentCoverageTotalsResponse(**self._counter_payload(counter))

    def _counter_payload(self, counter: CoverageCounter) -> dict[str, int]:
        return {
            "active_question_count": counter.active_question_count,
            "inactive_question_count": counter.inactive_question_count,
            "case_count": counter.case_count,
            "case_quiz_question_count": counter.case_quiz_question_count,
            "osce_station_count": counter.osce_station_count,
            "osce_checklist_item_count": counter.osce_checklist_item_count,
            "osce_quiz_question_count": counter.osce_quiz_question_count,
        }

    def _normalize_key(self, value: str) -> str:
        return " ".join(value.strip().lower().split())
