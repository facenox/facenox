import time
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


@pytest.mark.asyncio
async def test_time_authority_rebases_when_os_clock_is_corrected_and_verified() -> None:
    service = TimeAuthorityService()
    corrected_os_time = datetime(2026, 3, 29, 8, 15, tzinfo=timezone.utc)
    stale_backend_time = corrected_os_time.replace(hour=5, minute=15)

    service._boot_time_utc = stale_backend_time
    service._boot_time_mono = 100.0

    original_monotonic = time.monotonic
    time.monotonic = lambda: 100.0  # type: ignore[assignment]

    async def verified_os_result():
        return {
            "status": "drift_detected",
            "reference_url": "https://example.com",
            "checked_at": stale_backend_time,
            "reference_time": corrected_os_time,
            "drift_seconds": (stale_backend_time - corrected_os_time).total_seconds(),
        }

    service._fetch_online_reference_time = verified_os_result  # type: ignore[method-assign]

    from services import time_authority_service as module

    original_local_now = module.local_now
    module.local_now = lambda: corrected_os_time.astimezone()  # type: ignore[assignment]
    try:
        health = await service.get_time_health(force_refresh=True)
    finally:
        module.local_now = original_local_now  # type: ignore[assignment]
        time.monotonic = original_monotonic  # type: ignore[assignment]

    assert health.online_verification_status == "verified"
    assert health.warning_message is None
    assert health.os_clock_drift_seconds < 0.01


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
