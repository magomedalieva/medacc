from app.core.clinical_case_quiz import CASE_QUIZ_QUESTION_COUNT, build_fallback_case_quiz_questions


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
