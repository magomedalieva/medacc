from decimal import Decimal
from typing import Any

from sqlalchemy import func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import UserRole
from app.models.exam_simulation import ExamSimulation, ExamSimulationStage
from app.models.user import User
from app.schemas.admin_student import (
    AdminStudentListItemResponse,
    AdminStudentListResponse,
    AdminStudentProgressResponse,
)


FULL_EXAM_QUESTION_COUNT = 80
CASE_STAGE_CASE_COUNT = 2
CASE_STAGE_TOTAL_QUESTIONS = 24
OSCE_STAGE_STATION_COUNT = 5
TEST_STUDENT_LOCAL_PREFIXES = ("e2e-", "visual-schedule-", "planner.integration.", "test-")
TEST_STUDENT_DOMAINS = ("example.com", "example.test", "test.com", "medacc-demo.com")
TEST_STUDENT_EMAIL_PATTERNS = (
    *(f"{prefix}%" for prefix in TEST_STUDENT_LOCAL_PREFIXES),
    *(f"%@{domain}" for domain in TEST_STUDENT_DOMAINS),
    "%@%.test",
)


def is_test_student_email(email: str) -> bool:
    normalized_email = email.strip().lower()
    local_part, separator, domain = normalized_email.partition("@")

    if not separator:
        return False

    return (
        domain in TEST_STUDENT_DOMAINS
        or domain.endswith(".test")
        or any(local_part.startswith(prefix) for prefix in TEST_STUDENT_LOCAL_PREFIXES)
    )


class AdminStudentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_students(
        self,
        *,
        faculty_id: int | None,
        search: str | None,
        limit: int,
        offset: int,
    ) -> AdminStudentListResponse:
        filters = [User.role == UserRole.STUDENT]
        filters.append(not_(or_(*(User.email.ilike(pattern) for pattern in TEST_STUDENT_EMAIL_PATTERNS))))

        if faculty_id is not None:
            filters.append(User.faculty_id == faculty_id)

        if search:
            query = f"%{search.strip()}%"
            filters.append(
                or_(
                    User.first_name.ilike(query),
                    User.last_name.ilike(query),
                    User.email.ilike(query),
                )
            )

        total = int((await self.session.scalar(select(func.count(User.id)).where(*filters))) or 0)
        result = await self.session.execute(
            select(User)
            .options(selectinload(User.faculty))
            .where(*filters)
            .order_by(User.created_at.desc(), User.id.desc())
            .limit(limit)
            .offset(offset)
        )
        users = list(result.scalars().all())
        latest_simulations = await self._latest_simulations_by_user([user.id for user in users])

        return AdminStudentListResponse(
            items=[
                self._to_student_response(
                    user,
                    latest_simulations.get(user.id),
                )
                for user in users
            ],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def _latest_simulations_by_user(self, user_ids: list[int]) -> dict[int, ExamSimulation]:
        if not user_ids:
            return {}

        result = await self.session.execute(
            select(ExamSimulation)
            .options(selectinload(ExamSimulation.stages))
            .where(
                ExamSimulation.user_id.in_(user_ids),
                ExamSimulation.simulation_type == "full_accreditation",
            )
            .order_by(ExamSimulation.user_id.asc(), ExamSimulation.created_at.desc())
        )

        latest_by_user: dict[int, ExamSimulation] = {}
        for simulation in result.scalars().all():
            latest_by_user.setdefault(simulation.user_id, simulation)

        return latest_by_user

    def _to_student_response(
        self,
        user: User,
        latest_simulation: ExamSimulation | None,
    ) -> AdminStudentListItemResponse:
        return AdminStudentListItemResponse(
            id=user.id,
            first_name=user.first_name,
            last_name=user.last_name,
            email=user.email,
            faculty_id=user.faculty_id,
            faculty_name=user.faculty.name if user.faculty is not None else None,
            accreditation_date=user.accreditation_date,
            onboarding_completed=user.onboarding_completed,
            created_at=user.created_at,
            last_login_at=user.last_login_at,
            last_activity_date=user.last_activity_date,
            progress=self._build_progress(latest_simulation),
        )

    def _build_progress(self, simulation: ExamSimulation | None) -> AdminStudentProgressResponse:
        stages_by_key = {stage.stage_key: stage for stage in simulation.stages} if simulation is not None else {}
        tests_percent = self._stage_progress("tests", stages_by_key.get("tests"))
        cases_percent = self._stage_progress("cases", stages_by_key.get("cases"))
        osce_percent = self._stage_progress("osce", stages_by_key.get("osce"))
        overall_percent = round((tests_percent + cases_percent + osce_percent) / 3)
        stage_statuses = {stage.status for stage in stages_by_key.values()}

        if simulation is None:
            protocol_status = "not_started"
            protocol_label = "Не начата"
        elif all(
            stages_by_key.get(stage_key) is not None and stages_by_key[stage_key].status == "passed"
            for stage_key in ("tests", "cases", "osce")
        ):
            protocol_status = "ready"
            protocol_label = "Готова"
        elif "failed" in stage_statuses:
            protocol_status = "risk"
            protocol_label = "Есть риск"
        else:
            protocol_status = "in_progress"
            protocol_label = "В процессе"

        return AdminStudentProgressResponse(
            overall_percent=overall_percent,
            tests_percent=tests_percent,
            cases_percent=cases_percent,
            osce_percent=osce_percent,
            protocol_status=protocol_status,
            protocol_label=protocol_label,
            latest_simulation_status=simulation.status if simulation is not None else None,
            latest_simulation_score_percent=self._to_optional_float(simulation.score_percent) if simulation is not None else None,
            latest_simulation_started_at=simulation.started_at if simulation is not None else None,
            latest_simulation_finished_at=simulation.finished_at if simulation is not None else None,
        )

    def _stage_progress(self, stage_key: str, stage: ExamSimulationStage | None) -> int:
        if stage is None:
            return 0

        if stage.status == "passed":
            return 100

        if stage.status == "failed" and stage.score_percent is not None:
            return self._clamp_percent(self._to_float(stage.score_percent))

        details = stage.details or {}
        if stage_key == "tests":
            return self._ratio_percent(
                self._detail_number(details, "answered_questions") or 0,
                self._detail_number(details, "total_questions")
                or self._detail_number(details, "assigned_question_count")
                or FULL_EXAM_QUESTION_COUNT,
            )

        if stage_key == "cases":
            case_progress = self._ratio_percent(
                self._detail_number(details, "case_count") or 0,
                self._detail_number(details, "required_case_count") or CASE_STAGE_CASE_COUNT,
            )
            question_progress = self._ratio_percent(
                self._detail_number(details, "total_questions") or 0,
                self._detail_number(details, "required_total_questions") or CASE_STAGE_TOTAL_QUESTIONS,
            )
            return max(case_progress, question_progress)

        if stage_key == "osce":
            return self._ratio_percent(
                self._detail_number(details, "station_count") or 0,
                self._detail_number(details, "required_station_count") or OSCE_STAGE_STATION_COUNT,
            )

        return 0

    def _ratio_percent(self, value: float, total: float) -> int:
        if total <= 0:
            return 0

        return self._clamp_percent((value / total) * 100)

    def _clamp_percent(self, value: float) -> int:
        return round(max(0.0, min(100.0, value)))

    def _detail_number(self, details: dict[str, Any], key: str) -> float | None:
        value = details.get(key)

        if isinstance(value, bool) or value is None:
            return None

        if isinstance(value, (int, float, Decimal)):
            return float(value)

        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return None

        return None

    def _to_float(self, value: Decimal | float | int) -> float:
        return float(value)

    def _to_optional_float(self, value: Decimal | float | int | None) -> float | None:
        if value is None:
            return None

        return self._to_float(value)
