from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.enums import QuestionDifficulty


class AdminAnswerOptionWriteRequest(BaseModel):
    label: str = Field(min_length=1, max_length=1)
    text: str = Field(min_length=1)
    is_correct: bool = False
    explanation: str | None = None

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        normalized_value = value.strip().upper()

        if len(normalized_value) != 1 or not normalized_value.isalpha():
            raise ValueError("Метка варианта ответа должна быть одной буквой")

        return normalized_value

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текст варианта ответа не должен быть пустым")

        return normalized_value

    @field_validator("explanation")
    @classmethod
    def normalize_explanation(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None


class AdminQuestionCreateRequest(BaseModel):
    topic_id: int = Field(gt=0)
    text: str = Field(min_length=1)
    difficulty: QuestionDifficulty = QuestionDifficulty.MEDIUM
    explanation: str | None = None
    answer_options: list[AdminAnswerOptionWriteRequest] = Field(min_length=2, max_length=8)
    is_active: bool = True

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текст вопроса не должен быть пустым")

        return normalized_value

    @field_validator("explanation")
    @classmethod
    def normalize_explanation(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None

    @model_validator(mode="after")
    def validate_answer_options(self) -> "AdminQuestionCreateRequest":
        labels = [item.label for item in self.answer_options]

        if len(labels) != len(set(labels)):
            raise ValueError("Метки вариантов ответа должны быть уникальными")

        if sum(1 for item in self.answer_options if item.is_correct) != 1:
            raise ValueError("У вопроса должен быть ровно один правильный вариант ответа")

        return self


class AdminQuestionUpdateRequest(AdminQuestionCreateRequest):
    pass


class AdminAnswerOptionResponse(BaseModel):
    id: int
    label: str
    text: str
    is_correct: bool
    explanation: str | None


class AdminQuestionListItemResponse(BaseModel):
    id: int
    faculty_id: int | None
    faculty_name: str | None
    section_id: int | None
    section_name: str | None
    topic_id: int | None
    topic_name: str | None
    text: str
    difficulty: str
    is_active: bool
    answer_option_count: int


class AdminQuestionListResponse(BaseModel):
    items: list[AdminQuestionListItemResponse]
    total: int
    limit: int
    offset: int


class AdminQuestionDetailsResponse(BaseModel):
    id: int
    faculty_id: int | None
    faculty_name: str | None
    section_id: int | None
    section_name: str | None
    topic_id: int | None
    topic_name: str | None
    text: str
    difficulty: str
    explanation: str | None
    is_active: bool
    created_by: int | None
    answer_options: list[AdminAnswerOptionResponse]


class AdminQuestionDeleteResponse(BaseModel):
    id: int
    deleted: bool
