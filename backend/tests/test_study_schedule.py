from datetime import date

import pytest

from app.core.study_schedule import (
    build_study_day_offsets,
    find_next_study_date,
    is_study_weekday,
    normalize_study_weekdays,
)


def test_normalize_study_weekdays_sorts_deduplicates_and_uses_default() -> None:
    assert normalize_study_weekdays(None) == [0, 1, 2, 3, 4, 5, 6]
    assert normalize_study_weekdays([6, 1, 1, 0]) == [0, 1, 6]


@pytest.mark.parametrize("value", [[], [-1], [7]])
def test_normalize_study_weekdays_rejects_invalid_values(value: list[int]) -> None:
    with pytest.raises(ValueError):
        normalize_study_weekdays(value)


def test_study_day_offsets_follow_selected_weekdays() -> None:
    monday = date(2026, 5, 4)

    assert build_study_day_offsets(monday, 7, [0, 2, 4]) == [0, 2, 4]
    assert is_study_weekday(date(2026, 5, 6), [0, 2, 4]) is True
    assert is_study_weekday(date(2026, 5, 7), [0, 2, 4]) is False


def test_find_next_study_date_respects_accreditation_boundary() -> None:
    monday = date(2026, 5, 4)

    assert find_next_study_date(monday, [2], accreditation_date=date(2026, 5, 7)) == date(2026, 5, 6)
    assert find_next_study_date(monday, [4], accreditation_date=date(2026, 5, 7)) is None
