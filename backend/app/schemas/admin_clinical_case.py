import re

from pydantic import BaseModel, Field, field_validator

from app.core.clinical_case_quiz import CASE_QUIZ_QUESTION_COUNT


SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
ITEM_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
OPTION_LABEL_PATTERN = re.compile(r"^[A-Z]$")


class AdminClinicalCaseFactWriteRequest(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=255)
    tone: str | None = Field(default=None, max_length=50)

    @field_validator("label", "value")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Поля факта клинического кейса не должны быть пустыми")

        return normalized_value

    @field_validator("tone")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None


class AdminClinicalCaseQuizOptionWriteRequest(BaseModel):
    label: str = Field(min_length=1, max_length=1)
    text: str = Field(min_length=1)

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str) -> str:
        normalized_value = value.strip().upper()

        if not OPTION_LABEL_PATTERN.fullmatch(normalized_value):
            raise ValueError("Метка варианта кейса должна быть одной латинской буквой")

        return normalized_value

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текст варианта кейса не должен быть пустым")

        return normalized_value


class AdminClinicalCaseQuizQuestionWriteRequest(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1)
    options: list[AdminClinicalCaseQuizOptionWriteRequest] = Field(min_length=2)
    correct_option_label: str = Field(min_length=1, max_length=1)
    explanation: str = Field(min_length=1)
    hint: str | None = Field(default=None)

    @field_validator("id")
    @classmethod
    def normalize_id(cls, value: str) -> str:
        normalized_value = value.strip().lower()

        if not ITEM_ID_PATTERN.fullmatch(normalized_value):
            raise ValueError("Id вопроса кейса должен содержать только строчные латинские буквы, цифры и дефис")

        return normalized_value

    @field_validator("prompt", "explanation")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текстовые поля вопроса кейса не должны быть пустыми")

        return normalized_value

    @field_validator("hint")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None

    @field_validator("correct_option_label")
    @classmethod
    def normalize_correct_option_label(cls, value: str) -> str:
        normalized_value = value.strip().upper()

        if not OPTION_LABEL_PATTERN.fullmatch(normalized_value):
            raise ValueError("Метка правильного варианта кейса должна быть одной латинской буквой")

        return normalized_value

    @field_validator("options")
    @classmethod
    def validate_unique_option_labels(
        cls,
        values: list[AdminClinicalCaseQuizOptionWriteRequest],
    ) -> list[AdminClinicalCaseQuizOptionWriteRequest]:
        labels = [value.label for value in values]

        if len(labels) != len(set(labels)):
            raise ValueError("Метки вариантов ответа кейса должны быть уникальными")

        return values


class AdminClinicalCaseWriteRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=120)
    topic_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=255)
    subtitle: str | None = Field(default=None, max_length=255)
    difficulty: str = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(ge=1, le=180)
    summary: str = Field(min_length=1)
    patient_summary: str = Field(min_length=1)
    focus_points: list[str] = Field(default_factory=list)
    exam_targets: list[str] = Field(default_factory=list)
    discussion_questions: list[str] = Field(default_factory=list)
    quiz_questions: list[AdminClinicalCaseQuizQuestionWriteRequest] = Field(
        min_length=CASE_QUIZ_QUESTION_COUNT,
        max_length=CASE_QUIZ_QUESTION_COUNT,
    )
    clinical_facts: list[AdminClinicalCaseFactWriteRequest] = Field(default_factory=list)

    @field_validator("slug")
    @classmethod
    def normalize_slug(cls, value: str) -> str:
        normalized_value = value.strip().lower()

        if not SLUG_PATTERN.fullmatch(normalized_value):
            raise ValueError("Slug кейса должен содержать только строчные латинские буквы, цифры и дефис")

        return normalized_value

    @field_validator("title", "difficulty", "summary", "patient_summary")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized_value = value.strip()

        if not normalized_value:
            raise ValueError("Текстовые поля клинического кейса не должны быть пустыми")

        return normalized_value

    @field_validator("subtitle")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized_value = value.strip()
        return normalized_value or None

    @field_validator("focus_points", "exam_targets", "discussion_questions")
    @classmethod
    def normalize_string_list(cls, values: list[str]) -> list[str]:
        normalized_values = [value.strip() for value in values]
        return [value for value in normalized_values if value]

    @field_validator("quiz_questions")
    @classmethod
    def validate_quiz_questions(
        cls,
        values: list[AdminClinicalCaseQuizQuestionWriteRequest],
    ) -> list[AdminClinicalCaseQuizQuestionWriteRequest]:
        ids = [value.id for value in values]

        if len(ids) != len(set(ids)):
            raise ValueError("Id вопросов кейса должны быть уникальными")

        if len(values) != CASE_QUIZ_QUESTION_COUNT:
            raise ValueError(f"Кейс должен содержать ровно {CASE_QUIZ_QUESTION_COUNT} проверочных вопросов")

        for question in values:
            option_labels = {option.label for option in question.options}

            if question.correct_option_label not in option_labels:
                raise ValueError("Правильный вариант кейса должен совпадать с одной из меток ответа")

        return values


class AdminClinicalCaseFactResponse(BaseModel):
    label: str
    value: str
    tone: str | None


class AdminClinicalCaseQuizOptionResponse(BaseModel):
    label: str
    text: str


class AdminClinicalCaseQuizQuestionResponse(BaseModel):
    id: str
    prompt: str
    options: list[AdminClinicalCaseQuizOptionResponse]
    correct_option_label: str
    explanation: str
    hint: str | None


class AdminClinicalCaseListItemResponse(BaseModel):
    slug: str
    faculty_code: str
    faculty_name: str | None
    section_name: str
    topic_id: int | None
    topic_name: str
    title: str
    subtitle: str | None
    difficulty: str
    duration_minutes: int
    summary: str
    quiz_questions_count: int


class AdminClinicalCaseDetailsResponse(AdminClinicalCaseListItemResponse):
    patient_summary: str
    focus_points: list[str]
    exam_targets: list[str]
    discussion_questions: list[str]
    quiz_questions: list[AdminClinicalCaseQuizQuestionResponse]
    clinical_facts: list[AdminClinicalCaseFactResponse]


class AdminClinicalCaseDeleteResponse(BaseModel):
    slug: str
    deleted: bool
