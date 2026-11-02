"""Compare current/future clock rules, not display names or today's offset alone."""

import re
import struct
from datetime import datetime, timezone
from functools import lru_cache
from importlib import resources
from pathlib import Path
from zoneinfo import TZPATH, ZoneInfo


_NAME = r"(?:<[\w+\-]+>|[A-Za-z]{3,})"
_OFFSET = r"[+-]?\d{1,3}(?::\d{1,2}(?::\d{1,2})?)?"
_FOOTER = re.compile(
    rf"{_NAME}(?P<std>{_OFFSET})(?:{_NAME}(?P<dst>{_OFFSET})?(?:,(?P<rules>.+))?)?"
)


def _offset_seconds(value: str) -> int:
    parts = [int(part) for part in value.lstrip("+-").split(":")]
    seconds = sum(part * unit for part, unit in zip(parts, (3600, 60, 1)))
    # POSIX TZ offsets have the opposite sign to UTC offsets.
    return seconds if value.startswith("-") else -seconds


def _footer_rules(value: str, last_offset: int) -> tuple:
    if not value:
        return ("fixed", last_offset)
    match = _FOOTER.fullmatch(value)
    if not match:
        raise ValueError("Unsupported TZif continuation rule")
    standard = _offset_seconds(match["std"])
    # A footer containing just a standard name/offset has no future DST.
    if match.end("std") == len(value):
        return ("fixed", standard)
    if not match["rules"]:
        raise ValueError("Missing explicit DST continuation rules")
    daylight = _offset_seconds(match["dst"]) if match["dst"] else standard + 3600
    return ("dst", standard, daylight, match["rules"])


def _block_size(counts: tuple, time_size: int) -> int:
    isut, isstd, leaps, transitions, types, abbreviations = counts
    return (
        transitions * (time_size + 1)
        + types * 6
        + abbreviations
        + leaps * (time_size + 4)
        + isstd
        + isut
    )


def _header(data: bytes, offset: int) -> tuple:
    if data[offset : offset + 4] != b"TZif" or len(data) < offset + 44:
        raise ValueError("Invalid TZif header")
    return struct.unpack_from(">6I", data, offset + 20)


def _parse_rules(data: bytes) -> tuple:
    counts = _header(data, 0)
    start, time_size = 44, 4
    modern = data[4:5] in (b"2", b"3", b"4")
    if modern:
        second_header = start + _block_size(counts, 4)
        counts = _header(data, second_header)
        start, time_size = second_header + 44, 8
    end = start + _block_size(counts, time_size)
    if end > len(data) or counts[4] == 0:
        raise ValueError("Incomplete TZif rules")
    count = counts[3]
    times = struct.unpack_from(f">{count}{'q' if modern else 'l'}", data, start)
    indexes = data[start + count * time_size : start + count * (time_size + 1)]
    type_start = start + count * (time_size + 1)
    offsets = tuple(
        struct.unpack_from(">l", data, type_start + i * 6)[0] for i in range(counts[4])
    )
    transitions = tuple(
        (instant, offsets[index]) for instant, index in zip(times, indexes)
    )
    footer = ""
    if modern:
        remainder = data[end:]
        if not remainder.startswith(b"\n") or b"\n" not in remainder[1:]:
            raise ValueError("Missing TZif continuation footer")
        footer = remainder.split(b"\n", 2)[1].decode("ascii")
    last_offset = offsets[indexes[-1]] if indexes else offsets[-1]
    return transitions, _footer_rules(footer, last_offset)


@lru_cache(maxsize=128)
def _load_rules(key: str) -> tuple:
    # ZoneInfo validates keys too, but never allow an absolute/traversal path
    # through the filesystem or the packaged tzdata resource fallback.
    if (
        not key
        or any(part in ("", ".", "..") for part in key.split("/"))
        or "\\" in key
    ):
        raise ValueError("Invalid timezone key")
    # Use the pinned database consistently. Some Linux installations omit legacy
    # aliases from TZPATH, otherwise mixing their bundled slim TZif files with
    # system files containing explicit future transitions gives false mismatches.
    package = ".".join(["tzdata.zoneinfo", *key.split("/")[:-1]])
    try:
        data = resources.files(package).joinpath(key.split("/")[-1]).read_bytes()
    except (ImportError, FileNotFoundError):
        for root in TZPATH:
            candidate = Path(root).joinpath(key)
            if candidate.is_file():
                return _parse_rules(candidate.read_bytes())
        raise
    return _parse_rules(data)


def equivalent_timezones(first: str, second: str, reference: datetime) -> bool:
    """Ignore old historical/name differences, but retain every future offset change.

    TZif transitions plus the recurring footer avoid seasonal sampling, which
    could miss short DST periods. Unknown/unreadable rules fail conservatively.
    """
    if first == second:
        return True
    try:
        instant = reference.astimezone(timezone.utc)
        epoch = instant.timestamp()
        signatures = []
        for key in (first, second):
            current_offset = int(
                instant.astimezone(ZoneInfo(key)).utcoffset().total_seconds()
            )
            transitions, recurring = _load_rules(key)
            future = []
            previous = current_offset
            for timestamp, offset in transitions:
                if timestamp > epoch and offset != previous:
                    future.append((timestamp, offset))
                    previous = offset
            signatures.append((current_offset, tuple(future), recurring))
        return signatures[0] == signatures[1]
    except (OSError, ValueError, ImportError, LookupError, struct.error):
        return False


def attendance_timezone_context(
    device_zone: str, attendance_zone: str | None, instant: datetime
) -> dict:
    device_zone = device_zone.strip()
    mismatch = bool(device_zone and attendance_zone) and not equivalent_timezones(
        device_zone, attendance_zone, instant
    )
    return {
        "device_time_zone_name": device_zone or None,
        "attendance_time_zone_name": attendance_zone,
        "timezone_mismatch": mismatch,
        "timezone_warning_message": (
            (
                f"Your device timezone ({device_zone}) differs from the attendance timezone "
                f"({attendance_zone}). Attendance uses {attendance_zone}."
            )
            if mismatch
            else None
        ),
    }
