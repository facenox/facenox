import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
import numpy as np

from test_api_biometrics import (
    biometrics_env as biometrics_env,
    _headers,
    _create_member,
    _enroll_metadata,
    _make_image_bytes,
)


@pytest.mark.parametrize("mode", ["entry_only", "exit_only"])
@pytest.mark.parametrize("override", [None, "automatic"])
def test_desktop_scanning_inherits_group_rules_unless_explicitly_overridden(
    biometrics_env, monkeypatch, mode, override
):
    from services.live_stream_service import LiveStreamService, LiveSessionConfig

    client = biometrics_env["client"]
    headers = _headers("scan-mode-audit")
    response = client.post(
        "/attendance/groups",
        headers=headers,
        json={
            "name": "Work",
            "settings": {
                "attendance_mode": "work_hours",
                "scan_behavior": mode,
                "min_checkout_delay_minutes": 0,
            },
        },
    )
    assert response.status_code == 200, response.text
    group_id = response.json()["id"]
    assert response.json()["settings"]["scan_behavior"] == mode
    _create_member(client, headers, group_id, "p", "Member")
    enrolled = client.post(
        f"/attendance/groups/{group_id}/persons/p/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face.jpg", _make_image_bytes(), "image/jpeg")},
    )
    assert enrolled.status_code == 200, enrolled.text

    def health(instant):
        return SimpleNamespace(
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

    now = datetime.now(timezone.utc)
    clock = SimpleNamespace(
        get_time_health=AsyncMock(
            side_effect=[health(now), health(now + timedelta(minutes=20))]
        )
    )
    monkeypatch.setattr("services.attendance_service.get_time_authority", lambda: clock)
    first = client.post(
        "/attendance/events",
        headers=headers,
        json={"person_id": "p", "confidence": 0.99},
    )
    assert first.status_code == 200, first.text
    assert first.json()["processed"] is (mode == "entry_only"), first.json()

    async def scan():
        service = LiveStreamService("scan-mode-audit")
        config = LiveSessionConfig(organization_id="scan-mode-audit")
        message = {"group_id": group_id}
        if override is not None:
            message["scan_behavior"] = override
        service.apply_config_message(config, message)
        face = {
            "bbox": {"x": 0, "y": 0, "width": 80, "height": 80},
            "track_id": 1,
            "confidence": 0.99,
            "landmarks_5": [],
        }
        events = await service.process_live_recognition(
            np.zeros((112, 112, 3), np.uint8), [face], config
        )
        if override is None:
            assert events == []
        else:
            assert len(events) == 1, events
            expected = "check_out" if mode == "entry_only" else "check_in"
            assert events[0]["data"]["event_type"] == expected, events

    asyncio.run(scan())


def test_live_override_can_be_reset_to_inherit_group_rule():
    from services.live_stream_service import LiveStreamService, LiveSessionConfig

    service = LiveStreamService(None)
    config = LiveSessionConfig()
    assert config.scan_behavior is None
    service.apply_config_message(config, {"scan_behavior": "automatic"})
    assert config.scan_behavior == "automatic"
    service.apply_config_message(config, {"scan_behavior": None})
    assert config.scan_behavior is None
