"""Focused worldwide timestamp regressions; no database or camera required."""

import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

import tzlocal
import time_utils


class TimezoneTests(unittest.TestCase):
    def test_day_bounds_include_the_final_fractional_second(self):
        start, end = time_utils.local_day_bounds("2026-10-20")
        self.assertEqual(start, datetime(2026, 10, 20))
        self.assertEqual(end, datetime(2026, 10, 20, 23, 59, 59, 999999))

    def test_detected_timezone_keeps_historical_rules(self):
        try:
            with patch.dict(os.environ, {"TZ": "Australia/Sydney"}):
                tzlocal.reload_localzone()
                self.assertIsInstance(time_utils.get_local_timezone(), ZoneInfo)
                winter = time_utils.to_api_utc(datetime(2026, 7, 15, 9))
                summer = time_utils.to_api_utc(datetime(2026, 1, 15, 9))
                self.assertEqual(winter, datetime(2026, 7, 14, 23, tzinfo=timezone.utc))
                self.assertEqual(summer, datetime(2026, 1, 14, 22, tzinfo=timezone.utc))
        finally:
            tzlocal.reload_localzone()

    def test_worldwide_historical_conversions(self):
        for zone in [
            "Asia/Manila",
            "Australia/Sydney",
            "Australia/Lord_Howe",
            "America/New_York",
            "Europe/London",
            "Asia/Kathmandu",
            "Pacific/Kiritimati",
            "America/Adak",
            "Pacific/Chatham",
        ]:
            for month in [1, 7, 10]:
                with self.subTest(zone=zone, month=month):
                    local = datetime(2026, month, 15, 9)
                    rules = ZoneInfo(zone)
                    with patch("time_utils.get_local_timezone", return_value=rules):
                        self.assertEqual(
                            time_utils.to_api_utc(local),
                            local.replace(tzinfo=rules).astimezone(timezone.utc),
                        )

    def test_aware_instant_is_not_reinterpreted(self):
        instant = datetime(2026, 7, 15, 0, tzinfo=timezone.utc)
        with patch(
            "time_utils.get_local_timezone", return_value=ZoneInfo("Australia/Sydney")
        ):
            self.assertEqual(time_utils.to_api_utc(instant), instant)

    def test_in_memory_fold_preserves_both_repeated_instants(self):
        rules = ZoneInfo("America/New_York")
        with patch("time_utils.get_local_timezone", return_value=rules):
            early = time_utils.to_api_utc(datetime(2026, 11, 1, 1, 30, fold=0))
            late = time_utils.to_api_utc(datetime(2026, 11, 1, 1, 30, fold=1))
            self.assertEqual((late - early).total_seconds(), 3600)

    def test_elapsed_hours_follow_instants_through_clock_changes(self):
        cases = [
            ("Australia/Sydney", datetime(2026, 10, 4, 0), datetime(2026, 10, 4, 4), 3),
            ("Australia/Sydney", datetime(2026, 4, 5, 0), datetime(2026, 4, 5, 4), 5),
            (
                "Australia/Lord_Howe",
                datetime(2026, 10, 4, 0),
                datetime(2026, 10, 4, 4),
                3.5,
            ),
            ("Asia/Kathmandu", datetime(2026, 10, 4, 0), datetime(2026, 10, 4, 4), 4),
        ]
        for zone, start, end, hours in cases:
            with self.subTest(zone=zone, start=start):
                with patch(
                    "time_utils.get_local_timezone", return_value=ZoneInfo(zone)
                ):
                    self.assertEqual(
                        time_utils.elapsed_seconds(start, end), hours * 3600
                    )


if __name__ == "__main__":
    unittest.main()
