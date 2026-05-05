import inspect
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.exam_simulation import ExamSimulation, ExamSimulationStage
from app.repositories.base_repository import BaseRepository


class ExamSimulationRepository(BaseRepository[ExamSimulation]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ExamSimulation)

    async def get_by_user_and_id(self, user_id: int, simulation_id: UUID) -> ExamSimulation | None:
        result = await self.session.execute(
            select(ExamSimulation)
            .options(selectinload(ExamSimulation.stages))
            .where(
                ExamSimulation.user_id == user_id,
                ExamSimulation.id == simulation_id,
            )
        )
        simulation = result.scalar_one_or_none()
        if inspect.isawaitable(simulation):
            simulation = await simulation
        return simulation if isinstance(simulation, ExamSimulation) else None

    async def list_by_user(self, user_id: int, limit: int = 20) -> list[ExamSimulation]:
        result = await self.session.execute(
            select(ExamSimulation)
            .options(selectinload(ExamSimulation.stages))
            .where(ExamSimulation.user_id == user_id)
            .order_by(ExamSimulation.created_at.desc(), ExamSimulation.id.desc())
            .limit(limit)
        )
        simulations = result.scalars().all()
        if inspect.isawaitable(simulations):
            simulations = await simulations
        return list(simulations)

    async def get_latest_by_user(self, user_id: int) -> ExamSimulation | None:
        result = await self.session.execute(
            select(ExamSimulation)
            .options(selectinload(ExamSimulation.stages))
            .where(ExamSimulation.user_id == user_id)
            .order_by(ExamSimulation.created_at.desc(), ExamSimulation.id.desc())
            .limit(1)
        )
        simulation = result.scalar_one_or_none()
        if inspect.isawaitable(simulation):
            simulation = await simulation
        return simulation if isinstance(simulation, ExamSimulation) else None

    async def get_stage(self, simulation_id: UUID, stage_key: str) -> ExamSimulationStage | None:
        result = await self.session.execute(
            select(ExamSimulationStage).where(
                ExamSimulationStage.simulation_id == simulation_id,
                ExamSimulationStage.stage_key == stage_key,
            )
        )
        stage = result.scalar_one_or_none()
        if inspect.isawaitable(stage):
            stage = await stage
        return stage if isinstance(stage, ExamSimulationStage) else None
