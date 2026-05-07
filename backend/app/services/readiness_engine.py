from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.clock import utc_now


TEST_TRACK_KEY = "tests"
CASE_TRACK_KEY = "cases"
OSCE_TRACK_KEY = "osce"

# Internal product heuristic for the training index, not an official exam weighting.
OVERALL_TEST_WEIGHT = 0.45
OVERALL_CASE_WEIGHT = 0.25
OVERALL_OSCE_WEIGHT = 0.30
CASE_TARGET_ATTEMPTS = 6
TEST_TARGET_EXAM_ATTEMPTS = 4
CASE_RECENT_TARGET_ATTEMPTS = 2
OSCE_RECENT_TARGET_ATTEMPTS = 2
READINESS_READY_THRESHOLD = 85.0
READINESS_BUILDING_THRESHOLD = 70.0


@dataclass(frozen=True)
class ReadinessTrackSnapshot:
    key: str
    label: str
    readiness_percent: float
    deficit_percent: float
    status: str
    detail: str
    coverage_percent: float = 0.0
    freshness_percent: float = 0.0
    consistency_percent: float = 0.0
    volume_percent: float = 0.0
    momentum_percent: float = 0.0


@dataclass(frozen=True)
class ReadinessSummarySnapshot:
    overall_readiness_percent: float
    recommended_focus_key: str
    recommended_focus_label: str
    tracks: list[ReadinessTrackSnapshot]


def build_test_readiness(
    topic_count: int,
    covered_topics_count: int,
    stable_topics_count: int,
    average_topic_accuracy: float,
    exam_attempts_count: int,
    average_exam_score: float | None,
    best_exam_score: float | None,
    overdue_topics_count: int = 0,
    due_topics_count: int = 0,
    critical_topics_count: int = 0,
    fragile_topics_count: int = 0,
    last_exam_finished_at: datetime | None = None,
) -> ReadinessTrackSnapshot:
    topic_coverage_percent = _ratio_percent(covered_topics_count, topic_count)
    stability_percent = _ratio_percent(stable_topics_count, topic_count)
    weak_topics_percent = _ratio_percent(critical_topics_count + fragile_topics_count, topic_count)
    overdue_topics_percent = _ratio_percent(overdue_topics_count, topic_count)
    due_topics_percent = _ratio_percent(due_topics_count, topic_count)
    exam_quality_percent = 0.0
    exam_consistency_percent = 0.0
    exam_volume_percent = _round_percent(min(exam_attempts_count / TEST_TARGET_EXAM_ATTEMPTS, 1.0) * 100)
    exam_freshness_percent = _recency_percent(_days_since(last_exam_finished_at), missing_value=0.0)
    retention_percent = (
        _round_percent(
            max(
                0.0,
                100.0
                - (weak_topics_percent * 0.45)
                - (overdue_topics_percent * 0.85)
                - (due_topics_percent * 0.35),
            )
        )
        if covered_topics_count > 0 or exam_attempts_count > 0
        else 0.0
    )

    if exam_attempts_count > 0:
        exam_quality_percent = ((average_exam_score or 0.0) * 0.45) + ((best_exam_score or 0.0) * 0.55)
        exam_consistency_percent = _round_percent(
            max(0.0, 100.0 - abs((best_exam_score or 0.0) - (average_exam_score or 0.0)) * 2.4)
        )

    momentum_percent = _round_percent(
        (exam_freshness_percent * 0.35)
        + (retention_percent * 0.35)
        + (exam_consistency_percent * 0.30 if exam_attempts_count > 0 else exam_volume_percent * 0.30)
    )

    readiness_percent = _round_percent(
        (average_topic_accuracy * 0.22)
        + (topic_coverage_percent * 0.14)
        + (stability_percent * 0.16)
        + (exam_quality_percent * 0.16)
        + (exam_volume_percent * 0.08)
        + (exam_consistency_percent * 0.08)
        + (exam_freshness_percent * 0.08)
        + (retention_percent * 0.08)
    )

    if exam_attempts_count == 0:
        detail = (
            f"Покрыто тем: {covered_topics_count}/{topic_count}, стабильно закрыто {stable_topics_count}/{topic_count}. "
            "Пробный тест 80/60 еще не запускался."
        )
    else:
        freshness_note = _freshness_note(last_exam_finished_at)
        detail = (
            f"Покрыто тем: {covered_topics_count}/{topic_count}, стабильно закрыто {stable_topics_count}/{topic_count}. "
            f"Пробных тестов: {exam_attempts_count}, лучший результат {int(round(best_exam_score or 0.0))}%. "
            f"{freshness_note}"
        )

    return ReadinessTrackSnapshot(
        key=TEST_TRACK_KEY,
        label="Тестовый этап",
        readiness_percent=readiness_percent,
        deficit_percent=_round_percent(100.0 - readiness_percent),
        status=_resolve_status(readiness_percent),
        detail=detail,
        coverage_percent=topic_coverage_percent,
        freshness_percent=exam_freshness_percent,
        consistency_percent=exam_consistency_percent,
        volume_percent=exam_volume_percent,
        momentum_percent=momentum_percent,
    )


def build_case_readiness(
    topic_count: int,
    case_topics_count: int,
    case_attempts_count: int,
    average_case_accuracy: float | None,
    best_case_accuracy: float | None,
    recent_case_accuracy: float | None = None,
    recent_case_attempts_count: int = 0,
    weak_case_attempts_count: int = 0,
    last_case_attempt_at: datetime | None = None,
) -> ReadinessTrackSnapshot:
    topic_coverage_percent = _ratio_percent(case_topics_count, topic_count)
    attempts_volume_percent = _round_percent(min(case_attempts_count / CASE_TARGET_ATTEMPTS, 1.0) * 100)
    recent_volume_percent = _round_percent(min(recent_case_attempts_count / CASE_RECENT_TARGET_ATTEMPTS, 1.0) * 100)
    accuracy_component = average_case_accuracy or 0.0
    weak_attempt_ratio_percent = _round_percent(
        min(weak_case_attempts_count / case_attempts_count, 1.0) * 100 if case_attempts_count > 0 else 0.0
    )
    consistency_percent = (
        _round_percent(
            max(
                0.0,
                100.0
                - abs((best_case_accuracy or accuracy_component) - accuracy_component) * 2.0
                - (weak_attempt_ratio_percent * 0.45),
            )
        )
        if case_attempts_count > 0
        else 0.0
    )
    freshness_percent = _recency_percent(_days_since(last_case_attempt_at), missing_value=0.0)
    momentum_percent = _round_percent(
        50.0 + (((recent_case_accuracy or accuracy_component) - accuracy_component) * 2.5)
    ) if case_attempts_count > 0 else 0.0
    readiness_percent = _round_percent(
        (accuracy_component * 0.30)
        + (topic_coverage_percent * 0.18)
        + (attempts_volume_percent * 0.18)
        + (consistency_percent * 0.12)
        + (freshness_percent * 0.10)
        + (recent_volume_percent * 0.05)
        + (momentum_percent * 0.07)
    )

    if case_attempts_count == 0:
        detail = "Кейсы еще не проходились. Система пока не видит устойчивость клинического мышления."
    else:
        freshness_note = _freshness_note(last_case_attempt_at)
        detail = (
            f"Попыток: {case_attempts_count}, тем с кейсами: {case_topics_count}/{topic_count}. "
            f"Средняя точность {int(round(average_case_accuracy or 0.0))}%, лучший кейс {int(round(best_case_accuracy or 0.0))}%. "
            f"{freshness_note}"
        )

    return ReadinessTrackSnapshot(
        key=CASE_TRACK_KEY,
        label="Кейсовый этап",
        readiness_percent=readiness_percent,
        deficit_percent=_round_percent(100.0 - readiness_percent),
        status=_resolve_status(readiness_percent),
        detail=detail,
        coverage_percent=topic_coverage_percent,
        freshness_percent=freshness_percent,
        consistency_percent=consistency_percent,
        volume_percent=attempts_volume_percent,
        momentum_percent=momentum_percent,
    )


def build_osce_readiness(
    station_count: int,
    started_stations_count: int,
    mastered_stations_count: int,
    average_best_score: float | None,
    total_attempts_count: int = 0,
    recent_attempts_count: int = 0,
    average_recent_score: float | None = None,
    last_osce_attempt_at: datetime | None = None,
) -> ReadinessTrackSnapshot:
    started_coverage_percent = _ratio_percent(started_stations_count, station_count)
    mastered_coverage_percent = _ratio_percent(mastered_stations_count, station_count)
    best_score_component = average_best_score or 0.0
    attempts_volume_percent = _round_percent(
        min(total_attempts_count / max(station_count, 1), 1.0) * 100 if station_count > 0 else 0.0
    )
    recent_volume_percent = _round_percent(min(recent_attempts_count / OSCE_RECENT_TARGET_ATTEMPTS, 1.0) * 100)
    freshness_percent = _recency_percent(_days_since(last_osce_attempt_at), missing_value=0.0)
    momentum_percent = _round_percent(
        50.0 + (((average_recent_score or best_score_component) - best_score_component) * 2.0)
    ) if total_attempts_count > 0 else 0.0
    readiness_percent = _round_percent(
        (started_coverage_percent * 0.18)
        + (mastered_coverage_percent * 0.25)
        + (best_score_component * 0.25)
        + (attempts_volume_percent * 0.12)
        + (freshness_percent * 0.10)
        + (recent_volume_percent * 0.05)
        + (momentum_percent * 0.05)
    )

    if station_count == 0:
        detail = "Для этого направления пока нет доступных станций ОСКЭ."
    elif started_stations_count == 0:
        detail = f"Доступно станций: {station_count}. Ни одна станция еще не была начата."
    else:
        freshness_note = _freshness_note(last_osce_attempt_at)
        detail = (
            f"Начато станций: {started_stations_count}/{station_count}, "
            f"освоено {mastered_stations_count}/{station_count}. "
            f"Средний лучший результат {int(round(average_best_score or 0.0))}%. {freshness_note}"
        )

    return ReadinessTrackSnapshot(
        key=OSCE_TRACK_KEY,
        label="Практический этап / ОСКЭ",
        readiness_percent=readiness_percent,
        deficit_percent=_round_percent(100.0 - readiness_percent),
        status=_resolve_status(readiness_percent),
        detail=detail,
        coverage_percent=started_coverage_percent,
        freshness_percent=freshness_percent,
        consistency_percent=mastered_coverage_percent,
        volume_percent=attempts_volume_percent,
        momentum_percent=momentum_percent,
    )


def build_readiness_summary(
    test_track: ReadinessTrackSnapshot,
    case_track: ReadinessTrackSnapshot,
    osce_track: ReadinessTrackSnapshot,
) -> ReadinessSummarySnapshot:
    weakest_track_readiness = min(
        test_track.readiness_percent,
        case_track.readiness_percent,
        osce_track.readiness_percent,
    )
    weighted_overall_readiness = _round_percent(
        (test_track.readiness_percent * OVERALL_TEST_WEIGHT)
        + (case_track.readiness_percent * OVERALL_CASE_WEIGHT)
        + (osce_track.readiness_percent * OVERALL_OSCE_WEIGHT)
    )
    overall_readiness_percent = _round_percent(
        (weighted_overall_readiness * 0.85) + (weakest_track_readiness * 0.15)
    )
    tracks = [test_track, case_track, osce_track]
    recommended_focus = min(
        tracks,
        key=lambda item: (
            item.readiness_percent,
            item.momentum_percent,
            item.freshness_percent,
            item.deficit_percent,
            item.label.lower(),
        ),
    )

    return ReadinessSummarySnapshot(
        overall_readiness_percent=overall_readiness_percent,
        recommended_focus_key=recommended_focus.key,
        recommended_focus_label=recommended_focus.label,
        tracks=tracks,
    )


def _resolve_status(readiness_percent: float) -> str:
    if readiness_percent >= READINESS_READY_THRESHOLD:
        return "ready"

    if readiness_percent >= READINESS_BUILDING_THRESHOLD:
        return "building"

    return "risk"


def _ratio_percent(value: int, total: int) -> float:
    if total <= 0:
        return 0.0

    return _round_percent((value / total) * 100)


def _round_percent(value: float) -> float:
    return round(max(0.0, min(value, 100.0)), 2)


def _days_since(value: datetime | None) -> int | None:
    if value is None:
        return None

    if value.tzinfo is None:
        normalized = value.replace(tzinfo=timezone.utc)
    else:
        normalized = value.astimezone(timezone.utc)

    return max((utc_now() - normalized).days, 0)


def _recency_percent(days_since: int | None, *, missing_value: float) -> float:
    if days_since is None:
        return _round_percent(missing_value)

    if days_since <= 7:
        return 100.0

    if days_since <= 14:
        return 82.0

    if days_since <= 21:
        return 66.0

    if days_since <= 30:
        return 52.0

    return 36.0


def _freshness_note(value: datetime | None) -> str:
    days_since = _days_since(value)

    if days_since is None:
        return "Свежего контрольного контакта по этому треку пока не было."

    if days_since == 0:
        return "Последний контрольный контакт был сегодня."

    if days_since == 1:
        return "Последний контрольный контакт был вчера."

    return f"Последний контрольный контакт был {days_since} дн. назад."
