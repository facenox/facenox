"""Versioned attendance instants alongside legacy, local SQLite columns.

Never backfill a naive historical value with today's machine timezone.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from time_utils import ensure_local_aware, get_local_timezone


def read_value(row, key):
    return row.get(key) if isinstance(row, dict) else getattr(row, key, None)


def capture_fields(field: str, value: datetime | None) -> dict:
    """Only aware input establishes a new authoritative instant."""
    result = {
        field: value.replace(tzinfo=None) if value else None,
        f"{field}_utc": None,
        f"{field}_timezone": None,
        f"{field}_offset_seconds": None,
    }
    if value is not None and value.tzinfo is not None:
        result.update(
            {
                f"{field}_utc": value.astimezone(timezone.utc).replace(tzinfo=None),
                f"{field}_timezone": getattr(value.tzinfo, "key", None),
                f"{field}_offset_seconds": int(value.utcoffset().total_seconds()),
            }
        )
    return result


def event_time(row, field: str) -> datetime | None:
    """Return the captured local clock with an unambiguous offset.

    Legacy rows retain their former interpretation but are not upgraded merely
    by being read. Stale metadata from older writers must not override an edit.
    """
    local = read_value(row, field)
    utc = read_value(row, f"{field}_utc")
    offset = read_value(row, f"{field}_offset_seconds")
    if utc is not None and offset is not None:
        instant = utc.replace(tzinfo=timezone.utc)
        fixed = instant.astimezone(timezone(timedelta(seconds=offset)))
        if local is not None and fixed.replace(tzinfo=None) == local.replace(
            tzinfo=None
        ):
            zone_name = read_value(row, f"{field}_timezone")
            if zone_name:
                try:
                    zoned = instant.astimezone(ZoneInfo(zone_name))
                    if zoned.utcoffset() == fixed.utcoffset():
                        return zoned
                except (KeyError, ValueError):
                    pass
            return fixed
    return local


def instant_for_sort(row, field: str) -> datetime:
    value = event_time(row, field)
    return ensure_local_aware(value).astimezone(timezone.utc)


def manual_event_time(value: datetime, zone_name: str | None = None) -> datetime:
    """Explicit offsets are accepted; ambiguous/imaginary naive input is rejected."""
    zone = ZoneInfo(zone_name) if zone_name else get_local_timezone()
    if value.tzinfo is not None:
        return value.astimezone(zone)
    candidates = {}
    for fold in (0, 1):
        candidate = value.replace(tzinfo=zone, fold=fold)
        instant = candidate.astimezone(timezone.utc)
        if instant.astimezone(zone).replace(tzinfo=None) == value:
            candidates[instant] = candidate
    if not candidates:
        raise ValueError("This local time does not exist due to a clock change.")
    if len(candidates) != 1:
        raise ValueError("This local time occurs twice. Supply an explicit UTC offset.")
    return next(iter(candidates.values()))


def normalize_session_times(data: dict) -> dict:
    result = dict(data)
    for field in ("check_in_time", "check_out_time"):
        result.update(capture_fields(field, event_time(data, field)))
    start = event_time(result, "check_in_time")
    end = event_time(result, "check_out_time")
    if start and end and start.tzinfo and end.tzinfo:
        seconds = (
            end.astimezone(timezone.utc) - start.astimezone(timezone.utc)
        ).total_seconds()
        if seconds < 0:
            raise ValueError("Check-out must not precede check-in.")
        result["total_hours"] = seconds / 3600
    return result


def restore_fields(row, field: str) -> dict:
    """Restore an exported instant without using the importing machine's zone."""
    value = read_value(row, field)
    offset = read_value(row, f"{field}_offset_seconds")
    zone_name = read_value(row, f"{field}_timezone")
    if value is not None and value.tzinfo is not None and offset is not None:
        local = value.astimezone(timezone(timedelta(seconds=offset)))
        fields = capture_fields(field, local)
        fields[f"{field}_timezone"] = zone_name
        return fields
    # Older backups have no captured context: retain the legacy behavior without
    # inventing authoritative UTC companions.
    return capture_fields(
        field, ensure_local_aware(value).replace(tzinfo=None) if value else None
    )
