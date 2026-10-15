import pytest
from datetime import timedelta
from database.models import AttendanceGroup, AttendanceMember, AttendanceSettings
from database.repository import AttendanceRepository
from services.attendance_service import AttendanceService
from api.schemas import AttendanceEventCreate


@pytest.mark.asyncio
async def test_single_checkin_mode_prevents_duplicate_records(
    async_session_factory,
) -> None:
    """In single check-in mode (track_checkout=False), once marked present,
    subsequent events must not create duplicate records even after cooldown."""
    async with async_session_factory() as session:
        repo = AttendanceRepository(session)
        service = AttendanceService(repo)

        # 1. Setup group without check-out tracking
        group = AttendanceGroup(id="grp-rollcall", name="Class 1A", is_active=True)
        session.add(group)
        member = AttendanceMember(
            id="mem-1",
            person_id="person-juan",
            group_id="grp-rollcall",
            name="Juan Dela Cruz",
            is_active=True,
            is_deleted=False,
        )
        session.add(member)
        settings = AttendanceSettings(attendance_cooldown_seconds=10)
        session.add(settings)
        await session.commit()

        event_data = AttendanceEventCreate(
            person_id="person-juan",
            confidence=0.98,
            location="Room 101",
        )

        # First scan -> Success
        resp1 = await service.process_event(event_data, member, settings)
        assert resp1.processed is True
        assert resp1.event_type == "check_in"
        await session.commit()

        # Verify 1 record and 1 session created
        records = await repo.get_records(person_id="person-juan")
        assert len(records) == 1

        # Second scan (simulate next scan after cooldown) -> Skipped, no duplicate record added
        resp2 = await service.process_event(event_data, member, settings)
        assert resp2.processed is False
        assert "already checked in" in (resp2.error or "").lower()

        # Records in DB must remain exactly 1
        records_after = await repo.get_records(person_id="person-juan")
        assert len(records_after) == 1


@pytest.mark.asyncio
async def test_track_checkout_mode_enforces_lifecycle(async_session_factory) -> None:
    """In check-out tracking mode:
    1. First scan -> check_in
    2. Scan within cooldown -> blocked by cooldown
    3. Scan after cooldown -> check_out
    4. Scan after check_out -> blocked as session already closed."""
    async with async_session_factory() as session:
        repo = AttendanceRepository(session)
        service = AttendanceService(repo)

        group = AttendanceGroup(
            id="grp-shift",
            name="Engineering Shift",
            is_active=True,
            track_checkout=True,
        )
        session.add(group)
        member = AttendanceMember(
            id="mem-2",
            person_id="person-alice",
            group_id="grp-shift",
            name="Alice Smith",
            is_active=True,
            is_deleted=False,
        )
        session.add(member)
        settings = AttendanceSettings(attendance_cooldown_seconds=300)
        session.add(settings)
        await session.commit()

        event_data = AttendanceEventCreate(
            person_id="person-alice",
            confidence=0.99,
            location="Main Kiosk",
        )

        # 1. First scan -> check_in
        resp1 = await service.process_event(event_data, member, settings)
        assert resp1.processed is True
        assert resp1.event_type == "check_in"
        await session.commit()

        # 2. Immediate second scan -> blocked by time-out buffer
        resp_cooldown = await service.process_event(event_data, member, settings)
        assert resp_cooldown.processed is False
        assert (
            "time-out buffer active" in (resp_cooldown.error or "").lower()
            or "cooldown active" in (resp_cooldown.error or "").lower()
        )

        # 3. Simulate passage of buffer: update record and session check_in_time to 20 minutes ago
        records = await repo.get_records(person_id="person-alice")
        assert len(records) == 1
        records[0].timestamp = records[0].timestamp - timedelta(minutes=20)
        from time_utils import local_date_string
        from services.time_authority_service import get_time_authority

        today_str = local_date_string(get_time_authority().current_time_local())
        alice_session = await repo.get_session("person-alice", today_str)
        if alice_session and alice_session.check_in_time:
            alice_session.check_in_time = alice_session.check_in_time - timedelta(
                minutes=20
            )
        await session.commit()

        # Now scan after buffer has passed -> check_out
        resp_out = await service.process_event(event_data, member, settings)
        assert resp_out.processed is True
        assert resp_out.event_type == "check_out"
        await session.commit()

        records_total = await repo.get_records(person_id="person-alice")
        assert len(records_total) == 2

        # 4. Subsequent scan when both in and out are completed -> closed
        resp_closed = await service.process_event(event_data, member, settings)
        assert resp_closed.processed is False
        assert "already checked out" in (resp_closed.error or "").lower()
        records_final = await repo.get_records(person_id="person-alice")
        assert len(records_final) == 2
