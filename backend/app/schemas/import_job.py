from pydantic import BaseModel, Field


class QuestionImportRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)


class ImportFileResponse(BaseModel):
    file_name: str
    size_bytes: int


class QuestionImportValidationIssue(BaseModel):
    row_number: int | None = None
    message: str


class QuestionImportValidationResponse(BaseModel):
    file_name: str
    can_import: bool
    row_count: int
    valid_row_count: int
    issue_count: int
    issues: list[QuestionImportValidationIssue]
    faculties: list[str]
    section_count: int
    topic_count: int
    difficulty_counts: dict[str, int]


class QuestionImportResponse(BaseModel):
    file_name: str
    created_questions: int
    updated_questions: int
    created_sections: int
    created_topics: int
