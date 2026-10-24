from datetime import datetime
from types import SimpleNamespace

from services.attendance_service import AttendanceService


def test_exact_threshold_is_not_late_with_grace_period() -> None:
    service = AttendanceService(repo=None)

    sessions = service.compute_sessions_from_records(
        records=[
            SimpleNamespace(
                person_id="person-1",
                timestamp=datetime(2026, 3, 29, 8, 15),
            )
        ],
        members=[
            SimpleNamespace(
                person_id="person-1",
                group_id="group-1",
                joined_at=datetime(2026, 3, 1, 9, 0),
            )
        ],
        late_threshold_minutes=15,
        target_date="2026-03-29",
        class_start_time="08:00",
        late_threshold_enabled=True,
        rule_history=[
            SimpleNamespace(
                id="rule-1",
                effective_from=datetime(2026, 3, 1, 0, 0),
                late_threshold_minutes=15,
                late_threshold_enabled=True,
                class_start_time="08:00",
                track_checkout=False,
            )
        ],
    )

    assert len(sessions) == 1
    assert sessions[0]["is_late"] is False
    assert sessions[0]["late_minutes"] is None
    assert sessions[0]["applied_rule_id"] == "rule-1"


def test_visits_can_track_late_arrivals() -> None:
    service = AttendanceService(repo=None)

    sessions = service.compute_sessions_from_records(
        records=[
            SimpleNamespace(
                person_id="person-1",
                timestamp=datetime(2026, 3, 29, 8, 30),
            )
        ],
        members=[
            SimpleNamespace(
                person_id="person-1",
                group_id="group-1",
                joined_at=datetime(2026, 3, 1, 9, 0),
            )
        ],
        late_threshold_minutes=15,
        target_date="2026-03-29",
        class_start_time="08:00",
        late_threshold_enabled=True,
        attendance_mode="visits",
        track_checkout=True,
        rule_history=[
            SimpleNamespace(
                id="rule-visits",
                effective_from=datetime(2026, 3, 1, 0, 0),
                late_threshold_minutes=15,
                late_threshold_enabled=True,
                class_start_time="08:00",
                attendance_mode="visits",
                track_checkout=True,
            )
        ],
    )

    assert len(sessions) == 1
    assert sessions[0]["is_late"] is True
    assert sessions[0]["late_minutes"] == 30
    assert sessions[0]["visit_number"] == 1


def test_overnight_class_uses_previous_day_start_for_lateness() -> None:
    service = AttendanceService(repo=None)

    sessions = service.compute_sessions_from_records(
        records=[
            SimpleNamespace(
                person_id="person-1",
                timestamp=datetime(2026, 3, 29, 0, 10),
            )
        ],
        members=[
            SimpleNamespace(
                person_id="person-1",
                group_id="group-1",
                joined_at=datetime(2026, 3, 1, 9, 0),
            )
        ],
        late_threshold_minutes=15,
        target_date="2026-03-29",
        class_start_time="23:00",
        late_threshold_enabled=True,
        rule_history=[
            SimpleNamespace(
                id="rule-overnight",
                effective_from=datetime(2026, 3, 1, 0, 0),
                late_threshold_minutes=15,
                late_threshold_enabled=True,
                class_start_time="23:00",
                track_checkout=False,
            )
        ],
    )

    assert len(sessions) == 1
    assert sessions[0]["is_late"] is True
    assert sessions[0]["late_minutes"] == 70
    assert sessions[0]["applied_rule_id"] == "rule-overnight"


def test_midday_rule_change_applies_to_day_session() -> None:
    service = AttendanceService(repo=None)

    # First rule effective at 00:00 AM (track_checkout = False)
    # Second rule effective at 01:40 AM (track_checkout = True)
    sessions = service.compute_sessions_from_records(
        records=[
            SimpleNamespace(
                person_id="person-1",
                timestamp=datetime(2026, 3, 29, 1, 31),
            ),
            SimpleNamespace(
                person_id="person-1",
                timestamp=datetime(2026, 3, 29, 1, 45),
            ),
        ],
        members=[
            SimpleNamespace(
                person_id="person-1",
                group_id="group-1",
                joined_at=datetime(2026, 3, 1, 9, 0),
            )
        ],
        late_threshold_minutes=15,
        target_date="2026-03-29",
        class_start_time="08:00",
        late_threshold_enabled=True,
        rule_history=[
            SimpleNamespace(
                id="rule-1",
                effective_from=datetime(2026, 3, 29, 0, 0),
                late_threshold_minutes=15,
                late_threshold_enabled=True,
                class_start_time="08:00",
                track_checkout=False,
            ),
            SimpleNamespace(
                id="rule-2",
                effective_from=datetime(2026, 3, 29, 1, 40),
                late_threshold_minutes=15,
                late_threshold_enabled=True,
                class_start_time="08:00",
                track_checkout=True,
            ),
        ],
    )

    assert len(sessions) == 1
    # Since rule-2 is matched at the end of the day, it should track checkout!
    assert sessions[0]["applied_rule_id"] == "rule-2"
    assert sessions[0]["check_out_time"] == datetime(2026, 3, 29, 1, 45)
    assert sessions[0]["total_hours"] is not None
