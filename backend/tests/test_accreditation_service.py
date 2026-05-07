import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.models.exam_simulation import ExamSimulation, ExamSimulationStage
from app.services.accreditation_service import AccreditationService


class _CaseAttemptRepository:
    def __init__(self, attempts):
        self._attempts = attempts

    async def list_by_simulation(self, simulation_id):
        return self._attempts


class _CaseRepository:
    def __init__(self, cases):
        self._cases = cases

    async def list_cases(self):
        return self._cases


class _OsceStationRepository:
    def __init__(self, stations):
        self._stations = stations

    async def list_stations(self):
        return self._stations


def _case(slug: str, question_count: int = 12):
    return SimpleNamespace(
        slug=slug,
        title=slug.replace("-", " ").title(),
        topic_id=None,
        topic_name=None,
        faculty_codes=[],
        quiz_questions=[SimpleNamespace(id=f"{slug}-q{index}") for index in range(question_count)],
    )


def _station(slug: str):
    return SimpleNamespace(
        slug=slug,
        title=slug.replace("-", " ").title(),
        topic_id=None,
        topic_name=None,
        faculty_codes=[],
        duration_minutes=8,
        max_score=100,
        checklist_items=[SimpleNamespace(id=f"{slug}-cl1", critical=False)],
        quiz_questions=[SimpleNamespace(id=f"{slug}-q1")],
    )


def test_case_stage_requires_each_assigned_case_to_reach_pass_threshold() -> None:
    async def run() -> None:
        simulation_id = uuid4()
        submitted_at = datetime(2026, 5, 6, tzinfo=timezone.utc)
        stage = ExamSimulationStage(
            simulation_id=simulation_id,
            stage_key="cases",
            status="active",
            details={
                "assigned_case_slugs": ["case-low", "case-high"],
                "assigned_cases": [],
            },
        )
        simulation = ExamSimulation(
            id=simulation_id,
            user_id=1,
            simulation_type="full_accreditation",
            status="active",
            stages=[stage],
        )
        attempts = [
            SimpleNamespace(
                case_slug="case-low",
                answered_questions=12,
                correct_answers=6,
                accuracy_percent=50.0,
                submitted_at=submitted_at,
            ),
            SimpleNamespace(
                case_slug="case-high",
                answered_questions=12,
                correct_answers=11,
                accuracy_percent=91.67,
                submitted_at=submitted_at,
            ),
        ]
        service = AccreditationService(SimpleNamespace())
        service.case_attempt_repository = _CaseAttemptRepository(attempts)

        async def get_owned_simulation(user, requested_simulation_id):
            assert requested_simulation_id == simulation_id
            return simulation

        async def update_stage(**kwargs):
            assert kwargs["stage_key"] == "cases"
            stage.status = kwargs["status"]
            stage.score_percent = kwargs["score_percent"]
            stage.passed = kwargs["passed"]
            stage.details = kwargs["details"]
            stage.started_at = kwargs["started_at"]
            stage.finished_at = kwargs["finished_at"]

        service.get_owned_simulation = get_owned_simulation
        service._update_stage = update_stage

        status, remediation_plan, transitioned = await service.record_case_stage_progress(
            SimpleNamespace(id=1),
            simulation_id,
        )

        assert status == "failed"
        assert transitioned is True
        assert stage.passed is False
        assert round(float(stage.score_percent or 0), 2) >= 70.0
        assert stage.details["passed_case_count"] == 1
        assert stage.details["case_results"][0]["passed"] is False
        assert stage.details["case_results"][1]["passed"] is True
        assert remediation_plan is not None
        assert remediation_plan["evidence"]["passed_case_count"] == 1

    asyncio.run(run())


def test_case_stage_assignment_avoids_latest_cases_when_pool_has_room() -> None:
    async def run() -> None:
        simulation_id = uuid4()
        assigned_at = datetime(2026, 5, 6, tzinfo=timezone.utc)
        previous_simulation = ExamSimulation(
            id=simulation_id,
            user_id=1,
            simulation_type="full_accreditation",
            status="cancelled",
            stages=[
                ExamSimulationStage(
                    simulation_id=simulation_id,
                    stage_key="cases",
                    status="cancelled",
                    details={"assigned_case_slugs": ["case-1", "case-2"]},
                )
            ],
        )
        service = AccreditationService(SimpleNamespace())
        service.case_repository = _CaseRepository([_case(f"case-{index}") for index in range(1, 5)])

        details = await service._build_case_stage_assignment(
            faculty_code=None,
            assigned_at=assigned_at,
            user_id=1,
            previous_simulations=[previous_simulation],
        )

        assert set(details["assigned_case_slugs"]) == {"case-3", "case-4"}
        assert details["assignment_source"] == "backend_preflight"
        assert len(details["assigned_cases"]) == 2

    asyncio.run(run())


def test_case_stage_assignment_keeps_required_question_total_after_shuffle() -> None:
    async def run() -> None:
        assigned_at = datetime(2026, 5, 6, tzinfo=timezone.utc)
        service = AccreditationService(SimpleNamespace())
        service.case_repository = _CaseRepository(
            [
                _case("case-small-1", question_count=4),
                _case("case-small-2", question_count=6),
                _case("case-large-1", question_count=18),
                _case("case-large-2", question_count=20),
            ]
        )

        details = await service._build_case_stage_assignment(
            faculty_code=None,
            assigned_at=assigned_at,
            user_id=1,
            previous_simulations=[],
        )

        assigned_cases = details["assigned_cases"]
        assert len(assigned_cases) == 2
        assert sum(item["questions_count"] for item in assigned_cases) >= 24

    asyncio.run(run())


def test_case_stage_assignment_prefers_fresh_valid_pair_before_recent_repeat() -> None:
    async def run() -> None:
        simulation_id = uuid4()
        assigned_at = datetime(2026, 5, 6, tzinfo=timezone.utc)
        previous_simulation = ExamSimulation(
            id=simulation_id,
            user_id=1,
            simulation_type="full_accreditation",
            status="completed",
            stages=[
                ExamSimulationStage(
                    simulation_id=simulation_id,
                    stage_key="cases",
                    status="failed",
                    details={"assigned_case_slugs": ["case-repeat"]},
                )
            ],
        )
        service = AccreditationService(SimpleNamespace())
        service.case_repository = _CaseRepository(
            [
                _case("case-fresh-small", question_count=2),
                _case("case-fresh-large-1", question_count=13),
                _case("case-fresh-large-2", question_count=13),
                _case("case-repeat", question_count=22),
            ]
        )

        details = await service._build_case_stage_assignment(
            faculty_code=None,
            assigned_at=assigned_at,
            user_id=1,
            previous_simulations=[previous_simulation],
        )

        assert set(details["assigned_case_slugs"]) == {"case-fresh-large-1", "case-fresh-large-2"}

    asyncio.run(run())


def test_osce_stage_assignment_adds_fresh_stations_when_possible() -> None:
    async def run() -> None:
        simulation_id = uuid4()
        assigned_at = datetime(2026, 5, 6, tzinfo=timezone.utc)
        latest_slugs = [f"station-{index}" for index in range(1, 6)]
        previous_simulation = ExamSimulation(
            id=simulation_id,
            user_id=1,
            simulation_type="full_accreditation",
            status="completed",
            stages=[
                ExamSimulationStage(
                    simulation_id=simulation_id,
                    stage_key="osce",
                    status="passed",
                    details={"assigned_station_slugs": latest_slugs},
                )
            ],
        )
        service = AccreditationService(SimpleNamespace())
        service.osce_station_repository = _OsceStationRepository(
            [_station(f"station-{index}") for index in range(1, 8)]
        )

        details = await service._build_osce_stage_assignment(
            faculty_code=None,
            assigned_at=assigned_at,
            user_id=1,
            previous_simulations=[previous_simulation],
        )

        assigned_slugs = details["assigned_station_slugs"]
        assert len(assigned_slugs) == 5
        assert "station-6" in assigned_slugs
        assert "station-7" in assigned_slugs
        assert assigned_slugs != latest_slugs

    asyncio.run(run())
