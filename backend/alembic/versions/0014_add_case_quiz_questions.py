from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_case_quiz_questions"
down_revision: Union[str, Sequence[str], None] = "0013_content_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CASE_QUIZ_QUESTION_COUNT = 12
CASE_QUIZ_OPTION_LABELS = ("A", "B", "C", "D")
CASE_QUIZ_DISTRACTORS = (
    "Отложить решение без оценки рисков",
    "Назначить лечение без уточнения ведущего синдрома",
    "Игнорировать опасные признаки и ограничиться наблюдением",
    "Выбрать тактику только по одному симптому",
    "Пропустить сбор ключевого анамнеза",
    "Сразу перейти к узкому вмешательству без базовой оценки",
)
DEFAULT_CASE_QUIZ_PROMPT = "Какое решение наиболее безопасно в этом клиническом кейсе?"
DEFAULT_CASE_QUIZ_FOCUS = "Связать жалобы, данные осмотра и выбрать безопасную тактику"


def upgrade() -> None:
    op.add_column(
        "clinical_cases",
        sa.Column("quiz_questions", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    _backfill_case_quiz_questions()
    op.alter_column("clinical_cases", "quiz_questions", server_default=None)


def downgrade() -> None:
    op.drop_column("clinical_cases", "quiz_questions")


def _backfill_case_quiz_questions() -> None:
    bind = op.get_bind()
    clinical_cases = sa.table(
        "clinical_cases",
        sa.column("slug", sa.String()),
        sa.column("summary", sa.Text()),
        sa.column("patient_summary", sa.Text()),
        sa.column("focus_points", sa.JSON()),
        sa.column("exam_targets", sa.JSON()),
        sa.column("discussion_questions", sa.JSON()),
        sa.column("quiz_questions", sa.JSON()),
    )
    select_query = sa.select(
        clinical_cases.c.slug,
        clinical_cases.c.summary,
        clinical_cases.c.patient_summary,
        clinical_cases.c.focus_points,
        clinical_cases.c.exam_targets,
        clinical_cases.c.discussion_questions,
        clinical_cases.c.quiz_questions,
    )
    update_query = clinical_cases.update().where(clinical_cases.c.slug == sa.bindparam("target_slug")).values(
        quiz_questions=sa.bindparam("quiz_questions_payload")
    )

    for row in bind.execute(select_query).mappings():
        existing_questions = row.get("quiz_questions")

        if isinstance(existing_questions, list) and len(existing_questions) == CASE_QUIZ_QUESTION_COUNT:
            continue

        bind.execute(
            update_query,
            {
                "target_slug": row["slug"],
                "quiz_questions_payload": _build_case_quiz_questions(
                    slug=str(row["slug"] or "case"),
                    summary=str(row["summary"] or ""),
                    patient_summary=str(row["patient_summary"] or ""),
                    focus_points=_normalize_text_list(row.get("focus_points")),
                    exam_targets=_normalize_text_list(row.get("exam_targets")),
                    discussion_questions=_normalize_text_list(row.get("discussion_questions")),
                ),
            },
        )


def _build_case_quiz_questions(
    *,
    slug: str,
    summary: str,
    patient_summary: str,
    focus_points: list[str],
    exam_targets: list[str],
    discussion_questions: list[str],
) -> list[dict[str, object]]:
    prompts = discussion_questions or [DEFAULT_CASE_QUIZ_PROMPT]
    correct_pool = [*exam_targets, *focus_points]

    if not correct_pool:
        correct_pool = [summary.strip() or patient_summary.strip() or DEFAULT_CASE_QUIZ_FOCUS]

    hint_pool = focus_points or exam_targets
    questions: list[dict[str, object]] = []

    for index in range(CASE_QUIZ_QUESTION_COUNT):
        correct_answer = correct_pool[index % len(correct_pool)]
        options, correct_option_label = _build_options(correct_answer, index)
        hint = hint_pool[index % len(hint_pool)] if hint_pool else None
        questions.append(
            {
                "id": f"{slug}-quiz-{index + 1}",
                "prompt": prompts[index % len(prompts)],
                "options": options,
                "correct_option_label": correct_option_label,
                "explanation": correct_answer,
                "hint": hint,
            }
        )

    return questions


def _build_options(correct_answer: str, seed: int) -> tuple[list[dict[str, str]], str]:
    distractors: list[str] = []

    for item in CASE_QUIZ_DISTRACTORS:
        if item == correct_answer or item in distractors:
            continue

        distractors.append(item)

        if len(distractors) == len(CASE_QUIZ_OPTION_LABELS) - 1:
            break

    correct_index = seed % len(CASE_QUIZ_OPTION_LABELS)
    option_values = distractors[:]
    option_values.insert(correct_index, correct_answer)

    return (
        [
            {"label": label, "text": text}
            for label, text in zip(CASE_QUIZ_OPTION_LABELS, option_values, strict=True)
        ],
        CASE_QUIZ_OPTION_LABELS[correct_index],
    )


def _normalize_text_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []

    normalized_values: list[str] = []
    seen: set[str] = set()

    for item in value:
        if not isinstance(item, str):
            continue

        normalized_item = item.strip()

        if not normalized_item:
            continue

        key = normalized_item.lower()

        if key in seen:
            continue

        seen.add(key)
        normalized_values.append(normalized_item)

    return normalized_values
