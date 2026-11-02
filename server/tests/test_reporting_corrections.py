import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from test_departure_schedule import departure_data as departure_data

from attendance_time import capture_fields
from database.models import AttendanceSession, AttendanceGroupRule
from services.attendance_service import AttendanceService


def endpoint(member):
    return f"/attendance/sessions/{member['person_id']}/2026-11-01"


def test_retired_sessions_are_exported_as_durable_delta_deletions(departure_data):
    from database.models import AttendanceSessionDeletion
    from database.repository import AttendanceRepository

    client, factory, headers, _, member = departure_data

    async def retire():
        async with factory() as session:
            target = await session.get(AttendanceSession, "departure-session")
            await AttendanceRepository(session).retire_session(target)
            await session.flush()
            tombstone = await session.get(AttendanceSessionDeletion, "departure-session")
            tombstone.deleted_at_utc = datetime(2026, 11, 3, 1)
            await session.commit()

    asyncio.run(retire())
    for since, expected in (("2026-11-03T00:00:00Z", 1), ("2026-11-03T02:00:00Z", 0)):
        response = client.post("/attendance/export", params={"since": since}, headers=headers)
        assert response.status_code == 200, response.text
        assert len(response.json()["deleted_sessions"]) == expected
        assert all(row["id"] != "departure-session" for row in response.json()["sessions"])
        if expected:
            assert response.json()["deleted_sessions"][0]["person_id"] == member["person_id"]


def test_marking_absent_clears_attendance_times(departure_data):
    client, _, headers, _, member = departure_data
    response = client.put(
        endpoint(member),
        headers=headers,
        json={
            "status": "absent",
            "notes": "Excused absence",
            "is_late": False,
            "late_minutes": 0,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["check_in_time"] is None
    assert body["check_out_time"] is None
    assert body["total_hours"] is None


def test_clearing_timeout_with_explicit_null_is_supported(departure_data):
    client, _, headers, _, member = departure_data
    response = client.put(
        endpoint(member),
        headers=headers,
        json={"check_out_time": None, "notes": "Remove erroneous time-out"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["check_out_time"] is None
    assert response.json()["total_hours"] is None
    assert response.json()["check_out_time_timezone"] is None
    assert response.json()["check_out_time_offset_seconds"] is None


def test_manual_visit_survives_a_report_recompute(departure_data):
    from database.models import (
        AttendanceSession,
        AttendanceMember,
        AttendanceGroup,
        AttendanceGroupRule,
    )

    client, factory, headers, group, member = departure_data

    async def seed():
        async with factory() as session:
            existing = await session.get(AttendanceSession, "departure-session")
            group_model = await session.get(AttendanceGroup, group["id"])
            group_model.attendance_mode = "visits"
            rule = await session.get(AttendanceGroupRule, existing.applied_rule_id)
            rule.attendance_mode = "visits"
            existing.notes = "Corrected first visit"
            existing.check_in_time = datetime(2026, 11, 1, 8)
            existing.check_in_time_offset_seconds = 0
            existing.check_out_time_offset_seconds = 0
            session.add(
                AttendanceSession(
                    id="second-visit",
                    person_id=member["person_id"],
                    member_id=member["id"],
                    group_id=group["id"],
                    applied_rule_id=existing.applied_rule_id,
                    date="2026-11-01",
                    visit_number=2,
                    notes="Corrected second visit",
                    check_in_time=datetime(2026, 11, 1, 14),
                    check_in_time_utc=datetime(2026, 11, 1, 14),
                    check_in_time_timezone="UTC",
                    check_in_time_offset_seconds=0,
                    check_out_time=datetime(2026, 11, 1, 15),
                    check_out_time_utc=datetime(2026, 11, 1, 15),
                    check_out_time_timezone="UTC",
                    check_out_time_offset_seconds=0,
                    status="present",
                    is_late=False,
                )
            )
            session.add(
                AttendanceMember(
                    id="bob",
                    person_id="bob",
                    name="Bob",
                    group_id=group["id"],
                    joined_at=datetime(2026, 1, 1),
                )
            )
            session.add(
                AttendanceMember(
                    id="carol",
                    person_id="carol",
                    name="Carol",
                    group_id=group["id"],
                    joined_at=datetime(2026, 1, 1),
                )
            )
            await session.commit()

    asyncio.run(seed())
    before = client.get(endpoint(member), headers=headers).json()
    response = client.get(
        "/attendance/sessions",
        headers=headers,
        params={
            "group_id": group["id"],
            "start_date": "2026-11-01",
            "end_date": "2026-11-01",
        },
    )
    assert response.status_code == 200, response.text
    after = client.get(endpoint(member), headers=headers).json()
    assert after["notes"] == before["notes"]
    assert after["check_in_time"] == before["check_in_time"]


def test_person_filter_survives_a_report_recompute(departure_data):
    from database.models import AttendanceMember

    client, factory, headers, group, member = departure_data

    async def seed():
        async with factory() as session:
            session.add(
                AttendanceMember(
                    id="bob",
                    person_id="bob",
                    name="Bob",
                    group_id=group["id"],
                    joined_at=datetime(2026, 1, 1),
                )
            )
            await session.commit()

    asyncio.run(seed())
    response = client.get(
        "/attendance/sessions",
        headers=headers,
        params={
            "group_id": group["id"],
            "person_id": member["person_id"],
            "start_date": "2026-11-01",
            "end_date": "2026-11-01",
        },
    )
    assert response.status_code == 200, response.text
    assert {s["person_id"] for s in response.json()} == {member["person_id"]}


def test_person_filtered_recompute_preserves_other_members_manual_sessions(
    departure_data,
):
    from database.models import AttendanceMember

    client, factory, headers, group, member = departure_data

    async def seed():
        async with factory() as session:
            session.add_all(
                [
                    AttendanceMember(
                        id=name,
                        person_id=name,
                        name=name,
                        group_id=group["id"],
                        joined_at=datetime(2026, 1, 1),
                    )
                    for name in ("bob", "carol")
                ]
            )
            session.add(
                AttendanceSession(
                    id="bob-manual",
                    person_id="bob",
                    member_id="bob",
                    group_id=group["id"],
                    date="2026-11-01",
                    status="present",
                    is_late=False,
                    check_in_time=datetime(2026, 11, 1, 9),
                    notes="Bob's corrected attendance",
                )
            )
            await session.commit()

    asyncio.run(seed())
    response = client.get(
        "/attendance/sessions",
        headers=headers,
        params={
            "group_id": group["id"],
            "person_id": member["person_id"],
            "start_date": "2026-11-01",
            "end_date": "2026-11-01",
        },
    )
    assert response.status_code == 200, response.text
    response = client.get("/attendance/sessions/bob/2026-11-01", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "present"
    assert response.json()["notes"] == "Bob's corrected attendance"
    assert response.json()["check_in_time"] is not None


def test_time_changes_recalculate_duration_control(departure_data):
    client, _, headers, _, member = departure_data
    response = client.put(
        endpoint(member),
        headers=headers,
        json={
            "check_in_time": "2026-11-01T09:00:00Z",
            "check_out_time": "2026-11-01T17:00:00Z",
            "notes": "Reviewed",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["total_hours"] == 8


def test_checkout_before_checkin_is_rejected_control(departure_data):
    client, _, headers, _, member = departure_data
    response = client.put(
        endpoint(member),
        headers=headers,
        json={
            "check_in_time": "2026-11-01T22:00:00Z",
            "check_out_time": "2026-11-01T06:00:00Z",
            "notes": "Reviewed overnight",
        },
    )
    assert response.status_code == 422, response.text


def test_corrected_late_flag_is_recomputed_by_the_api(departure_data):
    from database.models import AttendanceSession, AttendanceGroupRule

    client, factory, headers, _, member = departure_data

    async def seed_late():
        async with factory() as session:
            target = await session.get(AttendanceSession, "departure-session")
            target.check_in_time = target.check_in_time_utc = datetime(2026, 11, 1, 9)
            target.check_in_time_offset_seconds = 0
            target.is_late, target.late_minutes = True, 60
            rule = await session.get(AttendanceGroupRule, target.applied_rule_id)
            rule.late_threshold_enabled, rule.late_threshold_minutes = True, 0
            await session.commit()

    asyncio.run(seed_late())
    response = client.put(
        endpoint(member),
        headers=headers,
        json={
            "status": "present",
            "check_in_time": "2026-11-01T08:00:00Z",
            "check_out_time": "2026-11-01T17:00:00Z",
            "is_late": True,
            "late_minutes": 60,
            "notes": "Corrected late scan back to scheduled start",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_late"] is False


def seed_captured_times(factory, start, end):
    async def seed():
        async with factory() as session:
            target = await session.get(AttendanceSession, "departure-session")
            for field, value in (("check_in_time", start), ("check_out_time", end)):
                for key, captured in capture_fields(field, value).items():
                    setattr(target, key, captured)
            await session.commit()

    asyncio.run(seed())


def test_voiding_an_overnight_checkout_reopens_the_previous_days_session(
    departure_data,
):
    from database.models import AttendanceMember
    from database.repository import AttendanceRepository

    client, factory, headers, group, member = departure_data

    async def seed():
        async with factory() as session:
            target = await session.get(AttendanceSession, "departure-session")
            rule = await session.get(AttendanceGroupRule, target.applied_rule_id)
            rule.effective_from = datetime(2026, 1, 1)
            rule.class_start_time, rule.class_end_time = "22:00", "06:00"
            enrolled = await session.get(AttendanceMember, member["id"])
            enrolled.joined_at = datetime(2026, 1, 1)
            repo = AttendanceRepository(session)
            for record_id, value, event_type in (
                (
                    "night-in",
                    datetime(2026, 11, 1, 22, tzinfo=timezone.utc),
                    "check_in",
                ),
                (
                    "night-out",
                    datetime(2026, 11, 2, 6, tzinfo=timezone.utc),
                    "check_out",
                ),
            ):
                await repo.add_record(
                    {
                        "id": record_id,
                        "person_id": member["person_id"],
                        "group_id": group["id"],
                        "timestamp": value,
                        "confidence": 1,
                        "event_type": event_type,
                    }
                )
            await session.commit()
            await AttendanceService(repo).recompute_sessions_for_date(
                group["id"], "2026-11-01"
            )
            await session.commit()

    asyncio.run(seed())
    response = client.get(endpoint(member), headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["check_out_time"] is not None
    response = client.post(
        "/attendance/records/night-out/void",
        headers=headers,
        json={"reason": "Erroneous overnight checkout"},
    )
    assert response.status_code == 200, response.text
    response = client.get(endpoint(member), headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["check_out_time"] is None
    assert response.json()["total_hours"] is None


def test_notes_only_save_preserves_captured_instants_and_metadata(departure_data):
    client, factory, headers, _, member = departure_data
    zone = ZoneInfo("America/New_York")
    seed_captured_times(
        factory,
        datetime(2026, 11, 1, 8, 0, 27, tzinfo=zone),
        datetime(2026, 11, 1, 17, 0, 48, tzinfo=zone),
    )
    before = client.get(endpoint(member), headers=headers).json()
    response = client.put(
        "/attendance/settings",
        headers=headers,
        json={"attendance_timezone": "Asia/Manila"},
    )
    assert response.status_code == 200, response.text
    response = client.put(
        endpoint(member),
        headers=headers,
        json={"notes": "Reviewed after relocation"},
    )
    assert response.status_code == 200, response.text
    for key in (
        "check_in_time",
        "check_out_time",
        "check_in_time_timezone",
        "check_out_time_timezone",
        "check_in_time_offset_seconds",
        "check_out_time_offset_seconds",
        "is_late",
        "late_minutes",
    ):
        assert response.json()[key] == before[key], key


def test_time_edit_keeps_the_captured_zone_after_attendance_zone_changes(
    departure_data,
):
    client, factory, headers, _, member = departure_data
    zone = ZoneInfo("America/New_York")
    seed_captured_times(
        factory,
        datetime(2026, 11, 1, 8, tzinfo=zone),
        datetime(2026, 11, 1, 17, tzinfo=zone),
    )
    response = client.put(
        "/attendance/settings",
        headers=headers,
        json={"attendance_timezone": "Asia/Manila"},
    )
    assert response.status_code == 200, response.text
    response = client.put(
        endpoint(member),
        headers=headers,
        json={"check_in_time": "2026-11-01T14:00:00Z", "notes": "Corrected to 9 AM"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["check_in_time_timezone"] == "America/New_York"
    assert body["check_in_time_offset_seconds"] == -18000
    assert datetime.fromisoformat(
        body["check_in_time"].replace("Z", "+00:00")
    ) == datetime(2026, 11, 1, 14, tzinfo=timezone.utc)
    assert body["total_hours"] == 8


@pytest.mark.parametrize("original_status", ["absent", "present"])
def test_undo_can_restore_an_absent_or_open_session(departure_data, original_status):
    client, factory, headers, _, member = departure_data
    seed_captured_times(
        factory,
        datetime(2026, 11, 1, 8, tzinfo=ZoneInfo("UTC")),
        datetime(2026, 11, 1, 17, tzinfo=ZoneInfo("UTC")),
    )
    response = client.put(
        endpoint(member),
        headers=headers,
        json={
            "status": original_status,
            "check_in_time": None
            if original_status == "absent"
            else "2026-11-01T08:00:00Z",
            "check_out_time": None,
            "notes": "Reverted correction",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == original_status
    assert body["check_out_time"] is None
    assert body["check_out_time_timezone"] is None
    assert body["check_out_time_offset_seconds"] is None
    assert body["total_hours"] is None
    if original_status == "absent":
        assert body["check_in_time"] is None
        assert body["check_in_time_timezone"] is None
        assert body["is_late"] is False
    else:
        assert body["check_in_time"] is not None


def test_lateness_edit_uses_recorded_rule_not_todays_rule(departure_data):
    client, factory, headers, group, member = departure_data
    seed_captured_times(
        factory,
        datetime(2026, 11, 1, 8, tzinfo=ZoneInfo("UTC")),
        datetime(2026, 11, 1, 17, tzinfo=ZoneInfo("UTC")),
    )

    async def enable_recorded_lateness():
        async with factory() as session:
            target = await session.get(AttendanceSession, "departure-session")
            rule = await session.get(AttendanceGroupRule, target.applied_rule_id)
            rule.late_threshold_enabled = True
            rule.late_threshold_minutes = 15
            await session.commit()

    asyncio.run(enable_recorded_lateness())
    response = client.put(
        f"/attendance/groups/{group['id']}",
        headers=headers,
        json={
            "settings": {"late_threshold_enabled": False, "class_start_time": "12:00"}
        },
    )
    assert response.status_code == 200, response.text
    response = client.put(
        endpoint(member),
        headers=headers,
        json={
            "check_in_time": "2026-11-01T09:00:00Z",
            "is_late": False,
            "notes": "Reviewed",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_late"] is True
    assert response.json()["late_minutes"] == 60


@pytest.mark.parametrize("existing_absence", [True, False])
@pytest.mark.parametrize("has_historical_rule", [True, False])
def test_manual_arrival_uses_only_a_known_historical_rule(
    departure_data, existing_absence, has_historical_rule
):
    client, factory, headers, _, member = departure_data

    async def seed():
        async with factory() as session:
            target = await session.get(AttendanceSession, "departure-session")
            rule = await session.get(AttendanceGroupRule, target.applied_rule_id)
            rule.effective_from = datetime(2026, 11, 1 if has_historical_rule else 2)
            rule.late_threshold_enabled = True
            rule.late_threshold_minutes = 15
            if existing_absence:
                target.applied_rule_id = None
                target.status = "absent"
                for field in ("check_in_time", "check_out_time"):
                    for key, value in capture_fields(field, None).items():
                        setattr(target, key, value)
            else:
                await session.delete(target)
            await session.commit()

    asyncio.run(seed())
    response = client.put(
        endpoint(member),
        headers=headers,
        json={
            "status": "present",
            "check_in_time": "2026-11-01T09:00:00Z",
            "notes": "Forgot to scan",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_late"] is has_historical_rule
    assert response.json()["late_minutes"] == (60 if has_historical_rule else None)
    assert (response.json()["applied_schedule"] is not None) is has_historical_rule


@pytest.mark.parametrize("manual_visit", [1, 2])
def test_manual_and_computed_visits_do_not_overwrite_each_other(manual_visit):
    day = datetime(2026, 11, 1, tzinfo=ZoneInfo("UTC"))
    member = SimpleNamespace(
        person_id="alice", group_id="g", joined_at=datetime(2026, 1, 1)
    )
    existing = [
        SimpleNamespace(
            id=f"visit-{number}",
            person_id="alice",
            group_id="g",
            applied_rule_id="rule",
            visit_number=number,
            check_in_time=day.replace(hour=7 + number),
            check_out_time=day.replace(hour=8 + number),
            total_hours=1,
            status="present",
            is_late=False,
            late_minutes=None,
            notes="Manual correction" if number == manual_visit else None,
        )
        for number in (1, 2)
    ]
    records = [
        SimpleNamespace(person_id="alice", timestamp=day.replace(hour=hour))
        for hour in (8, 9, 14, 15)
    ]
    result = AttendanceService(repo=None).compute_sessions_from_records(
        records=records,
        members=[member],
        late_threshold_minutes=0,
        target_date="2026-11-01",
        attendance_mode="visits",
        existing_sessions=existing,
    )
    visits = {row["visit_number"]: row for row in result}
    assert set(visits) == {1, 2}
    for number in (1, 2):
        assert visits[number]["id"] == f"visit-{number}"
        if number == manual_visit:
            assert visits[number]["check_in_time"] == existing[number - 1].check_in_time
            assert visits[number]["notes"] == "Manual correction"
        else:
            assert (
                visits[number]["check_in_time"] == records[(number - 1) * 2].timestamp
            )
            assert visits[number]["notes"] is None
