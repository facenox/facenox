import asyncio
from datetime import datetime

import pytest
from sqlalchemy import select


@pytest.fixture
def departure_data(test_client, set_api_token):
    from database.models import AttendanceGroupRule, AttendanceSession

    client, factory = test_client
    set_api_token("departure-tests")
    headers = {"X-Facenox-Token": "departure-tests"}
    response = client.put(
        "/attendance/settings", headers=headers, json={"attendance_timezone": "UTC"}
    )
    assert response.status_code == 200, response.text
    response = client.post(
        "/attendance/groups",
        headers=headers,
        json={
            "name": "Historical shift",
            "settings": {
                "attendance_mode": "work_hours",
                "track_checkout": True,
                "class_start_time": "08:00",
                "class_end_time": "17:00",
            },
        },
    )
    assert response.status_code == 200, response.text
    group = response.json()
    response = client.post(
        "/attendance/members",
        headers=headers,
        json={"name": "Alice", "group_id": group["id"]},
    )
    assert response.status_code == 200, response.text
    member = response.json()

    async def seed():
        async with factory() as session:
            rule = (
                (
                    await session.execute(
                        select(AttendanceGroupRule).where(
                            AttendanceGroupRule.group_id == group["id"]
                        )
                    )
                )
                .scalars()
                .first()
            )
            session.add(
                AttendanceSession(
                    id="departure-session",
                    person_id=member["person_id"],
                    member_id=member["id"],
                    group_id=group["id"],
                    applied_rule_id=rule.id,
                    date="2026-11-01",
                    check_in_time=datetime(2026, 11, 1, 8),
                    check_in_time_utc=datetime(2026, 11, 1, 8),
                    check_out_time=datetime(2026, 11, 1, 16, 30),
                    check_out_time_utc=datetime(2026, 11, 1, 16, 30),
                    check_in_time_timezone="UTC",
                    check_out_time_timezone="UTC",
                    status="present",
                    is_late=False,
                )
            )
            await session.commit()

    asyncio.run(seed())
    return client, factory, headers, group, member


def read_session(client, headers, group, member, endpoint):
    if endpoint == "list":
        response = client.get(
            "/attendance/sessions",
            headers=headers,
            params={
                "group_id": group["id"],
                "start_date": "2026-11-01",
                "end_date": "2026-11-01",
            },
        )
    elif endpoint == "detail":
        response = client.get(
            f"/attendance/sessions/{member['person_id']}/2026-11-01", headers=headers
        )
    else:
        response = client.post("/attendance/export", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    return (
        body[0]
        if endpoint == "list"
        else body
        if endpoint == "detail"
        else body["sessions"][0]
    )


@pytest.mark.parametrize("endpoint", ["list", "detail", "export"])
def test_historical_schedule_survives_group_schedule_changes(departure_data, endpoint):
    client, _, headers, group, member = departure_data
    before = read_session(client, headers, group, member, endpoint)
    assert before["applied_schedule"] == {
        "class_start_time": "08:00",
        "class_end_time": "17:00",
        "attendance_mode": "work_hours",
    }
    response = client.put(
        f"/attendance/groups/{group['id']}",
        headers=headers,
        json={
            "settings": {
                "attendance_mode": "work_hours",
                "track_checkout": True,
                "class_start_time": "07:00",
                "class_end_time": "16:00",
            }
        },
    )
    assert response.status_code == 200, response.text
    after = read_session(client, headers, group, member, endpoint)
    assert after["applied_schedule"] == before["applied_schedule"]
    assert after["check_in_time"] == before["check_in_time"]
    assert after["check_out_time"] == before["check_out_time"]


def test_manual_correction_keeps_the_sessions_original_schedule(departure_data):
    client, _, headers, group, member = departure_data
    before = read_session(client, headers, group, member, "detail")
    response = client.put(
        f"/attendance/sessions/{member['person_id']}/2026-11-01",
        headers=headers,
        json={"notes": "Reviewed"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["applied_schedule"] == before["applied_schedule"]


@pytest.mark.parametrize(
    "invalid_rule", ["missing", "different group", "different organization"]
)
def test_unavailable_or_mismatched_schedules_are_not_guessed(
    departure_data, invalid_rule
):
    from database.models import AttendanceSession, AttendanceGroupRule, AttendanceGroup

    client, factory, headers, group, member = departure_data

    async def change_rule():
        async with factory() as session:
            target = await session.get(AttendanceSession, "departure-session")
            if invalid_rule == "missing":
                target.applied_rule_id = None
            else:
                session.add(AttendanceGroup(id="other-group", name="Other"))
                session.add(
                    AttendanceGroupRule(
                        id="invalid-history",
                        group_id="other-group"
                        if invalid_rule == "different group"
                        else group["id"],
                        organization_id="other-org"
                        if invalid_rule == "different organization"
                        else None,
                        effective_from=datetime(2026, 1, 1),
                        class_start_time="05:00",
                        class_end_time="13:00",
                        attendance_mode="work_hours",
                        track_checkout=True,
                    )
                )
                await session.flush()
                target.applied_rule_id = "invalid-history"
            await session.commit()

    asyncio.run(change_rule())
    assert (
        read_session(client, headers, group, member, "detail")["applied_schedule"]
        is None
    )
