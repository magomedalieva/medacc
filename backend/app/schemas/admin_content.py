from pydantic import BaseModel


class AdminContentCoverageTopicResponse(BaseModel):
    topic_id: int
    topic_name: str
    section_id: int
    section_name: str
    active_question_count: int
    inactive_question_count: int
    case_count: int
    case_quiz_question_count: int
    osce_station_count: int
    osce_checklist_item_count: int
    osce_quiz_question_count: int


class AdminContentCoverageSectionResponse(BaseModel):
    section_id: int
    section_name: str
    active_question_count: int
    inactive_question_count: int
    case_count: int
    case_quiz_question_count: int
    osce_station_count: int
    osce_checklist_item_count: int
    osce_quiz_question_count: int
    topics: list[AdminContentCoverageTopicResponse]


class AdminContentCoverageFacultyResponse(BaseModel):
    faculty_id: int
    faculty_code: str
    faculty_name: str
    active_question_count: int
    inactive_question_count: int
    case_count: int
    case_quiz_question_count: int
    osce_station_count: int
    osce_checklist_item_count: int
    osce_quiz_question_count: int
    strict_simulation_ready: bool
    gaps: list[str]
    sections: list[AdminContentCoverageSectionResponse]


class AdminContentCoverageTargetsResponse(BaseModel):
    active_question_count: int
    case_count: int
    case_quiz_question_count: int
    osce_station_count: int


class AdminContentCoverageTotalsResponse(BaseModel):
    active_question_count: int
    inactive_question_count: int
    case_count: int
    case_quiz_question_count: int
    osce_station_count: int
    osce_checklist_item_count: int
    osce_quiz_question_count: int


class AdminContentCoverageResponse(BaseModel):
    targets: AdminContentCoverageTargetsResponse
    totals: AdminContentCoverageTotalsResponse
    faculties: list[AdminContentCoverageFacultyResponse]
