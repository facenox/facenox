from datetime import datetime, timezone

import pytest

from api.schemas import AttendanceEventResponse
from services.time_authority_service import TimeAuthorityService


@pytest.mark.asyncio
async def test_time_authority_handles_offline_reference_gracefully() -> None:
    service = TimeAuthorityService()

    async def offline_result():
        return {
            "status": "offline",
            "reference_url": None,
            "checked_at": service.current_time_utc(),
            "reference_time": None,
            "drift_seconds": None,
        }

    service._fetch_online_reference_time = offline_result  # type: ignore[method-assign]

    health = await service.get_time_health(force_refresh=True)

    assert health.online_verification_status == "offline"
    assert health.online_reference_time is None


@pytest.mark.asyncio
async def test_time_authority_warns_when_online_reference_drift_is_large() -> None:
    service = TimeAuthorityService()

    async def drift_result():
        now = service.current_time_utc()
        return {
            "status": "drift_detected",
            "reference_url": "https://example.com",
            "checked_at": now,
            "reference_time": now,
            "drift_seconds": 301.0,
        }

    service._fetch_online_reference_time = drift_result  # type: ignore[method-assign]

    health = await service.get_time_health(force_refresh=True)

    assert health.online_verification_status == "drift_detected"
    assert health.warning_message is not None


def test_attendance_event_response_normalizes_timestamp_to_utc() -> None:
    response = AttendanceEventResponse(
        id="evt-1",
        person_id="person-1",
        group_id="group-1",
        timestamp=datetime(2026, 3, 29, 8, 15),
        confidence=0.99,
        location=None,
        processed=True,
        event_type="check_in",
        error=None,
    )

    assert response.timestamp.tzinfo == timezone.utc
