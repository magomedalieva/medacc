import re

from pydantic import BaseModel, Field, field_validator


SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
ITEM_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
OPTION_LABEL_PATTERN = re.compile(r"^[A-Z]$")


class AdminOsceOptionWriteRequest(BaseModel):
    label: str = Field(min_length=1, max_length=1)
    text: str = Field(min_length=1)

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        normalized_value = value.strip().upper()

        if not OPTION_LABEL_PATTERN.fullmatch(normalized_value):
            raise ValueError("Метка варианта ОСКЭ должна быть одной латинской буквой")

        return normalized_value

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текст варианта ОСКЭ не должен быть пустым")

        return normalized_value


class AdminOsceQuestionWriteRequest(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1)
    options: list[AdminOsceOptionWriteRequest] = Field(min_length=2)
    correct_option_label: str = Field(min_length=1, max_length=1)
    explanation: str = Field(min_length=1)

    @field_validator("id")
    @classmethod
    def normalize_id(cls, value: str) -> str:
        normalized_value = value.strip().lower()

        if not ITEM_ID_PATTERN.fullmatch(normalized_value):
            raise ValueError("Id вопроса ОСКЭ должен содержать только строчные латинские буквы, цифры и дефис")

        return normalized_value

    @field_validator("prompt", "explanation")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текстовые поля вопроса ОСКЭ не должны быть пустыми")

        return normalized_value

    @field_validator("correct_option_label")
    @classmethod
    def normalize_correct_option_label(cls, value: str) -> str:
        normalized_value = value.strip().upper()

        if not OPTION_LABEL_PATTERN.fullmatch(normalized_value):
            raise ValueError("Метка правильного варианта ОСКЭ должна быть одной латинской буквой")

        return normalized_value

    @field_validator("options")
    @classmethod
    def validate_unique_option_labels(cls, values: list[AdminOsceOptionWriteRequest]) -> list[AdminOsceOptionWriteRequest]:
        labels = [value.label for value in values]

        if len(labels) != len(set(labels)):
            raise ValueError("Метки вариантов ответа ОСКЭ должны быть уникальными")

        return values


class AdminOsceChecklistItemWriteRequest(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    critical: bool = False

    @field_validator("id")
    @classmethod
    def normalize_id(cls, value: str) -> str:
        normalized_value = value.strip().lower()

        if not ITEM_ID_PATTERN.fullmatch(normalized_value):
            raise ValueError("Id пункта чек-листа ОСКЭ должен содержать только строчные латинские буквы, цифры и дефис")

        return normalized_value

    @field_validator("title", "description")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текстовые поля пункта чек-листа ОСКЭ не должны быть пустыми")

        return normalized_value


class AdminOsceStationWriteRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=120)
    topic_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=255)
    subtitle: str | None = Field(default=None, max_length=255)
    skill_level: str = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(ge=1, le=180)
    max_score: int = Field(ge=1, le=1000)
    summary: str = Field(min_length=1)
    checklist_items: list[AdminOsceChecklistItemWriteRequest] = Field(min_length=1)
    quiz_questions: list[AdminOsceQuestionWriteRequest] = Field(min_length=1)

    @field_validator("slug")
    @classmethod
    def normalize_slug(cls, value: str) -> str:
        normalized_value = value.strip().lower()

        if not SLUG_PATTERN.fullmatch(normalized_value):
            raise ValueError("Slug станции ОСКЭ должен содержать только строчные латинские буквы, цифры и дефис")

        return normalized_value

    @field_validator("title", "skill_level", "summary")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текстовые поля станции ОСКЭ не должны быть пустыми")

        return normalized_value

    @field_validator("subtitle")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None

    @field_validator("checklist_items")
    @classmethod
    def validate_unique_checklist_ids(
        cls,
        values: list[AdminOsceChecklistItemWriteRequest],
    ) -> list[AdminOsceChecklistItemWriteRequest]:
        ids = [value.id for value in values]

        if len(ids) != len(set(ids)):
            raise ValueError("Id пунктов чек-листа ОСКЭ должны быть уникальными")

        return values

    @field_validator("quiz_questions")
    @classmethod
    def validate_unique_question_ids(
        cls,
        values: list[AdminOsceQuestionWriteRequest],
    ) -> list[AdminOsceQuestionWriteRequest]:
        ids = [value.id for value in values]

        if len(ids) != len(set(ids)):
            raise ValueError("Id вопросов ОСКЭ должны быть уникальными")

        for question in values:
            option_labels = {option.label for option in question.options}

            if question.correct_option_label not in option_labels:
                raise ValueError("Правильный вариант ОСКЭ должен совпадать с одной из меток ответа")

        return values


class AdminOsceOptionResponse(BaseModel):
    label: str
    text: str


class AdminOsceQuestionResponse(BaseModel):
    id: str
    prompt: str
    options: list[AdminOsceOptionResponse]
    correct_option_label: str
    explanation: str


class AdminOsceChecklistItemResponse(BaseModel):
    id: str
    title: str
    description: str
    critical: bool


class AdminOsceStationListItemResponse(BaseModel):
    slug: str
    faculty_code: str
    faculty_name: str | None
    section_name: str
    topic_id: int | None
    topic_name: str
    title: str
    subtitle: str | None
    skill_level: str
    duration_minutes: int
    max_score: int
    summary: str
    checklist_items_count: int
    quiz_questions_count: int


class AdminOsceStationDetailsResponse(AdminOsceStationListItemResponse):
    checklist_items: list[AdminOsceChecklistItemResponse]
    quiz_questions: list[AdminOsceQuestionResponse]


class AdminOsceStationDeleteResponse(BaseModel):
    slug: str
    deleted: bool
