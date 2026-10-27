"""Real SQLite/repository/service/API serialization tests, no camera or network."""

import tempfile
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo


class AttendancePipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="facenox-instant-test-")
        self.env = patch.dict("os.environ", {"FACENOX_DATA_DIR": self.temp.name})
        self.env.start()
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from database.models import (
            Base,
            AttendanceGroup,
            AttendanceMember,
            AttendanceSettings,
        )
        from database.repository import AttendanceRepository
        from services.attendance_service import AttendanceService

        self.engine = create_async_engine("sqlite+aiosqlite://")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.repo = AttendanceRepository(self.session)
        self.service = AttendanceService(self.repo)
        self.group = AttendanceGroup(
            id="g", name="G", track_checkout=True, min_checkout_delay_minutes=0
        )
        self.member = AttendanceMember(
            id="m",
            person_id="p",
            group_id="g",
            name="P",
            joined_at=datetime(2026, 1, 1),
        )
        self.settings = AttendanceSettings(
            attendance_timezone="America/New_York", attendance_cooldown_seconds=60
        )
        self.session.add_all([self.group, self.member, self.settings])
        await self.session.commit()

    async def asyncTearDown(self):
        await self.session.close()
        await self.engine.dispose()
        self.env.stop()
        self.temp.cleanup()

    def health(self, instant, device_zone="Asia/Manila"):
        return SimpleNamespace(
            source="test",
            current_time_utc=instant,
            current_time_local=instant.astimezone(ZoneInfo(device_zone)),
            time_zone_name=device_zone,
            os_clock_drift_seconds=0,
            os_clock_warning=None,
            online_verification_status="offline",
            online_reference_url=None,
            online_checked_at=None,
            online_reference_time=None,
            online_drift_seconds=None,
            warning_message=None,
        )

    async def test_capture_reload_checkout_recompute_export_after_travel(self):
        from api.schemas import (
            AttendanceEventCreate,
            AttendanceRecordResponse,
            AttendanceSessionResponse,
        )
        from attendance_time import event_time

        early = datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc)
        late = datetime(2026, 11, 1, 6, 30, tzinfo=timezone.utc)
        self.service.time_authority = SimpleNamespace(
            get_time_health=AsyncMock(
                side_effect=[self.health(early), self.health(late)]
            )
        )
        event = AttendanceEventCreate(person_id="p", confidence=1)
        check_in_response = await self.service.process_event(
            event, self.member, self.settings
        )
        self.assertTrue(check_in_response.processed)
        self.assertEqual(
            check_in_response.time_health.warning_message,
            "Your device timezone doesn't match the configured attendance timezone.",
        )
        self.assertTrue(check_in_response.time_health.timezone_mismatch)
        await self.session.commit()
        response = await self.service.process_event(event, self.member, self.settings)
        self.assertTrue(response.processed)
        self.assertEqual(response.event_type, "check_out")
        await self.session.commit()
        stored = await self.repo.get_session("p", "2026-11-01")
        await self.session.refresh(stored)
        self.assertEqual(stored.total_hours, 1)
        self.assertEqual(event_time(stored, "check_out_time").fold, 1)
        with patch(
            "time_utils.get_local_timezone", return_value=ZoneInfo("Australia/Sydney")
        ):
            exported = AttendanceSessionResponse.model_validate(
                stored, from_attributes=True
            )
            self.assertEqual(exported.check_in_time, early)
            self.assertEqual(exported.check_out_time, late)
            await self.service.recompute_sessions_for_date(
                "g", "2026-11-01", person_id="p"
            )
            await self.session.commit()
            await self.session.refresh(stored)
            self.assertEqual(stored.total_hours, 1)
            records = await self.repo.get_records(person_id="p")
            actual = sorted(
                AttendanceRecordResponse.model_validate(
                    r, from_attributes=True
                ).timestamp
                for r in records
            )
            self.assertEqual(actual, [early, late])

    async def test_timezone_mismatch_detects_zones_with_the_same_current_offset(self):
        from api.schemas import AttendanceEventCreate

        instant = datetime(2026, 1, 15, 12, tzinfo=timezone.utc)
        self.settings.attendance_timezone = "America/Denver"
        self.service.time_authority = SimpleNamespace(
            get_time_health=AsyncMock(
                return_value=self.health(instant, device_zone="America/Phoenix")
            )
        )

        response = await self.service.process_event(
            AttendanceEventCreate(person_id="p", confidence=1),
            self.member,
            self.settings,
        )

        self.assertEqual(
            instant.astimezone(ZoneInfo("America/Denver")).utcoffset(),
            instant.astimezone(ZoneInfo("America/Phoenix")).utcoffset(),
        )
        self.assertTrue(response.time_health.timezone_mismatch)

    async def test_matching_timezone_does_not_warn(self):
        from api.schemas import AttendanceEventCreate

        instant = datetime(2026, 1, 15, 12, tzinfo=timezone.utc)
        self.settings.attendance_timezone = "America/New_York"
        self.service.time_authority = SimpleNamespace(
            get_time_health=AsyncMock(
                return_value=self.health(instant, device_zone="America/New_York")
            )
        )

        response = await self.service.process_event(
            AttendanceEventCreate(person_id="p", confidence=1),
            self.member,
            self.settings,
        )

        self.assertFalse(response.time_health.timezone_mismatch)
        self.assertIsNone(response.time_health.warning_message)

    async def test_api_backup_metadata_and_manual_session_upsert(self):
        from api.schemas import AttendanceRecordResponse
        from attendance_time import restore_fields

        value = datetime(
            2026, 11, 1, 1, 30, tzinfo=ZoneInfo("America/New_York"), fold=1
        )
        record = await self.repo.add_record(
            {
                "id": "r",
                "person_id": "p",
                "group_id": "g",
                "timestamp": value,
                "confidence": 1,
            }
        )
        await self.session.commit()
        await self.session.refresh(record)
        exported = AttendanceRecordResponse.model_validate(record, from_attributes=True)
        decoded = AttendanceRecordResponse.model_validate_json(
            exported.model_dump_json()
        )
        restored = restore_fields(decoded, "timestamp")
        self.assertEqual(restored["timestamp_utc"], datetime(2026, 11, 1, 6, 30))
        self.assertEqual(restored["timestamp_timezone"], "America/New_York")

    async def test_reload_cooldown_uses_instants_when_wall_clock_goes_back(self):
        from datetime import timedelta

        zone = ZoneInfo("America/New_York")
        before = datetime(2026, 11, 1, 1, 59, 50, tzinfo=zone, fold=0)
        after = datetime(2026, 11, 1, 1, 0, 10, tzinfo=zone, fold=1)
        record = await self.repo.add_record(
            {
                "id": "cooldown",
                "person_id": "p",
                "group_id": "g",
                "timestamp": before,
                "confidence": 1,
            }
        )
        await self.session.commit()
        await self.session.refresh(record)
        found = await self.repo.get_recent_records_by_instant(
            "p",
            after.astimezone(timezone.utc) - timedelta(seconds=60),
            after,
        )
        self.assertEqual([row.id for row in found], ["cooldown"])

    async def test_legacy_recalculation_does_not_invent_utc_companions(self):
        await self.repo.add_record(
            {
                "id": "legacy",
                "person_id": "p",
                "group_id": "g",
                "timestamp": datetime(2026, 11, 1, 1, 30),
                "confidence": 1,
            }
        )
        await self.session.commit()
        await self.service.recompute_sessions_for_date("g", "2026-11-01", person_id="p")
        await self.session.commit()
        stored = await self.repo.get_session("p", "2026-11-01")
        self.assertIsNone(stored.check_in_time_utc)
        self.assertIsNone(stored.check_in_time_offset_seconds)


if __name__ == "__main__":
    unittest.main()
