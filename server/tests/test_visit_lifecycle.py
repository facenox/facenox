from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from api.schemas import AttendanceEventCreate
from database.models import (
    AttendanceGroup,
    AttendanceGroupRule,
    AttendanceMember,
    AttendanceSettings,
)
from database.repository import AttendanceRepository
from services.attendance_service import AttendanceService


async def create_flow(session, mode="visits"):
    group = AttendanceGroup(
        id="g",
        name="Group",
        attendance_mode=mode,
        track_checkout=True,
        class_start_time="22:00" if mode == "work_hours" else "08:00",
        class_end_time="06:00" if mode == "work_hours" else None,
        late_threshold_enabled=True,
        late_threshold_minutes=15,
        min_checkout_delay_minutes=0,
    )
    member = AttendanceMember(
        id="m",
        person_id="p",
        group_id="g",
        name="Member",
        joined_at=datetime(2026, 1, 1),
    )
    rule = AttendanceGroupRule(
        id="rule",
        group_id="g",
        effective_from=datetime(2026, 1, 1),
        attendance_mode=mode,
        track_checkout=True,
        min_checkout_delay_minutes=0,
        class_start_time=group.class_start_time,
        class_end_time=group.class_end_time,
        late_threshold_enabled=True,
        late_threshold_minutes=15,
    )
    settings = AttendanceSettings(
        attendance_timezone="UTC", attendance_cooldown_seconds=60
    )
    session.add_all([group, member, rule, settings])
    await session.commit()
    repo = AttendanceRepository(session)
    return repo, AttendanceService(repo), member, settings


async def scan(service, member, settings, value, behavior=None):
    instant = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    health = SimpleNamespace(
        source="test",
        current_time_utc=instant,
        current_time_local=instant,
        time_zone_name="UTC",
        os_clock_drift_seconds=0,
        os_clock_warning=None,
        online_verification_status="offline",
        online_reference_url=None,
        online_checked_at=None,
        online_reference_time=None,
        online_drift_seconds=None,
        warning_message=None,
    )
    service.time_authority = SimpleNamespace(
        get_time_health=AsyncMock(return_value=health)
    )
    event = AttendanceEventCreate(person_id="p", confidence=1, scan_behavior=behavior)
    result = await service.process_event(event, member, settings)
    await service.repo.session.commit()
    return result


@pytest.mark.asyncio
async def test_second_visit_checkout_preserves_both_visits_and_first_arrival_lateness(
    async_session_factory,
):
    async with async_session_factory() as session:
        _, service, member, settings = await create_flow(session)
        for time in ("08:30", "09:00", "14:00", "15:00"):
            assert (
                await scan(service, member, settings, f"2026-11-01T{time}:00")
            ).processed
        async with async_session_factory() as reader:
            visits = await AttendanceRepository(reader).get_sessions(person_id="p")
            assert [visit.visit_number for visit in visits] == [1, 2]
            assert [
                (visit.check_in_time.hour, visit.check_out_time.hour)
                for visit in visits
            ] == [(8, 9), (14, 15)]
            assert [visit.is_late for visit in visits] == [True, False]
            stats = service.calculate_group_stats([member], visits)
            assert stats["present_today"] == 1
            assert stats["late_today"] == 1
        rebuilt = await service.recompute_sessions_for_date("g", "2026-11-01")
        assert [row["is_late"] for row in rebuilt] == [True, False]


@pytest.mark.asyncio
async def test_exit_only_does_not_create_an_arrival_after_a_closed_visit(
    async_session_factory,
):
    async with async_session_factory() as session:
        repo, service, member, settings = await create_flow(session)
        await scan(service, member, settings, "2026-11-01T08:00:00")
        await scan(service, member, settings, "2026-11-01T09:00:00")
        result = await scan(
            service, member, settings, "2026-11-01T10:00:00", "exit_only"
        )
        assert not result.processed
        assert "No open session" in result.error
        assert len(await repo.get_records(person_id="p")) == 2
        assert len(await repo.get_sessions(person_id="p")) == 1


@pytest.mark.asyncio
async def test_voiding_the_last_arrival_removes_its_derived_visit(
    async_session_factory,
):
    async with async_session_factory() as session:
        repo, service, member, settings = await create_flow(session)
        for time in ("08:00", "09:00", "14:00"):
            await scan(service, member, settings, f"2026-11-01T{time}:00")
        records = await repo.get_records(person_id="p")
        await repo.void_record(
            records[0].id, voided_by="test", void_reason="Wrong scan"
        )
        await service.recompute_sessions_for_date("g", "2026-11-01")
        await session.commit()
        async with async_session_factory() as reader:
            visits = await AttendanceRepository(reader).get_sessions(person_id="p")
            assert [visit.visit_number for visit in visits] == [1]
            assert visits[0].check_out_time.hour == 9
            from database.models import AttendanceSessionDeletion
            from sqlalchemy import select

            deleted = (
                (await reader.execute(select(AttendanceSessionDeletion)))
                .scalars()
                .all()
            )
            assert len(deleted) == 1
            assert deleted[0].person_id == "p"
            assert deleted[0].date == "2026-11-01"


@pytest.mark.asyncio
@pytest.mark.parametrize("with_note", [False, True])
async def test_rebuild_keeps_a_manually_corrected_later_visit(
    async_session_factory, with_note
):
    async with async_session_factory() as session:
        repo, service, member, settings = await create_flow(session)
        for time in ("08:00", "09:00", "14:00"):
            await scan(service, member, settings, f"2026-11-01T{time}:00")
        corrected = await repo.get_session("p", "2026-11-01", visit_number=2)
        corrected.notes = "Approved manual arrival" if with_note else None
        corrected.is_manual_override = not with_note
        records = await repo.get_records(person_id="p")
        await repo.void_record(
            records[0].id, voided_by="test", void_reason="Wrong scan"
        )
        await service.recompute_sessions_for_date("g", "2026-11-01")
        await session.commit()
        async with async_session_factory() as reader:
            visits = await AttendanceRepository(reader).get_sessions(person_id="p")
            assert [visit.visit_number for visit in visits] == [1, 2]
            assert visits[1].notes == ("Approved manual arrival" if with_note else None)
            assert visits[1].is_manual_override is True
            assert visits[1].check_in_time.hour == 14


@pytest.mark.asyncio
@pytest.mark.parametrize("behavior", [None, "exit_only"])
async def test_overnight_departure_and_rebuild_keep_the_arrival_date(
    async_session_factory, behavior
):
    async with async_session_factory() as session:
        _, service, member, settings = await create_flow(session, "work_hours")
        await scan(service, member, settings, "2026-11-01T22:00:00")
        result = await scan(service, member, settings, "2026-11-02T06:30:00", behavior)
        assert result.processed and result.event_type == "check_out"
        async with async_session_factory() as reader:
            visits = await AttendanceRepository(reader).get_sessions(person_id="p")
            assert len(visits) == 1
            assert visits[0].date == "2026-11-01"
            assert visits[0].check_out_time == datetime(2026, 11, 2, 6, 30)
            assert visits[0].total_hours == 8.5
        rebuilt = await service.recompute_sessions_for_date("g", "2026-11-01")
        assert rebuilt[0]["check_out_time"].day == 2
        assert rebuilt[0]["total_hours"] == 8.5
        next_day = await service.recompute_sessions_for_date("g", "2026-11-02")
        assert next_day[0]["status"] == "absent"


def test_stats_combine_visits_without_counting_a_member_twice():
    service = AttendanceService(repo=None)
    members = [SimpleNamespace(person_id="p")]
    sessions = [
        {"person_id": "p", "status": "present", "is_late": True},
        {"person_id": "p", "status": "absent", "is_late": False},
    ]
    for visits in (sessions, list(reversed(sessions))):
        assert service.calculate_group_stats(members, visits) == {
            "total_members": 1,
            "present_today": 1,
            "absent_today": 0,
            "late_today": 1,
        }
