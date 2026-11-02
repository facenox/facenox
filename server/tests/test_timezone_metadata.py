from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from api.schemas import AttendanceMemberResponse
from attendance_time import capture_fields, event_time
from database.repository import AttendanceRepository
from services.attendance_service import AttendanceService


ZONES = [
    ("Pacific/Kiritimati", "Pacific/Honolulu"),
    ("Pacific/Pago_Pago", "Pacific/Auckland"),
    ("Australia/Sydney", "America/New_York"),
    ("Asia/Kathmandu", "Pacific/Chatham"),
    ("Australia/Lord_Howe", "Europe/London"),
    ("America/St_Johns", "Asia/Kolkata"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("device_zone,attendance_zone", ZONES)
async def test_rule_lookup_preserves_instants_across_device_and_attendance_zones(
    async_session_factory, device_zone, attendance_zone
):
    start = datetime(2026, 11, 3, 8, tzinfo=timezone.utc)
    with patch("time_utils.get_local_timezone", return_value=ZoneInfo(device_zone)):
        async with async_session_factory() as session:
            repo = AttendanceRepository(session)
            with patch(
                "database.repository.local_now",
                return_value=start.astimezone(ZoneInfo(device_zone)),
            ):
                await repo.create_group(
                    {
                        "id": "g",
                        "name": "Group",
                        "settings": {"class_start_time": "08:00"},
                    }
                )
                member = await repo.add_member(
                    {"person_id": "p", "group_id": "g", "name": "Member"}
                )
            with patch(
                "database.repository.local_now",
                return_value=(start + timedelta(minutes=1)).astimezone(
                    ZoneInfo(device_zone)
                ),
            ):
                await repo.update_group(
                    "g", {"settings": {"class_start_time": "09:00"}}
                )
            await session.flush()
            before = (start + timedelta(seconds=30)).astimezone(
                ZoneInfo(attendance_zone)
            )
            after = (start + timedelta(seconds=90)).astimezone(
                ZoneInfo(attendance_zone)
            )
            assert (
                await repo.get_effective_group_rule("g", before)
            ).class_start_time == "08:00"
            assert (
                await repo.get_effective_group_rule("g", after)
            ).class_start_time == "09:00"
            history = await repo.get_group_rules("g")
            assert (
                AttendanceService._select_effective_rule(
                    history, after
                ).class_start_time
                == "09:00"
            )
            # Neither stored enrollment nor schedule instants shift after an OS change.
            with patch("time_utils.get_local_timezone", return_value=ZoneInfo("UTC")):
                assert (
                    AttendanceMemberResponse.model_validate(member).joined_at == start
                )
                assert (
                    await repo.get_effective_group_rule("g", after)
                ).class_start_time == "09:00"


@pytest.mark.parametrize("device_zone,attendance_zone", ZONES)
def test_enrollment_day_uses_the_attendance_calendar(device_zone, attendance_zone):
    clock = datetime(2026, 11, 3, 23, 30, tzinfo=ZoneInfo(attendance_zone))
    joined = clock.astimezone(ZoneInfo(device_zone))
    member = SimpleNamespace(
        person_id="p", group_id="g", **capture_fields("joined_at", joined)
    )
    record = SimpleNamespace(
        person_id="p", group_id="g", id="raw", **capture_fields("timestamp", clock)
    )
    service = AttendanceService(SimpleNamespace())
    with patch("services.attendance_service.local_now", return_value=joined):
        sessions = service.compute_sessions_from_records(
            records=[record],
            members=[member],
            late_threshold_minutes=15,
            target_date="2026-11-03",
            attendance_timezone=attendance_zone,
            class_start_time="08:00",
        )
    assert len(sessions) == 1
    assert sessions[0]["status"] == "present"
    assert event_time(sessions[0], "check_in_time").astimezone(
        timezone.utc
    ) == clock.astimezone(timezone.utc)


def test_metadata_rules_legacy_rows_are_not_given_guessed_utc_provenance():
    member = SimpleNamespace(joined_at=datetime(2026, 1, 1), joined_at_utc=None)
    assert event_time(member, "joined_at").tzinfo is None
