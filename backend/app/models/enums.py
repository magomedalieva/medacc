from enum import StrEnum


class UserRole(StrEnum):
    STUDENT = "student"
    ADMIN = "admin"


class StudyIntensity(StrEnum):
    GENTLE = "gentle"
    STEADY = "steady"
    INTENSIVE = "intensive"


class QuestionDifficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class TestSessionMode(StrEnum):
    LEARNING = "learning"
    EXAM = "exam"


class TestSessionStatus(StrEnum):
    ACTIVE = "active"
    FINISHED = "finished"


class PlanTaskType(StrEnum):
    TEST = "test"
    EXAM_SIM = "exam_sim"
    CASE = "case"
    OSCE = "osce"


class PlanTaskVariant(StrEnum):
    STANDARD = "standard"
    FINAL_APPROACH_REVIEW = "final_approach_review"
    RECOVERY_REVIEW = "recovery_review"
    FINAL_WEEK_BROAD_REVIEW = "final_week_broad_review"
    PRE_ACCREDITATION_REVIEW = "pre_accreditation_review"
    FINAL_REHEARSAL_EXAM = "final_rehearsal_exam"
    FINAL_REHEARSAL_CASE = "final_rehearsal_case"
    FINAL_REHEARSAL_OSCE = "final_rehearsal_osce"
    FINAL_PHASE_CASE = "final_phase_case"


def enum_values(enum_class: type[StrEnum]) -> list[str]:
    return [item.value for item in enum_class]
