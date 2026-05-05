from pydantic import BaseModel


class AnswerOptionResponse(BaseModel):
    label: str
    text: str


class QuestionResponse(BaseModel):
    id: int
    topic_id: int | None
    text: str
    difficulty: str
    answer_options: list[AnswerOptionResponse]


class QuestionListResponse(BaseModel):
    items: list[QuestionResponse]
    total: int
    limit: int
    offset: int
