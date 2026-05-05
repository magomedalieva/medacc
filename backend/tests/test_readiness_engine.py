from app.services.readiness_engine import (
    CASE_TRACK_KEY,
    OSCE_TRACK_KEY,
    TEST_TRACK_KEY,
    ReadinessTrackSnapshot,
    build_readiness_summary,
    build_test_readiness,
)


def test_test_readiness_is_bounded_and_reports_risk_for_empty_progress() -> None:
    snapshot = build_test_readiness(
        topic_count=10,
        covered_topics_count=0,
        stable_topics_count=0,
        average_topic_accuracy=0.0,
        exam_attempts_count=0,
        average_exam_score=None,
        best_exam_score=None,
    )

    assert snapshot.key == TEST_TRACK_KEY
    assert snapshot.status == "risk"
    assert snapshot.readiness_percent == 0.0
    assert snapshot.deficit_percent == 100.0


def test_test_readiness_reaches_ready_status_for_strong_progress() -> None:
    snapshot = build_test_readiness(
        topic_count=10,
        covered_topics_count=10,
        stable_topics_count=10,
        average_topic_accuracy=95.0,
        exam_attempts_count=4,
        average_exam_score=90.0,
        best_exam_score=96.0,
        overdue_topics_count=0,
        due_topics_count=0,
        critical_topics_count=0,
        fragile_topics_count=0,
    )

    assert snapshot.status == "ready"
    assert 80.0 <= snapshot.readiness_percent <= 100.0
    assert snapshot.deficit_percent == round(100.0 - snapshot.readiness_percent, 2)


def test_summary_uses_weighted_score_and_recommends_weakest_track() -> None:
    tests = ReadinessTrackSnapshot(
        key=TEST_TRACK_KEY,
        label="Tests",
        readiness_percent=90.0,
        deficit_percent=10.0,
        status="ready",
        detail="",
    )
    cases = ReadinessTrackSnapshot(
        key=CASE_TRACK_KEY,
        label="Cases",
        readiness_percent=55.0,
        deficit_percent=45.0,
        status="risk",
        detail="",
    )
    osce = ReadinessTrackSnapshot(
        key=OSCE_TRACK_KEY,
        label="OSCE",
        readiness_percent=70.0,
        deficit_percent=30.0,
        status="building",
        detail="",
    )

    summary = build_readiness_summary(tests, cases, osce)

    assert summary.recommended_focus_key == CASE_TRACK_KEY
    assert summary.overall_readiness_percent == 72.21
    assert [track.key for track in summary.tracks] == [TEST_TRACK_KEY, CASE_TRACK_KEY, OSCE_TRACK_KEY]
