from __future__ import annotations

from datetime import date, timedelta


DEFAULT_STUDY_WEEKDAYS: tuple[int, ...] = (0, 1, 2, 3, 4, 5, 6)
RUSSIAN_WEEKDAY_SHORT_LABELS: dict[int, str] = {
    0: "Пн",
    1: "Вт",
    2: "Ср",
    3: "Чт",
    4: "Пт",
    5: "Сб",
    6: "Вс",
}


def normalize_study_weekdays(value: list[int] | tuple[int, ...] | None) -> list[int]:
    if value is None:
        return list(DEFAULT_STUDY_WEEKDAYS)

    normalized = sorted({int(item) for item in value})

    if len(normalized) == 0:
        raise ValueError("Нужно выбрать хотя бы один учебный день недели")

    if any(item < 0 or item > 6 for item in normalized):
        raise ValueError("Учебные дни недели должны быть числами от 0 до 6")

    return normalized


def format_study_weekdays(value: list[int] | tuple[int, ...] | None) -> str:
    normalized = normalize_study_weekdays(value)

    if tuple(normalized) == DEFAULT_STUDY_WEEKDAYS:
        return "ежедневно"

    return ", ".join(RUSSIAN_WEEKDAY_SHORT_LABELS.get(item, str(item)) for item in normalized)


def is_study_weekday(target_date: date, value: list[int] | tuple[int, ...] | None) -> bool:
    normalized = normalize_study_weekdays(value)
    return target_date.weekday() in normalized


def build_study_day_offsets(
    start_date: date,
    calendar_days_until_target: int,
    value: list[int] | tuple[int, ...] | None,
) -> list[int]:
    normalized = normalize_study_weekdays(value)

    if calendar_days_until_target <= 0:
        return []

    return [
        offset
        for offset in range(calendar_days_until_target)
        if (start_date + timedelta(days=offset)).weekday() in normalized
    ]


def find_next_study_date(
    after_date: date,
    value: list[int] | tuple[int, ...] | None,
    accreditation_date: date | None = None,
) -> date | None:
    normalized = normalize_study_weekdays(value)
    candidate = after_date + timedelta(days=1)
    last_available_date = accreditation_date - timedelta(days=1) if accreditation_date is not None else None

    while last_available_date is None or candidate <= last_available_date:
        if candidate.weekday() in normalized:
            return candidate

        candidate += timedelta(days=1)

    return None
