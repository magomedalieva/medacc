from app.models.clinical_case import ClinicalCaseQuizOption, ClinicalCaseQuizQuestion


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


def build_fallback_case_quiz_questions(
    *,
    slug: str,
    summary: str,
    patient_summary: str,
    focus_points: list[str],
    exam_targets: list[str],
    discussion_questions: list[str],
) -> list[ClinicalCaseQuizQuestion]:
    prompts = _normalize_text_items(discussion_questions) or [DEFAULT_CASE_QUIZ_PROMPT]
    correct_pool = [
        *_normalize_text_items(exam_targets),
        *_normalize_text_items(focus_points),
    ]

    if not correct_pool:
        fallback_correct = summary.strip() or patient_summary.strip() or DEFAULT_CASE_QUIZ_FOCUS
        correct_pool = [fallback_correct]

    hint_pool = _normalize_text_items(focus_points) or _normalize_text_items(exam_targets)
    questions: list[ClinicalCaseQuizQuestion] = []

    for index in range(CASE_QUIZ_QUESTION_COUNT):
        correct_answer = correct_pool[index % len(correct_pool)]
        options, correct_option_label = _build_options(correct_answer, index)
        hint = hint_pool[index % len(hint_pool)] if hint_pool else None

        questions.append(
            ClinicalCaseQuizQuestion(
                id=f"{slug}-quiz-{index + 1}",
                prompt=prompts[index % len(prompts)],
                options=options,
                correct_option_label=correct_option_label,
                explanation=correct_answer,
                hint=hint,
            )
        )

    return questions


def _normalize_text_items(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        normalized_value = value.strip()

        if not normalized_value:
            continue

        key = normalized_value.lower()

        if key in seen:
            continue

        seen.add(key)
        result.append(normalized_value)

    return result


def _build_options(correct_answer: str, seed: int) -> tuple[list[ClinicalCaseQuizOption], str]:
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
            ClinicalCaseQuizOption(label=label, text=text)
            for label, text in zip(CASE_QUIZ_OPTION_LABELS, option_values, strict=True)
        ],
        CASE_QUIZ_OPTION_LABELS[correct_index],
    )
