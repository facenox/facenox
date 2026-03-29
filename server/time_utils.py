from __future__ import annotations

from datetime import datetime, time, timezone


def get_local_timezone():
    return datetime.now().astimezone().tzinfo or timezone.utc


def local_now() -> datetime:
    return datetime.now(get_local_timezone())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_local_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=get_local_timezone())
    return value.astimezone(get_local_timezone())


def ensure_utc_aware(
    value: datetime, *, assume_local_when_naive: bool = True
) -> datetime:
    if value.tzinfo is None:
        if assume_local_when_naive:
            value = value.replace(tzinfo=get_local_timezone())
        else:
            value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def to_storage_local(value: datetime) -> datetime:
    return ensure_local_aware(value).replace(tzinfo=None)


def from_storage_local(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=get_local_timezone())
    return value.astimezone(get_local_timezone())


def to_api_utc(value: datetime | None) -> datetime | None:
    localized = from_storage_local(value)
    if localized is None:
        return None
    return localized.astimezone(timezone.utc)


def local_date_string(value: datetime) -> str:
    return ensure_local_aware(value).strftime("%Y-%m-%d")


def local_day_bounds(date_string: str) -> tuple[datetime, datetime]:
    target_date = datetime.strptime(date_string, "%Y-%m-%d").date()
    start = datetime.combine(target_date, time.min)
    end = datetime.combine(target_date, time.max).replace(microsecond=0)
    return start, end
