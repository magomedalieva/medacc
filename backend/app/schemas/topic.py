from pydantic import BaseModel


class TopicResponse(BaseModel):
    id: int
    name: str
    description: str | None
    section_id: int
    section_name: str
