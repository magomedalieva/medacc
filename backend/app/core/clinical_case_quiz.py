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
CASE_HINT_TEMPLATES = (
    "Начни с ведущего синдрома и проверь, есть ли признаки угрозы. Ориентир для выбора: {hint}. К правильному решению ведет логика: {answer}.",
    "Собери жалобы, осмотр и риск в одну причинную цепочку. Если вариант не объясняет {hint}, он, вероятно, уводит в сторону; ищи ход, который приводит к {answer}.",
    "Оцени срочность: какой факт меняет ближайшую тактику помощи. В этом шаге важнее всего {hint}; ответ должен быть совместим с решением {answer}.",
    "Отдели опасные признаки от фоновых деталей. Не выбирай действие, которое оставляет без внимания {hint}; клинически безопасное направление здесь - {answer}.",
    "Проверь рабочую гипотезу через дифференциальный ряд. Сравни варианты с ориентиром {hint} и оставь тот, который лучше всего подтверждает {answer}.",
    "Думай не о быстром формальном шаге, а о последствиях для пациента. Если принять во внимание {hint}, наиболее обоснованная тактика должна вести к {answer}.",
    "Сначала спроси себя, что опаснее всего пропустить. Подсказка для рассуждения: {hint}; правильный выбор закрывает риск через {answer}.",
    "Проверь причинно-следственную связь: симптом, механизм, возможное осложнение. Ориентируйся на {hint} и ищи вариант, который логически заканчивается {answer}.",
    "Сравни варианты по безопасности: какой из них снижает риск ухудшения, а не просто звучит правдоподобно. Ключевой ориентир - {hint}; итоговая тактика - {answer}.",
    "Исключи ответы, основанные только на одном симптоме. Здесь нужно учесть {hint}, поэтому сильный вариант должен приводить к {answer}.",
    "Представь, что нужно объяснить решение старшему врачу: какие данные ты назовешь первыми. Опирайся на {hint}; вывод должен совпасть с {answer}.",
    "Проверь, не маскирует ли ситуация более опасное состояние. В фокусе держи {hint}; выбирай действие, которое клинически обосновывает {answer}.",
)


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
        hint = build_case_question_hint(
            prompt=prompts[index % len(prompts)],
            correct_answer=correct_answer,
            fallback_hint=hint_pool[index % len(hint_pool)] if hint_pool else None,
            index=index,
        )

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


def enrich_case_quiz_question_hints(questions: list[ClinicalCaseQuizQuestion]) -> list[ClinicalCaseQuizQuestion]:
    hint_counts: dict[str, int] = {}

    for question in questions:
        if question.hint is None:
            continue

        hint_key = question.hint.strip().lower()
        if hint_key:
            hint_counts[hint_key] = hint_counts.get(hint_key, 0) + 1

    for index, question in enumerate(questions):
        hint_key = question.hint.strip().lower() if question.hint else ""

        if not hint_key or hint_counts.get(hint_key, 0) > 1:
            question.hint = build_case_question_hint(
                prompt=question.prompt,
                correct_answer=question.explanation,
                fallback_hint=question.hint,
                index=index,
            )

    return questions


def build_case_question_hint(
    *,
    prompt: str,
    correct_answer: str,
    fallback_hint: str | None,
    index: int,
) -> str:
    normalized_answer = _strip_trailing_punctuation(correct_answer)
    normalized_fallback = _strip_trailing_punctuation(fallback_hint or "")
    clinical_hint = (
        normalized_fallback
        if normalized_fallback and normalized_fallback.lower() != normalized_answer.lower()
        else normalized_answer or DEFAULT_CASE_QUIZ_FOCUS
    )
    clinical_answer = normalized_answer or clinical_hint
    template = CASE_HINT_TEMPLATES[index % len(CASE_HINT_TEMPLATES)]

    return template.format(hint=clinical_hint, answer=clinical_answer)


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


def _strip_trailing_punctuation(value: str) -> str:
    return value.strip().rstrip(".,;:!?")


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
