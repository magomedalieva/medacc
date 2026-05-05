from __future__ import annotations

from datetime import date, datetime, timedelta, timezone, tzinfo
from functools import lru_cache
import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings


logger = logging.getLogger(__name__)

_FIXED_TIMEZONE_FALLBACKS: dict[str, tzinfo] = {
    "Europe/Moscow": timezone(timedelta(hours=3), name="Europe/Moscow"),
}


def _parse_utc_offset(timezone_name: str) -> tzinfo | None:
    normalized = timezone_name.strip().upper()
    offset_token = ""

    if normalized.startswith("UTC"):
        offset_token = timezone_name.strip()[3:]
    elif timezone_name.startswith(("+", "-")):
        offset_token = timezone_name.strip()

    if not offset_token:
        return None

    sign = 1
    if offset_token.startswith("-"):
        sign = -1

    raw_value = offset_token[1:] if offset_token[:1] in {"+", "-"} else offset_token
    if not raw_value:
        return timezone.utc

    if ":" in raw_value:
        hours_text, minutes_text = raw_value.split(":", maxsplit=1)
    else:
        hours_text, minutes_text = raw_value, "00"

    if not (hours_text.isdigit() and minutes_text.isdigit()):
        return None

    hours = int(hours_text)
    minutes = int(minutes_text)
    if hours > 23 or minutes > 59:
        return None

    offset = timedelta(hours=hours, minutes=minutes) * sign
    return timezone(offset, name=f"UTC{offset_token or '+00:00'}")


@lru_cache
def get_system_timezone() -> timezone | ZoneInfo:
    timezone_name = settings.system_timezone.strip()

    if timezone_name.upper() == "UTC":
        return timezone.utc

    explicit_offset = _parse_utc_offset(timezone_name)
    if explicit_offset is not None:
        return explicit_offset

    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        fallback_timezone = _FIXED_TIMEZONE_FALLBACKS.get(timezone_name)
        if fallback_timezone is not None:
            logger.warning(
                "System timezone %s is unavailable, using fixed-offset fallback",
                timezone_name,
            )
            return fallback_timezone

        logger.warning("System timezone %s is unavailable, falling back to UTC", timezone_name)
        return timezone.utc


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    return utc_now().astimezone(get_system_timezone())


def today() -> date:
    return local_now().date()
