from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


ModelType = TypeVar("ModelType")


class BaseRepository(Generic[ModelType]):
    def __init__(self, session: AsyncSession, model: type[ModelType]) -> None:
        self.session = session
        self.model = model

    async def get_by_id(self, entity_id: Any) -> ModelType | None:
        result = await self.session.execute(select(self.model).where(self.model.id == entity_id))
        return result.scalar_one_or_none()

    def add(self, entity: ModelType) -> ModelType:
        self.session.add(entity)
        return entity
