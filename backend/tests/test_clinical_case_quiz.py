from app.core.clinical_case_quiz import (
    CASE_QUIZ_QUESTION_COUNT,
    build_fallback_case_quiz_questions,
    enrich_case_quiz_question_hints,
)
from app.models.clinical_case import ClinicalCaseQuizOption, ClinicalCaseQuizQuestion


def test_fallback_case_quiz_has_expected_shape() -> None:
    questions = build_fallback_case_quiz_questions(
        slug="cardiology-case",
        summary="Chest pain triage",
        patient_summary="Patient with chest pain",
        focus_points=["Assess red flags", "Assess red flags", "Choose safe route"],
        exam_targets=["Call emergency team"],
        discussion_questions=["What is the safest next action?"],
    )

    assert len(questions) == CASE_QUIZ_QUESTION_COUNT
    assert questions[0].id == "cardiology-case-quiz-1"

    for question in questions:
        labels = [option.label for option in question.options]
        assert labels == ["A", "B", "C", "D"]
        assert question.correct_option_label in labels
        assert any(option.label == question.correct_option_label for option in question.options)
        assert question.explanation


def test_fallback_case_quiz_uses_summary_when_no_targets_are_present() -> None:
    questions = build_fallback_case_quiz_questions(
        slug="empty-case",
        summary="Use ABCDE assessment",
        patient_summary="",
        focus_points=[],
        exam_targets=[],
        discussion_questions=[],
    )

    assert questions[0].explanation == "Use ABCDE assessment"
    assert any(option.text == "Use ABCDE assessment" for option in questions[0].options)


def test_fallback_case_quiz_builds_question_specific_hints() -> None:
    questions = build_fallback_case_quiz_questions(
        slug="case-with-hints",
        summary="",
        patient_summary="",
        focus_points=["Assess red flags"],
        exam_targets=["Call emergency team", "Check ECG"],
        discussion_questions=["What confirms the working diagnosis?", "What should be done first?"],
    )

    hints = [question.hint for question in questions]

    assert all(hint for hint in hints)
    assert len(set(hints)) == CASE_QUIZ_QUESTION_COUNT
    assert "Call emergency team" in hints[0]
    assert "ведущего синдрома" in hints[0]
    assert "What confirms the working diagnosis" not in hints[0]
    assert "в вопросе" not in hints[0]


def test_repeated_stored_case_hints_are_enriched() -> None:
    questions = [
        ClinicalCaseQuizQuestion(
            id=f"case-question-{index}",
            prompt=f"Clinical decision {index}",
            options=[ClinicalCaseQuizOption(label="A", text="Action")],
            correct_option_label="A",
            explanation=f"Correct action {index}",
            hint="Assess red flags",
        )
        for index in range(1, 4)
    ]

    enriched_questions = enrich_case_quiz_question_hints(questions)
    hints = [question.hint for question in enriched_questions]

    assert len(set(hints)) == len(hints)
    assert "Clinical decision 1" not in hints[0]
    assert "Correct action 1" in hints[0]
    assert "в вопросе" not in hints[0]
