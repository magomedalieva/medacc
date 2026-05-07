import hashlib
from itertools import combinations
import json
import random
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utc_now
from app.core.exceptions import BadRequestError, NotFoundError
from app.models.exam_simulation import ExamSimulation, ExamSimulationStage
from app.models.user import User
from app.repositories.clinical_case_attempt_repository import ClinicalCaseAttemptRepository
from app.repositories.clinical_case_repository import ClinicalCaseRepository
from app.repositories.exam_simulation_repository import ExamSimulationRepository
from app.repositories.faculty_repository import FacultyRepository
from app.repositories.osce_attempt_repository import OsceAttemptRepository
from app.repositories.osce_station_repository import OsceStationRepository
from app.repositories.question_repository import QuestionRepository
from app.schemas.accreditation import (
    ExamSimulationResponse,
    ExamSimulationStageResponse,
)
from app.schemas.analytics import ExamReadinessProtocolResponse, ExamStageProtocolResponse


ACCREDITATION_PASS_PERCENT = 70.0
FULL_EXAM_QUESTION_COUNT = 80
FULL_EXAM_TIME_LIMIT_MINUTES = 60
CASE_STAGE_CASE_COUNT = 2
CASE_STAGE_TOTAL_QUESTIONS = 24
OSCE_STAGE_STATION_COUNT = 5
EXAM_STAGE_KEYS = ("tests", "cases", "osce")
CONTENT_SNAPSHOT_VERSION = "content_snapshot_v1"
SCORING_RULES_VERSION = "strict_accreditation_v1"
REMEDIATION_PLAN_VERSION = "remediation_v1"


class AccreditationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.exam_simulation_repository = ExamSimulationRepository(session)
        self.case_attempt_repository = ClinicalCaseAttemptRepository(session)
        self.case_repository = ClinicalCaseRepository(session)
        self.faculty_repository = FacultyRepository(session)
        self.osce_attempt_repository = OsceAttemptRepository(session)
        self.osce_station_repository = OsceStationRepository(session)
        self.question_repository = QuestionRepository(session)

    async def create_simulation(
        self,
        user: User,
        simulation_type: str = "full_accreditation",
    ) -> ExamSimulationResponse:
        self._ensure_onboarding_completed(user)
        now = utc_now()
        previous_simulations = await self.exam_simulation_repository.list_by_user(user.id)
        stage_details = await self._build_simulation_stage_details(
            user,
            assigned_at=now,
            previous_simulations=previous_simulations,
        )

        for active_simulation in previous_simulations:
            if active_simulation.simulation_type == simulation_type and active_simulation.status == "active":
                active_simulation.status = "cancelled"
                active_simulation.finished_at = now

        simulation = ExamSimulation(
            user_id=user.id,
            simulation_type=simulation_type,
            status="active",
            started_at=now,
        )
        self.exam_simulation_repository.add(simulation)
        await self.session.flush()

        for stage_key in EXAM_STAGE_KEYS:
            self.session.add(
                ExamSimulationStage(
                    simulation_id=simulation.id,
                    stage_key=stage_key,
                    status="unconfirmed",
                    details=stage_details[stage_key],
                )
            )

        await self.session.commit()
        await self.session.refresh(simulation)
        simulation = await self.exam_simulation_repository.get_by_user_and_id(user.id, simulation.id) or simulation
        return self._to_simulation_response(simulation)

    async def list_simulations(self, user: User) -> list[ExamSimulationResponse]:
        self._ensure_onboarding_completed(user)
        simulations = await self.exam_simulation_repository.list_by_user(user.id)
        return [self._to_simulation_response(simulation) for simulation in simulations]

    async def get_exam_protocol(self, user: User) -> ExamReadinessProtocolResponse:
        simulation = await self.exam_simulation_repository.get_latest_by_user(user.id)
        stages_by_key = self._build_stages_by_key(simulation)
        stages = [
            self._build_protocol_stage("tests", stages_by_key.get("tests")),
            self._build_protocol_stage("cases", stages_by_key.get("cases")),
            self._build_protocol_stage("osce", stages_by_key.get("osce")),
        ]
        failed_or_unconfirmed = [stage for stage in stages if stage.status != "passed"]

        if failed_or_unconfirmed:
            failed_stages = [stage for stage in failed_or_unconfirmed if stage.status == "failed"]
            summary = (
                "В пробной аккредитации есть проваленный этап. Пробная аккредитация не сдана: разберите причину и начните новую пробную аккредитацию."
                if failed_stages
                else "Пробная аккредитация еще не завершена: пройдите все три этапа."
            )
            return ExamReadinessProtocolResponse(
                overall_status="not_ready",
                overall_status_label="Пробная аккредитация не сдана" if failed_stages else "Пробная аккредитация не начата",
                summary=summary,
                stages=stages,
                action_items=[stage.detail for stage in failed_or_unconfirmed][:4],
            )

        return ExamReadinessProtocolResponse(
            overall_status="ready",
            overall_status_label="Протокол подтвержден",
            summary="Все три этапа подтверждены в пробной аккредитации по порогу 70%+.",
            stages=stages,
            action_items=[],
        )

    async def get_owned_simulation(self, user: User, simulation_id: UUID) -> ExamSimulation:
        simulation = await self.exam_simulation_repository.get_by_user_and_id(user.id, simulation_id)

        if simulation is None:
            raise NotFoundError("Пробная аккредитация не найдена")

        if simulation.status in {"completed", "cancelled"}:
            raise BadRequestError("Эта пробная аккредитация уже завершена")

        return simulation

    async def ensure_case_can_start(self, user: User, simulation_id: UUID, case_slug: str) -> ExamSimulation:
        simulation = await self.ensure_stage_can_start(user, simulation_id, "cases")
        stage = self._build_stages_by_key(simulation).get("cases")
        assigned_slugs = self._assigned_slugs(stage, "assigned_case_slugs")
        normalized_slug = case_slug.strip().lower()

        if assigned_slugs and normalized_slug not in assigned_slugs:
            raise BadRequestError("Этот кейс не входит в состав кейсового этапа текущей пробной аккредитации")

        attempts = await self.case_attempt_repository.list_by_simulation(simulation_id)
        if any(attempt.case_slug == normalized_slug for attempt in attempts):
            raise BadRequestError("Этот кейс уже завершен в текущей пробной аккредитации")

        return simulation

    async def ensure_osce_station_can_start(self, user: User, simulation_id: UUID, station_slug: str) -> ExamSimulation:
        simulation = await self.ensure_stage_can_start(user, simulation_id, "osce")
        stage = self._build_stages_by_key(simulation).get("osce")
        assigned_slugs = self._assigned_slugs(stage, "assigned_station_slugs")
        normalized_slug = station_slug.strip().lower()

        if assigned_slugs and normalized_slug not in assigned_slugs:
            raise BadRequestError("Эта станция не входит в состав практического этапа текущей пробной аккредитации")

        attempts = await self.osce_attempt_repository.list_by_simulation(simulation_id)
        if any(attempt.station_slug == normalized_slug for attempt in attempts):
            raise BadRequestError("Эта станция уже завершена в текущей пробной аккредитации")

        return simulation

    async def ensure_stage_can_start(self, user: User, simulation_id: UUID, stage_key: str) -> ExamSimulation:
        simulation = await self.get_owned_simulation(user, simulation_id)
        stage = self._build_stages_by_key(simulation).get(stage_key)

        if stage is None:
            raise BadRequestError("Этап пробной аккредитации не найден")

        if stage.status in {"passed", "failed"}:
            raise BadRequestError(
                f"{self._stage_label(stage_key)} уже завершен в этой пробной аккредитации. "
                "Чтобы пересдать этап, начните новую пробную аккредитацию."
            )

        return simulation

    async def record_test_stage_result(
        self,
        *,
        user: User,
        simulation_id: UUID,
        score_percent: float,
        total_questions: int,
        answered_questions: int,
        correct_answers: int,
        started_at: datetime,
        finished_at: datetime,
        question_ids: list[int] | None = None,
    ) -> tuple[str, dict | None, bool]:
        simulation = await self.get_owned_simulation(user, simulation_id)
        if total_questions < FULL_EXAM_QUESTION_COUNT:
            raise BadRequestError("Тестовый этап пробной аккредитации должен содержать 80 вопросов")

        passed = score_percent >= ACCREDITATION_PASS_PERCENT
        stage = self._build_stages_by_key(simulation).get("tests")
        if stage is not None and stage.status in {"passed", "failed"}:
            return stage.status, None, False

        existing_details = dict(stage.details or {}) if stage is not None else {}
        updated_details = {
            **existing_details,
            "content_snapshot": {
                "question_ids": list(question_ids or []),
                "questions_count": len(question_ids or []),
            },
            "content_snapshot_hash": self._snapshot_signature(
                {
                    "question_ids": list(question_ids or []),
                    "questions_count": len(question_ids or []),
                }
            ),
            "scoring_rules": self._test_scoring_rules(),
            "total_questions": total_questions,
            "answered_questions": answered_questions,
            "correct_answers": correct_answers,
            "requirement": "80_questions_70_percent",
        }
        if not passed:
            updated_details["remediation_plan"] = self._build_test_remediation_plan(
                score_percent=score_percent,
                total_questions=total_questions,
                answered_questions=answered_questions,
                correct_answers=correct_answers,
            )
        await self._update_stage(
            simulation=simulation,
            stage_key="tests",
            status="passed" if passed else "failed",
            score_percent=score_percent,
            passed=passed,
            details=updated_details,
            started_at=started_at,
            finished_at=finished_at,
        )
        self._refresh_simulation_status(simulation)
        return "passed" if passed else "failed", updated_details.get("remediation_plan"), True

    async def record_case_stage_progress(self, user: User, simulation_id: UUID) -> tuple[str, dict | None, bool]:
        simulation = await self.get_owned_simulation(user, simulation_id)
        stage = self._build_stages_by_key(simulation).get("cases")
        if stage is not None and stage.status in {"passed", "failed"}:
            return stage.status, None, False

        existing_details = dict(stage.details or {}) if stage is not None else {}
        assigned_slugs = self._assigned_slugs(stage, "assigned_case_slugs")
        attempts = await self.case_attempt_repository.list_by_simulation(simulation_id)
        attempts_by_slug = {}

        for attempt in attempts:
            attempts_by_slug.setdefault(attempt.case_slug, attempt)

        selected_attempts = (
            [attempts_by_slug[slug] for slug in assigned_slugs if slug in attempts_by_slug]
            if assigned_slugs
            else attempts[:CASE_STAGE_CASE_COUNT]
        )

        if len(selected_attempts) == 0:
            return "active", None, False

        case_snapshots_by_slug = {
            str(item.get("slug", "")).strip().lower(): item
            for item in existing_details.get("assigned_cases", [])
            if isinstance(item, dict)
        }
        total_questions = sum(item.answered_questions for item in selected_attempts)
        correct_answers = sum(item.correct_answers for item in selected_attempts)
        score_percent = self._calculate_percent(correct_answers, total_questions)
        stage_finished = len(selected_attempts) >= CASE_STAGE_CASE_COUNT
        passed_case_count = len(
            [
                item
                for item in selected_attempts
                if float(item.accuracy_percent or 0) >= ACCREDITATION_PASS_PERCENT
            ]
        )
        passed = (
            stage_finished
            and total_questions >= CASE_STAGE_TOTAL_QUESTIONS
            and score_percent >= ACCREDITATION_PASS_PERCENT
            and passed_case_count >= CASE_STAGE_CASE_COUNT
        )
        status = "passed" if passed else "failed" if stage_finished else "active"
        case_results = [
            {
                "slug": item.case_slug,
                "snapshot_hash": case_snapshots_by_slug.get(item.case_slug, {}).get("snapshot_hash"),
                "score_percent": self._to_optional_float(item.accuracy_percent),
                "passed": float(item.accuracy_percent or 0) >= ACCREDITATION_PASS_PERCENT,
            }
            for item in selected_attempts
        ]
        updated_details = {
            **existing_details,
            "case_count": len(selected_attempts),
            "required_case_count": CASE_STAGE_CASE_COUNT,
            "total_questions": total_questions,
            "correct_answers": correct_answers,
            "passed_case_count": passed_case_count,
            "required_total_questions": CASE_STAGE_TOTAL_QUESTIONS,
            "requirement": "2_cases_24_questions_70_percent",
            "attempted_case_slugs": [item.case_slug for item in selected_attempts],
            "case_results": case_results,
        }
        if stage_finished and not passed:
            updated_details["remediation_plan"] = self._build_case_remediation_plan(
                details=updated_details,
                score_percent=score_percent,
                total_questions=total_questions,
                passed_case_count=passed_case_count,
                case_results=case_results,
            )

        await self._update_stage(
            simulation=simulation,
            stage_key="cases",
            status=status,
            score_percent=score_percent if stage_finished else None,
            passed=passed if stage_finished else None,
            details=updated_details,
            started_at=min((item.submitted_at for item in selected_attempts), default=None),
            finished_at=max((item.submitted_at for item in selected_attempts), default=None),
        )
        self._refresh_simulation_status(simulation)
        return status, updated_details.get("remediation_plan"), status in {"passed", "failed"}

    async def record_osce_stage_progress(self, user: User, simulation_id: UUID) -> tuple[str, dict | None, bool]:
        simulation = await self.get_owned_simulation(user, simulation_id)
        stage = self._build_stages_by_key(simulation).get("osce")
        if stage is not None and stage.status in {"passed", "failed"}:
            return stage.status, None, False

        existing_details = dict(stage.details or {}) if stage is not None else {}
        assigned_slugs = self._assigned_slugs(stage, "assigned_station_slugs")
        attempts = await self.osce_attempt_repository.list_by_simulation(simulation_id)
        latest_by_station = {}

        for attempt in attempts:
            latest_by_station.setdefault(attempt.station_slug, attempt)

        selected_attempts = (
            [latest_by_station[slug] for slug in assigned_slugs if slug in latest_by_station]
            if assigned_slugs
            else list(latest_by_station.values())[:OSCE_STAGE_STATION_COUNT]
        )

        if len(selected_attempts) == 0:
            return "active", None, False

        station_snapshots_by_slug = {
            str(item.get("slug", "")).strip().lower(): item
            for item in existing_details.get("assigned_stations", [])
            if isinstance(item, dict)
        }
        score_percent = self._calculate_percent(
            sum(float(item.total_score_percent or 0) for item in selected_attempts),
            len(selected_attempts) * 100,
        )
        has_full_workload = len(selected_attempts) >= OSCE_STAGE_STATION_COUNT
        passed = has_full_workload and all(
            float(item.total_score_percent or 0) >= ACCREDITATION_PASS_PERCENT for item in selected_attempts
        )
        status = "passed" if passed else "failed" if has_full_workload else "active"
        station_results = [
            {
                "slug": item.station_slug,
                "snapshot_hash": station_snapshots_by_slug.get(item.station_slug, {}).get("snapshot_hash"),
                "score_percent": self._to_optional_float(item.total_score_percent),
                "passed": float(item.total_score_percent or 0) >= ACCREDITATION_PASS_PERCENT,
            }
            for item in selected_attempts
        ]
        passed_station_count = len(
            [
                item
                for item in selected_attempts
                if float(item.total_score_percent or 0) >= ACCREDITATION_PASS_PERCENT
            ]
        )
        updated_details = {
            **existing_details,
            "station_count": len(selected_attempts),
            "required_station_count": OSCE_STAGE_STATION_COUNT,
            "passed_station_count": passed_station_count,
            "requirement": "5_stations_each_70_percent",
            "attempted_station_slugs": [item.station_slug for item in selected_attempts],
            "station_results": station_results,
        }
        if has_full_workload and not passed:
            updated_details["remediation_plan"] = self._build_osce_remediation_plan(
                details=updated_details,
                score_percent=score_percent,
                passed_station_count=passed_station_count,
                station_results=station_results,
            )

        await self._update_stage(
            simulation=simulation,
            stage_key="osce",
            status=status,
            score_percent=score_percent if has_full_workload else None,
            passed=passed if has_full_workload else None,
            details=updated_details,
            started_at=min((item.submitted_at for item in selected_attempts), default=None),
            finished_at=max((item.submitted_at for item in selected_attempts), default=None),
        )
        self._refresh_simulation_status(simulation)
        return status, updated_details.get("remediation_plan"), status in {"passed", "failed"}

    async def _update_stage(
        self,
        *,
        simulation: ExamSimulation,
        stage_key: str,
        status: str,
        score_percent: float | None,
        passed: bool | None,
        details: dict,
        started_at: datetime | None,
        finished_at: datetime | None,
    ) -> None:
        stage = await self.exam_simulation_repository.get_stage(simulation.id, stage_key)

        if stage is None:
            stage = ExamSimulationStage(
                simulation_id=simulation.id,
                stage_key=stage_key,
            )
            self.session.add(stage)
            simulation.stages.append(stage)

        stage.status = status
        stage.score_percent = score_percent
        stage.passed = passed
        stage.details = details
        stage.started_at = started_at
        stage.finished_at = finished_at

    def _refresh_simulation_status(self, simulation: ExamSimulation) -> None:
        stages_by_key = self._build_stages_by_key(simulation)
        final_stages = [stages_by_key.get(stage_key) for stage_key in EXAM_STAGE_KEYS]

        if any(stage is None or stage.status in {"unconfirmed", "active"} for stage in final_stages):
            simulation.status = "active"
            simulation.passed = None
            simulation.score_percent = None
            simulation.finished_at = None
            return

        score_values = [float(stage.score_percent or 0) for stage in final_stages if stage is not None]
        simulation.score_percent = self._calculate_percent(sum(score_values), len(score_values) * 100)
        simulation.passed = all(bool(stage.passed) for stage in final_stages if stage is not None)
        simulation.status = "completed"
        finished_values = [stage.finished_at for stage in final_stages if stage is not None and stage.finished_at is not None]
        simulation.finished_at = max(finished_values) if finished_values else utc_now()

    async def _build_simulation_stage_details(
        self,
        user: User,
        assigned_at: datetime,
        previous_simulations: list[ExamSimulation] | None = None,
    ) -> dict[str, dict]:
        faculty_code = await self._resolve_faculty_code(user)
        active_question_count = await self.question_repository.count_filtered(
            faculty_id=user.faculty_id,
            topic_id=None,
            search=None,
        )

        if active_question_count < FULL_EXAM_QUESTION_COUNT:
            raise BadRequestError(
                "Для пробной аккредитации нужно минимум 80 активных тестовых вопросов "
                f"по факультету. Сейчас доступно {active_question_count}."
            )

        case_details = await self._build_case_stage_assignment(
            faculty_code,
            assigned_at=assigned_at,
            user_id=user.id,
            previous_simulations=previous_simulations or [],
        )
        osce_details = await self._build_osce_stage_assignment(
            faculty_code,
            assigned_at=assigned_at,
            user_id=user.id,
            previous_simulations=previous_simulations or [],
        )
        test_snapshot = {
            "question_assignment": "frozen_on_test_session_start",
            "assigned_question_count": FULL_EXAM_QUESTION_COUNT,
            "available_question_count": active_question_count,
        }

        return {
            "tests": {
                **self._stage_contract("tests", assigned_at),
                "assigned_question_count": FULL_EXAM_QUESTION_COUNT,
                "available_question_count": active_question_count,
                "content_snapshot": test_snapshot,
                "content_snapshot_hash": self._snapshot_signature(test_snapshot),
                "scoring_rules": self._test_scoring_rules(),
                "requirement": "80_questions_70_percent",
            },
            "cases": case_details,
            "osce": osce_details,
        }

    async def _build_case_stage_assignment(
        self,
        faculty_code: str | None,
        assigned_at: datetime,
        user_id: int,
        previous_simulations: list[ExamSimulation],
    ) -> dict:
        available_cases = [
            clinical_case
            for clinical_case in await self.case_repository.list_cases()
            if self._is_accessible_for_faculty(clinical_case.faculty_codes, faculty_code)
            and len(clinical_case.quiz_questions) > 0
        ]
        selected_cases = self._select_stage_materials(
            available_cases,
            count=CASE_STAGE_CASE_COUNT,
            minimum_total_questions=CASE_STAGE_TOTAL_QUESTIONS,
            user_id=user_id,
            stage_key="cases",
            assigned_at=assigned_at,
            recently_assigned_slugs=self._latest_assigned_slugs(
                previous_simulations,
                stage_key="cases",
                detail_key="assigned_case_slugs",
            ),
        )
        total_questions = sum(len(clinical_case.quiz_questions) for clinical_case in selected_cases)

        if len(selected_cases) < CASE_STAGE_CASE_COUNT or total_questions < CASE_STAGE_TOTAL_QUESTIONS:
            raise BadRequestError(
                "Для кейсового этапа пробной аккредитации нужно 2 доступных кейса "
                f"и минимум {CASE_STAGE_TOTAL_QUESTIONS} проверочных вопросов. "
                f"Сейчас доступно кейсов: {len(available_cases)}, вопросов в выбранных кейсах: {total_questions}."
            )

        assigned_cases = [
            self._case_snapshot(clinical_case)
            for clinical_case in selected_cases
        ]

        return {
            **self._stage_contract("cases", assigned_at),
            "assigned_case_slugs": [clinical_case.slug for clinical_case in selected_cases],
            "assigned_cases": assigned_cases,
            "content_snapshot": {"cases": assigned_cases},
            "content_snapshot_hash": self._snapshot_signature({"cases": assigned_cases}),
            "scoring_rules": self._case_scoring_rules(),
            "required_case_count": CASE_STAGE_CASE_COUNT,
            "required_total_questions": CASE_STAGE_TOTAL_QUESTIONS,
            "requirement": "2_cases_24_questions_70_percent",
        }

    async def _build_osce_stage_assignment(
        self,
        faculty_code: str | None,
        assigned_at: datetime,
        user_id: int,
        previous_simulations: list[ExamSimulation],
    ) -> dict:
        available_stations = [
            station
            for station in await self.osce_station_repository.list_stations()
            if self._is_accessible_for_faculty(station.faculty_codes, faculty_code)
            and len(station.checklist_items) > 0
            and len(station.quiz_questions) > 0
        ]
        selected_stations = self._select_stage_materials(
            available_stations,
            count=OSCE_STAGE_STATION_COUNT,
            user_id=user_id,
            stage_key="osce",
            assigned_at=assigned_at,
            recently_assigned_slugs=self._latest_assigned_slugs(
                previous_simulations,
                stage_key="osce",
                detail_key="assigned_station_slugs",
            ),
        )

        if len(selected_stations) < OSCE_STAGE_STATION_COUNT:
            raise BadRequestError(
                "Для практического этапа пробной аккредитации нужно 5 доступных станций "
                f"с чек-листом и тестом. Сейчас доступно: {len(available_stations)}."
            )

        assigned_stations = [
            self._osce_station_snapshot(station)
            for station in selected_stations
        ]

        return {
            **self._stage_contract("osce", assigned_at),
            "assigned_station_slugs": [station.slug for station in selected_stations],
            "assigned_stations": assigned_stations,
            "content_snapshot": {"stations": assigned_stations},
            "content_snapshot_hash": self._snapshot_signature({"stations": assigned_stations}),
            "scoring_rules": self._osce_scoring_rules(),
            "required_station_count": OSCE_STAGE_STATION_COUNT,
            "requirement": "5_stations_each_70_percent",
        }

    def _stage_contract(self, stage_key: str, assigned_at: datetime) -> dict:
        return {
            "stage_key": stage_key,
            "content_snapshot_version": CONTENT_SNAPSHOT_VERSION,
            "scoring_rules_version": SCORING_RULES_VERSION,
            "assigned_at": assigned_at.isoformat(),
            "assignment_source": "backend_preflight",
        }

    def _case_snapshot(self, clinical_case) -> dict:
        snapshot = {
            "slug": clinical_case.slug,
            "title": clinical_case.title,
            "topic_id": clinical_case.topic_id,
            "topic_name": clinical_case.topic_name,
            "questions_count": len(clinical_case.quiz_questions),
            "quiz_question_ids": [question.id for question in clinical_case.quiz_questions],
        }
        return {
            **snapshot,
            "snapshot_hash": self._snapshot_signature(snapshot),
        }

    def _osce_station_snapshot(self, station) -> dict:
        snapshot = {
            "slug": station.slug,
            "title": station.title,
            "topic_id": station.topic_id,
            "topic_name": station.topic_name,
            "duration_minutes": station.duration_minutes,
            "max_score": station.max_score,
            "checklist_count": len(station.checklist_items),
            "checklist_item_ids": [item.id for item in station.checklist_items],
            "critical_checklist_item_ids": [item.id for item in station.checklist_items if item.critical],
            "quiz_questions_count": len(station.quiz_questions),
            "quiz_question_ids": [question.id for question in station.quiz_questions],
        }
        return {
            **snapshot,
            "snapshot_hash": self._snapshot_signature(snapshot),
        }

    def _select_stage_materials(
        self,
        materials: list,
        *,
        count: int,
        minimum_total_questions: int | None = None,
        user_id: int,
        stage_key: str,
        assigned_at: datetime,
        recently_assigned_slugs: set[str],
    ) -> list:
        shuffled = list(materials)
        rng = random.Random(self._assignment_seed(user_id, stage_key, assigned_at, [item.slug for item in shuffled]))
        rng.shuffle(shuffled)

        fresh = [item for item in shuffled if item.slug not in recently_assigned_slugs]
        repeated = [item for item in shuffled if item.slug in recently_assigned_slugs]
        ordered_materials = fresh + repeated

        candidate_pools = [fresh, ordered_materials] if len(fresh) >= count else [ordered_materials]

        if minimum_total_questions is not None:
            for candidate_pool in candidate_pools:
                for candidate_group in combinations(candidate_pool, count):
                    total_questions = sum(len(getattr(item, "quiz_questions", [])) for item in candidate_group)

                    if total_questions >= minimum_total_questions:
                        return list(candidate_group)

        for candidate_pool in candidate_pools:
            if len(candidate_pool) >= count:
                return candidate_pool[:count]

        if minimum_total_questions is not None:
            for candidate_group in combinations(ordered_materials, count):
                total_questions = sum(len(getattr(item, "quiz_questions", [])) for item in candidate_group)

                if total_questions >= minimum_total_questions:
                    return list(candidate_group)

        return ordered_materials[:count]

    @staticmethod
    def _assignment_seed(user_id: int, stage_key: str, assigned_at: datetime, slugs: list[str]) -> int:
        payload = json.dumps(
            {
                "user_id": user_id,
                "stage_key": stage_key,
                "assigned_at": assigned_at.isoformat(),
                "slugs": sorted(slugs),
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return int(hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16], 16)

    def _latest_assigned_slugs(
        self,
        simulations: list[ExamSimulation],
        *,
        stage_key: str,
        detail_key: str,
    ) -> set[str]:
        for simulation in simulations:
            stage = self._build_stages_by_key(simulation).get(stage_key)
            assigned_slugs = self._assigned_slugs(stage, detail_key)

            if assigned_slugs:
                return set(assigned_slugs)

        return set()

    def _test_scoring_rules(self) -> dict:
        return {
            "version": SCORING_RULES_VERSION,
            "question_count": FULL_EXAM_QUESTION_COUNT,
            "time_limit_minutes": FULL_EXAM_TIME_LIMIT_MINUTES,
            "pass_percent": ACCREDITATION_PASS_PERCENT,
            "stage_pass_policy": "score_percent_gte_pass_percent",
        }

    def _case_scoring_rules(self) -> dict:
        return {
            "version": SCORING_RULES_VERSION,
            "case_count": CASE_STAGE_CASE_COUNT,
            "minimum_total_questions": CASE_STAGE_TOTAL_QUESTIONS,
            "pass_percent": ACCREDITATION_PASS_PERCENT,
            "stage_pass_policy": "each_case_and_total_score_gte_pass_percent",
        }

    def _osce_scoring_rules(self) -> dict:
        return {
            "version": SCORING_RULES_VERSION,
            "station_count": OSCE_STAGE_STATION_COUNT,
            "pass_percent": ACCREDITATION_PASS_PERCENT,
            "checklist_weight": 0.7,
            "quiz_weight": 0.3,
            "stage_pass_policy": "each_station_score_gte_pass_percent",
        }

    def _build_test_remediation_plan(
        self,
        *,
        score_percent: float,
        total_questions: int,
        answered_questions: int,
        correct_answers: int,
    ) -> dict:
        reason_parts = [f"результат {self._format_percent(score_percent)} ниже порога {self._format_percent(ACCREDITATION_PASS_PERCENT)}"]

        if answered_questions < total_questions:
            reason_parts.append(f"дано ответов {answered_questions}/{total_questions}")

        reason = "; ".join(reason_parts)
        summary = f"Тестовый этап не сдан: {reason}. Следующий честный шаг - разбор ошибок и новая пробная аккредитация."

        return {
            "version": REMEDIATION_PLAN_VERSION,
            "stage_key": "tests",
            "reason": reason,
            "summary": summary,
            "weak_items": [],
            "next_actions": [
                "Разберите неправильные ответы из завершенной тестовой сессии.",
                "Закройте слабые темы в учебном маршруте до повторной пробной аккредитации.",
                "Повторите тестовый этап только в новой пробной аккредитации: старый протокол не пересчитывается.",
            ],
            "repeat_control": "new_strict_simulation",
            "exit_criterion": "80 вопросов и результат не ниже 70%.",
            "evidence": {
                "total_questions": total_questions,
                "answered_questions": answered_questions,
                "correct_answers": correct_answers,
                "score_percent": score_percent,
            },
        }

    def _build_case_remediation_plan(
        self,
        *,
        details: dict,
        score_percent: float,
        total_questions: int,
        passed_case_count: int,
        case_results: list[dict],
    ) -> dict:
        snapshots_by_slug = self._snapshot_map(details, "assigned_cases")
        weak_cases = [item for item in case_results if not item.get("passed")]
        if not weak_cases and score_percent < ACCREDITATION_PASS_PERCENT:
            weak_cases = list(case_results)

        weak_items = [
            {
                "kind": "case",
                "slug": item.get("slug"),
                "title": snapshots_by_slug.get(str(item.get("slug", "")).strip().lower(), {}).get("title", str(item.get("slug", ""))),
                "topic_id": snapshots_by_slug.get(str(item.get("slug", "")).strip().lower(), {}).get("topic_id"),
                "topic_name": snapshots_by_slug.get(str(item.get("slug", "")).strip().lower(), {}).get("topic_name"),
                "score_percent": item.get("score_percent"),
            }
            for item in weak_cases
        ]
        reason_parts: list[str] = []

        if passed_case_count < CASE_STAGE_CASE_COUNT:
            reason_parts.append(f"зачтено {passed_case_count}/{CASE_STAGE_CASE_COUNT} кейсов")

        if total_questions < CASE_STAGE_TOTAL_QUESTIONS:
            reason_parts.append(f"отвечено {total_questions}/{CASE_STAGE_TOTAL_QUESTIONS} обязательных вопросов")

        if score_percent < ACCREDITATION_PASS_PERCENT:
            reason_parts.append(f"общий результат {self._format_percent(score_percent)} ниже порога {self._format_percent(ACCREDITATION_PASS_PERCENT)}")

        reason = "; ".join(reason_parts) or "результат не соответствует правилам кейсового этапа"
        focus_names = self._focus_item_names(weak_items)
        summary = f"Кейсовый этап не сдан: {reason}."
        if focus_names:
            summary = f"{summary} Разберите: {focus_names}."

        return {
            "version": REMEDIATION_PLAN_VERSION,
            "stage_key": "cases",
            "reason": reason,
            "summary": summary,
            "weak_items": weak_items,
            "next_actions": [
                f"Разберите кейсы: {focus_names}." if focus_names else "Разберите ответы в завершенных кейсах.",
                "Отработайте связанные темы в учебном маршруте.",
                "Повторите кейсовый этап только в новой пробной аккредитации.",
            ],
            "repeat_control": "new_strict_simulation",
            "exit_criterion": "2 назначенных кейса, минимум 24 вопроса, каждый кейс и общий результат не ниже 70%.",
            "evidence": {
                "case_count": details.get("case_count"),
                "required_case_count": CASE_STAGE_CASE_COUNT,
                "total_questions": total_questions,
                "required_total_questions": CASE_STAGE_TOTAL_QUESTIONS,
                "passed_case_count": passed_case_count,
                "score_percent": score_percent,
            },
        }

    def _build_osce_remediation_plan(
        self,
        *,
        details: dict,
        score_percent: float,
        passed_station_count: int,
        station_results: list[dict],
    ) -> dict:
        snapshots_by_slug = self._snapshot_map(details, "assigned_stations")
        weak_stations = [item for item in station_results if not item.get("passed")]
        if not weak_stations and score_percent < ACCREDITATION_PASS_PERCENT:
            weak_stations = list(station_results)

        weak_items = [
            {
                "kind": "station",
                "slug": item.get("slug"),
                "title": snapshots_by_slug.get(str(item.get("slug", "")).strip().lower(), {}).get("title", str(item.get("slug", ""))),
                "topic_id": snapshots_by_slug.get(str(item.get("slug", "")).strip().lower(), {}).get("topic_id"),
                "topic_name": snapshots_by_slug.get(str(item.get("slug", "")).strip().lower(), {}).get("topic_name"),
                "score_percent": item.get("score_percent"),
            }
            for item in weak_stations
        ]
        reason_parts = []

        if passed_station_count < OSCE_STAGE_STATION_COUNT:
            reason_parts.append(f"зачтено {passed_station_count}/{OSCE_STAGE_STATION_COUNT} станций")

        if score_percent < ACCREDITATION_PASS_PERCENT:
            reason_parts.append(f"средний результат {self._format_percent(score_percent)} ниже порога {self._format_percent(ACCREDITATION_PASS_PERCENT)}")

        reason = "; ".join(reason_parts) or "результат не соответствует правилам практического этапа"
        focus_names = self._focus_item_names(weak_items)
        summary = f"Практический этап не сдан: {reason}."
        if focus_names:
            summary = f"{summary} Повторно отработайте: {focus_names}."

        return {
            "version": REMEDIATION_PLAN_VERSION,
            "stage_key": "osce",
            "reason": reason,
            "summary": summary,
            "weak_items": weak_items,
            "next_actions": [
                f"Разберите станции: {focus_names}." if focus_names else "Разберите чек-листы завершенных станций.",
                "Повторите критические действия и короткий опрос по слабым станциям.",
                "Повторите практический этап только в новой пробной аккредитации.",
            ],
            "repeat_control": "new_strict_simulation",
            "exit_criterion": "5 назначенных станций, каждая станция не ниже 70%.",
            "evidence": {
                "station_count": details.get("station_count"),
                "required_station_count": OSCE_STAGE_STATION_COUNT,
                "passed_station_count": passed_station_count,
                "score_percent": score_percent,
            },
        }

    def _build_incomplete_stage_detail(self, stage_key: str, details: dict, missing_detail: str) -> str:
        if stage_key == "cases" and details.get("case_count"):
            case_count = int(details.get("case_count") or 0)
            total_questions = int(details.get("total_questions") or 0)
            return (
                f"В процессе: выполнено {case_count}/{CASE_STAGE_CASE_COUNT} кейсов, "
                f"{total_questions}/{CASE_STAGE_TOTAL_QUESTIONS} вопросов. Завершите назначенные кейсы этой пробной аккредитации."
            )

        if stage_key == "osce" and details.get("station_count"):
            station_count = int(details.get("station_count") or 0)
            passed_station_count = int(details.get("passed_station_count") or 0)
            return (
                f"В процессе: выполнено {station_count}/{OSCE_STAGE_STATION_COUNT} станций, "
                f"зачтено {passed_station_count}. Для протокола каждая назначенная станция должна быть не ниже 70%."
            )

        return missing_detail

    def _build_finished_stage_detail(
        self,
        label: str,
        stage: ExamSimulationStage,
        details: dict,
        *,
        passed: bool,
    ) -> str:
        if passed:
            return (
                f"{label} подтвержден в пробной аккредитации: "
                f"{self._format_percent(stage.score_percent)} при пороге {self._format_percent(ACCREDITATION_PASS_PERCENT)}."
            )

        remediation_plan = self._remediation_plan(details)
        summary = remediation_plan.get("summary")
        if isinstance(summary, str) and summary.strip():
            return summary

        return f"{label}: повторить этап в новой пробной аккредитации до результата 70%+."

    @staticmethod
    def _remediation_plan(details: dict) -> dict:
        value = details.get("remediation_plan")
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _snapshot_map(details: dict, details_key: str) -> dict[str, dict]:
        snapshots = details.get(details_key)
        if not isinstance(snapshots, list):
            return {}

        snapshot_by_slug: dict[str, dict] = {}
        for item in snapshots:
            if not isinstance(item, dict):
                continue

            slug = str(item.get("slug", "")).strip().lower()
            if slug:
                snapshot_by_slug[slug] = item

        return snapshot_by_slug

    @staticmethod
    def _focus_item_names(items: list[dict]) -> str:
        names = [
            str(item.get("title") or item.get("slug") or "").strip()
            for item in items
            if str(item.get("title") or item.get("slug") or "").strip()
        ]

        if len(names) <= 2:
            return " и ".join(names)

        return ", ".join(names[:-1]) + f" и {names[-1]}"

    @staticmethod
    def _format_percent(value: Decimal | float | int | None) -> str:
        if value is None:
            return "0%"

        rounded = round(float(value), 1)
        if rounded.is_integer():
            return f"{int(rounded)}%"

        return f"{rounded}%"

    @staticmethod
    def _snapshot_signature(snapshot: dict) -> str:
        payload = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def _resolve_faculty_code(self, user: User) -> str | None:
        if user.faculty_id is None:
            return None

        faculty = await self.faculty_repository.get_by_id(user.faculty_id)
        return faculty.code if faculty is not None else None

    @staticmethod
    def _is_accessible_for_faculty(faculty_codes: list[str], faculty_code: str | None) -> bool:
        if not faculty_codes or faculty_code is None:
            return True

        return faculty_code in faculty_codes

    def _build_protocol_stage(
        self,
        stage_key: str,
        stage: ExamSimulationStage | None,
    ) -> ExamStageProtocolResponse:
        if stage_key == "tests":
            label = "Тестовый этап"
            requirement = "80 вопросов, 70%+"
            missing_detail = "Пройти тестовый этап в пробной аккредитации: 80 вопросов за 60 минут."
        elif stage_key == "cases":
            label = "Ситуационные задачи"
            requirement = "2 задачи, 24 вопроса, 70%+"
            missing_detail = "Пройти кейсовый этап в пробной аккредитации: 2 задачи подряд."
        else:
            label = "Практический этап / ОСКЭ"
            requirement = "5 станций, каждая 70%+"
            missing_detail = "Пройти 5 станций ОСКЭ в пробной аккредитации."

        details = dict(stage.details or {}) if stage is not None else {}
        if stage is None or stage.status in {"unconfirmed", "active"}:
            is_active = stage is not None and stage.status == "active"

            return ExamStageProtocolResponse(
                key=stage_key,
                label=label,
                status="unconfirmed",
                status_label="В процессе" if is_active else "Не начат",
                result_label="Нет результата" if stage is None else "В процессе",
                requirement_label=requirement,
                detail=self._build_incomplete_stage_detail(stage_key, details, missing_detail),
            )

        passed = bool(stage.passed)
        return ExamStageProtocolResponse(
            key=stage_key,
            label=label,
            status="passed" if passed else "failed",
            status_label="Сдан" if passed else "Не сдан",
            result_label=f"{round(float(stage.score_percent or 0))}%",
            requirement_label=requirement,
            detail=self._build_finished_stage_detail(label, stage, details, passed=passed),
        )

    def _to_simulation_response(self, simulation: ExamSimulation) -> ExamSimulationResponse:
        return ExamSimulationResponse(
            id=simulation.id,
            simulation_type=simulation.simulation_type,
            status=simulation.status,
            score_percent=self._to_optional_float(simulation.score_percent),
            passed=simulation.passed,
            started_at=simulation.started_at,
            expires_at=simulation.expires_at,
            finished_at=simulation.finished_at,
            created_at=simulation.created_at,
            updated_at=simulation.updated_at,
            stages=[
                ExamSimulationStageResponse(
                    key=stage.stage_key,
                    status=stage.status,
                    score_percent=self._to_optional_float(stage.score_percent),
                    passed=stage.passed,
                    details=dict(stage.details or {}),
                    started_at=stage.started_at,
                    finished_at=stage.finished_at,
                )
                for stage in sorted(
                    [item for item in simulation.stages if item.stage_key in EXAM_STAGE_KEYS],
                    key=lambda item: EXAM_STAGE_KEYS.index(item.stage_key),
                )
            ],
        )

    @staticmethod
    def _build_stages_by_key(simulation: ExamSimulation | None) -> dict[str, ExamSimulationStage]:
        if simulation is None:
            return {}

        return {stage.stage_key: stage for stage in simulation.stages if stage.stage_key in EXAM_STAGE_KEYS}

    @staticmethod
    def _stage_label(stage_key: str) -> str:
        if stage_key == "tests":
            return "Тестовый этап"

        if stage_key == "cases":
            return "Кейсовый этап"

        if stage_key == "osce":
            return "Практический этап"

        return "Этап"

    @staticmethod
    def _assigned_slugs(stage: ExamSimulationStage | None, details_key: str) -> list[str]:
        value = (stage.details or {}).get(details_key) if stage is not None else None

        if not isinstance(value, list):
            return []

        return [item.strip().lower() for item in value if isinstance(item, str) and item.strip()]

    @staticmethod
    def _calculate_percent(value: float | int, total: float | int) -> float:
        if total <= 0:
            return 0.0

        return round((float(value) / float(total)) * 100, 2)

    @staticmethod
    def _to_optional_float(value: Decimal | float | int | None) -> float | None:
        return round(float(value), 2) if value is not None else None

    @staticmethod
    def _ensure_onboarding_completed(user: User) -> None:
        if user.faculty_id is None or user.accreditation_date is None or not user.onboarding_completed:
            raise BadRequestError("Сначала нужно завершить настройку профиля")
