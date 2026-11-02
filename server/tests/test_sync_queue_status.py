import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest


@pytest.mark.parametrize(
    "zone,changed,cursor,pending,exported",
    [
        ("Asia/Manila", "2026-11-02T19:00:00+08:00", "2026-11-02T11:03:41Z", 0, 0),
        ("America/New_York", "2026-11-02T06:05:00-05:00", "2026-11-02T11:03:41Z", 1, 1),
        ("Asia/Manila", "2026-11-02T19:05:00+08:00", "2026-11-02T11:03:41Z", 1, 1),
        ("America/New_York", "2026-11-02T06:00:00-05:00", "2026-11-02T11:03:41Z", 0, 0),
        ("UTC", "2026-11-02T11:05:00Z", "2026-11-02T11:03:41Z", 1, 1),
        # The export's safety overlap is allowed to replay rows; the queue must not count them.
        ("Asia/Manila", "2026-11-02T19:03:41+08:00", "2026-11-02T11:03:41Z", 0, 1),
    ],
)
@pytest.mark.parametrize("legacy", [False, True])
def test_queue_counts_changes_after_the_snapshot_in_every_timezone(
    test_client,
    set_api_token,
    monkeypatch,
    zone,
    changed,
    cursor,
    pending,
    exported,
    legacy,
):
    import time_utils
    from database.models import AttendanceSession, AttendanceRecord
    from sqlalchemy import null

    monkeypatch.setattr(time_utils, "get_local_timezone", lambda: ZoneInfo(zone))
    client, factory = test_client
    set_api_token("queue-audit")
    headers = {"X-Facenox-Token": "queue-audit"}
    group = client.post(
        "/attendance/groups", headers=headers, json={"name": "Queue audit"}
    ).json()
    member = client.post(
        "/attendance/members",
        headers=headers,
        json={"name": "Audit", "group_id": group["id"]},
    ).json()
    instant = datetime.fromisoformat(changed)

    async def seed():
        async with factory() as session:
            session.add(
                AttendanceSession(
                    id="audit-session",
                    person_id=member["person_id"],
                    member_id=member["id"],
                    group_id=group["id"],
                    date="2026-11-02",
                    status="present",
                    check_in_time=instant.replace(tzinfo=None),
                    last_modified_at=instant.replace(tzinfo=None),
                    modified_at_utc=(
                        null()
                        if legacy
                        else instant.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
                    ),
                )
            )
            session.add(
                AttendanceRecord(
                    id="audit-record",
                    person_id=member["person_id"],
                    member_id=member["id"],
                    group_id=group["id"],
                    timestamp=instant.replace(tzinfo=None),
                    confidence=0.99,
                    last_modified_at=instant.replace(tzinfo=None),
                    modified_at_utc=(
                        null()
                        if legacy
                        else instant.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
                    ),
                )
            )
            await session.commit()

    asyncio.run(seed())
    stats = client.get(
        "/attendance/stats", headers=headers, params={"last_synced_at": cursor}
    )
    delta = client.post("/attendance/export", headers=headers, params={"since": cursor})
    assert stats.status_code == delta.status_code == 200, (stats.text, delta.text)
    assert stats.json()["unsynced_sessions_count"] == pending
    assert stats.json()["unsynced_records_count"] == pending
    assert len(delta.json()["sessions"]) == exported
    assert len(delta.json()["records"]) == exported
