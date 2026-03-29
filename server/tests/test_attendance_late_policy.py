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
