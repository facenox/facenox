"""SQLite round-trip and travel regressions, runnable without camera services."""

import importlib.util
import sqlite3
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from attendance_time import (
    capture_fields,
    event_time,
    manual_event_time,
    normalize_session_times,
    restore_fields,
)
from time_utils import to_api_utc


class AttendanceInstantTests(unittest.TestCase):
    def roundtrip(self, value):
        fields = capture_fields("timestamp", value)
        with closing(sqlite3.connect(":memory:")) as db:
            db.execute(
                "CREATE TABLE events (timestamp TEXT, timestamp_utc TEXT, timestamp_timezone TEXT, timestamp_offset_seconds INTEGER)"
            )
            db.execute(
                "INSERT INTO events VALUES (?,?,?,?)",
                [
                    v.isoformat() if isinstance(v, datetime) else v
                    for v in fields.values()
                ],
            )
            stored = dict(zip(fields, db.execute("SELECT * FROM events").fetchone()))
        for field in ("timestamp", "timestamp_utc"):
            if stored[field]:
                stored[field] = datetime.fromisoformat(stored[field])
        return stored

    def test_both_dst_occurrences_survive_sqlite_and_travel(self):
        zone = ZoneInfo("America/New_York")
        instants = []
        for fold in (0, 1):
            row = self.roundtrip(datetime(2026, 11, 1, 1, 30, tzinfo=zone, fold=fold))
            with patch(
                "time_utils.get_local_timezone", return_value=ZoneInfo("Asia/Manila")
            ):
                instants.append(to_api_utc(event_time(row, "timestamp")))
        self.assertEqual((instants[1] - instants[0]).total_seconds(), 3600)

    def test_worldwide_roundtrip(self):
        for name in (
            "Australia/Lord_Howe",
            "Asia/Kathmandu",
            "Pacific/Chatham",
            "Pacific/Kiritimati",
            "America/Adak",
            "Europe/London",
        ):
            for month in (1, 7, 10):
                with self.subTest(zone=name, month=month):
                    value = datetime(2026, month, 15, 9, tzinfo=ZoneInfo(name))
                    row = self.roundtrip(value)
                    self.assertEqual(
                        to_api_utc(event_time(row, "timestamp")),
                        value.astimezone(timezone.utc),
                    )
                    self.assertEqual(row["timestamp_timezone"], name)

    def test_legacy_not_promoted_and_stale_metadata_not_used(self):
        value = datetime(2026, 10, 20, 9)
        fields = capture_fields("timestamp", value)
        self.assertIsNone(fields["timestamp_utc"])
        row = self.roundtrip(value.replace(tzinfo=ZoneInfo("Asia/Manila")))
        row["timestamp"] = datetime(2026, 10, 20, 10)
        self.assertEqual(event_time(row, "timestamp"), row["timestamp"])

    def test_manual_gaps_folds_and_offsets(self):
        with patch(
            "attendance_time.get_local_timezone",
            return_value=ZoneInfo("America/New_York"),
        ):
            for value in (datetime(2026, 3, 8, 2, 30), datetime(2026, 11, 1, 1, 30)):
                with self.assertRaises(ValueError):
                    manual_event_time(value)
            result = manual_event_time(
                datetime.fromisoformat("2026-11-01T01:30:00-05:00")
            )
            self.assertEqual(result.fold, 1)
        self.assertEqual(
            manual_event_time(datetime(2026, 10, 20, 9), "Asia/Kathmandu")
            .utcoffset()
            .total_seconds(),
            20700,
        )

    def test_session_elapsed_and_legacy_preservation(self):
        zone = ZoneInfo("Australia/Sydney")
        data = normalize_session_times(
            {
                "check_in_time": datetime(2026, 10, 4, 0, tzinfo=zone),
                "check_out_time": datetime(2026, 10, 4, 4, tzinfo=zone),
            }
        )
        self.assertEqual(data["total_hours"], 3)
        self.assertEqual(normalize_session_times(data), data)
        legacy = normalize_session_times({"check_in_time": datetime(2026, 10, 4, 0)})
        self.assertIsNone(legacy["check_in_time_utc"])
        with self.assertRaises(ValueError):
            normalize_session_times(
                {
                    "check_in_time": datetime(2026, 10, 4, 4, tzinfo=zone),
                    "check_out_time": datetime(2026, 10, 4, 0, tzinfo=zone),
                }
            )

    def test_backup_keeps_original_context(self):
        original = datetime(
            2026, 11, 1, 1, 30, tzinfo=ZoneInfo("America/New_York"), fold=1
        )
        restored = restore_fields(
            {
                "timestamp": original.astimezone(timezone.utc),
                "timestamp_timezone": "America/New_York",
                "timestamp_offset_seconds": -18000,
            },
            "timestamp",
        )
        self.assertEqual(event_time(restored, "timestamp").fold, 1)
        self.assertEqual(restored["timestamp"], original.replace(tzinfo=None))

    def test_additive_migration_does_not_backfill_legacy(self):
        import sqlalchemy as sa
        from alembic.migration import MigrationContext
        from alembic.operations import Operations

        path = (
            Path(__file__).parents[1]
            / "migrations/versions/j4k5l6m7n8o9_attendance_instants.py"
        )
        spec = importlib.util.spec_from_file_location("attendance_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        engine = sa.create_engine("sqlite://")
        with engine.begin() as conn:
            conn.exec_driver_sql("CREATE TABLE attendance_records (timestamp DATETIME)")
            conn.exec_driver_sql(
                "CREATE TABLE attendance_sessions (check_in_time DATETIME, check_out_time DATETIME)"
            )
            conn.exec_driver_sql("CREATE TABLE attendance_settings (id INTEGER)")
            conn.exec_driver_sql(
                "INSERT INTO attendance_records VALUES ('2026-11-01 01:30:00')"
            )
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
            row = conn.exec_driver_sql(
                "SELECT timestamp, timestamp_utc FROM attendance_records"
            ).one()
            self.assertEqual(tuple(row), ("2026-11-01 01:30:00", None))
            # An older writer can still insert its original columns.
            conn.exec_driver_sql(
                "INSERT INTO attendance_records(timestamp) VALUES ('2026-11-02 09:00:00')"
            )
            self.assertIsNotNone(
                conn.exec_driver_sql(
                    "SELECT modified_at_utc FROM attendance_records WHERE timestamp='2026-11-02 09:00:00'"
                ).scalar()
            )
            conn.exec_driver_sql(
                "UPDATE attendance_records SET timestamp='2026-11-01 01:31:00' WHERE timestamp='2026-11-01 01:30:00'"
            )
            changed = conn.exec_driver_sql(
                "SELECT timestamp_utc, modified_at_utc FROM attendance_records WHERE timestamp='2026-11-01 01:31:00'"
            ).one()
            self.assertIsNone(changed[0])
            self.assertIsNotNone(changed[1])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
