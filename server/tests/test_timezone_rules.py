from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from timezone_rules import (
    _load_rules,
    attendance_timezone_context,
    equivalent_timezones,
)


NOW = datetime(2026, 11, 3, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    "first,second",
    [
        ("Asia/Singapore", "Asia/Manila"),
        ("UTC", "Etc/UTC"),
        ("GMT", "UTC"),
        ("Asia/Calcutta", "Asia/Kolkata"),
        ("US/Eastern", "America/New_York"),
    ],
)
def test_equivalent_current_and_future_rules_ignore_names(first, second):
    assert equivalent_timezones(first, second, NOW)
    assert equivalent_timezones(second, first, NOW)


def test_aliases_use_one_database_when_system_aliases_are_missing(tmp_path):
    canonical = tmp_path / "America" / "New_York"
    canonical.parent.mkdir()
    canonical.write_bytes(b"A different system timezone database")
    _load_rules.cache_clear()
    try:
        with patch("timezone_rules.TZPATH", (str(tmp_path),)):
            assert equivalent_timezones("US/Eastern", "America/New_York", NOW)
    finally:
        _load_rules.cache_clear()


@pytest.mark.parametrize(
    "first,second,instant",
    [
        (
            "America/Phoenix",
            "America/Denver",
            datetime(2026, 1, 15, tzinfo=timezone.utc),
        ),
        ("UTC", "Europe/London", datetime(2026, 1, 15, tzinfo=timezone.utc)),
        ("Asia/Kathmandu", "Asia/Kolkata", NOW),
        # Differences in historical clock rules are relevant at historical instants,
        # but must not warn about new scans when their current/future rules agree.
        ("Asia/Singapore", "Asia/Manila", datetime(1930, 1, 15, tzinfo=timezone.utc)),
    ],
)
def test_real_offset_or_future_dst_differences_warn(first, second, instant):
    assert not equivalent_timezones(first, second, instant)


def test_checks_transition_instants_instead_of_seasonal_samples():
    start = int(NOW.timestamp())
    # Both zones share today's offset and long-term rules, but one has a short
    # future offset change. A month-by-month or summer/winter check misses it.
    rules = [
        (((start + 3600, 3600), (start + 3660, 0)), ("fixed", 0)),
        ((), ("fixed", 0)),
    ]
    with patch("timezone_rules._load_rules", side_effect=rules):
        assert not equivalent_timezones("UTC", "Etc/UTC", NOW)


def test_unreadable_rules_do_not_silently_claim_equivalence():
    with patch("timezone_rules._load_rules", side_effect=OSError("Missing tzdata")):
        assert not equivalent_timezones("Asia/Manila", "Asia/Singapore", NOW)


def test_timezone_advisory_contains_both_names_but_does_not_claim_clock_drift():
    context = attendance_timezone_context("America/Phoenix", "America/Denver", NOW)
    assert context["timezone_mismatch"] is True
    assert "America/Phoenix" in context["timezone_warning_message"]
    assert "America/Denver" in context["timezone_warning_message"]
    assert "warning_message" not in context


def test_equivalent_windows_mapping_preserves_names_without_warning():
    context = attendance_timezone_context("Asia/Singapore", "Asia/Manila", NOW)
    assert context == {
        "device_time_zone_name": "Asia/Singapore",
        "attendance_time_zone_name": "Asia/Manila",
        "timezone_mismatch": False,
        "timezone_warning_message": None,
    }
