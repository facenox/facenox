from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

import httpx

from time_utils import ensure_utc_aware, get_local_timezone, local_now, utc_now

DEFAULT_REFERENCE_URLS = (
    "https://www.google.com/generate_204",
    "https://www.cloudflare.com/cdn-cgi/trace",
    "https://www.microsoft.com",
)


@dataclass(frozen=True)
class TimeHealthSnapshot:
    source: str
    current_time_utc: datetime
    current_time_local: datetime
    time_zone_name: str
    os_clock_drift_seconds: float
    os_clock_warning: Optional[str]
    online_verification_status: str
    online_reference_url: Optional[str]
    online_checked_at: Optional[datetime]
    online_reference_time: Optional[datetime]
    online_drift_seconds: Optional[float]
    warning_message: Optional[str]


class TimeAuthorityService:
    def __init__(self) -> None:
        self._boot_time_utc = utc_now()
        self._boot_time_mono = time.monotonic()
        self._cache_lock = asyncio.Lock()
        self._cached_online_result: Optional[dict] = None

        self._os_warning_threshold_seconds = float(
            os.getenv("FACENOX_OS_CLOCK_WARNING_SECONDS", "60")
        )
        self._online_warning_threshold_seconds = float(
            os.getenv("FACENOX_ONLINE_TIME_WARNING_SECONDS", "120")
        )
        self._online_cache_ttl_seconds = float(
            os.getenv("FACENOX_ONLINE_TIME_CACHE_SECONDS", "900")
        )
        self._online_timeout_seconds = float(
            os.getenv("FACENOX_ONLINE_TIME_TIMEOUT_SECONDS", "2.5")
        )

        raw_urls = os.getenv("FACENOX_TIME_REFERENCE_URLS", "")
        self._reference_urls = (
            tuple(url.strip() for url in raw_urls.split(",") if url.strip())
            or DEFAULT_REFERENCE_URLS
        )

    def current_time_utc(self) -> datetime:
        elapsed = time.monotonic() - self._boot_time_mono
        return self._boot_time_utc + timedelta(seconds=elapsed)

    def current_time_local(self) -> datetime:
        return self.current_time_utc().astimezone(get_local_timezone())

    def _rebase_to_utc(self, target_utc: datetime) -> None:
        self._boot_time_utc = ensure_utc_aware(target_utc)
        self._boot_time_mono = time.monotonic()

    async def get_time_health(
        self, *, force_refresh: bool = False
    ) -> TimeHealthSnapshot:
        current_utc = self.current_time_utc()
        current_local = current_utc.astimezone(get_local_timezone())
        os_time_utc = ensure_utc_aware(local_now())
        os_clock_drift_seconds = abs((os_time_utc - current_utc).total_seconds())

        os_clock_warning = None
        if os_clock_drift_seconds > self._os_warning_threshold_seconds:
            os_clock_warning = (
                "Device clock drift detected. FACENOX is protecting attendance with "
                "backend monotonic time, but the system clock should be corrected."
            )

        online_result = await self._get_online_reference_result(
            force_refresh=force_refresh
        )
        online_status = online_result["status"]
        online_drift_seconds = online_result.get("drift_seconds")

        if (
            force_refresh
            and online_result.get("reference_time") is not None
            and os_clock_drift_seconds > self._os_warning_threshold_seconds
        ):
            os_online_drift_seconds = (
                os_time_utc - online_result["reference_time"]
            ).total_seconds()
            if abs(os_online_drift_seconds) <= self._online_warning_threshold_seconds:
                self._rebase_to_utc(os_time_utc)
                current_utc = self.current_time_utc()
                current_local = current_utc.astimezone(get_local_timezone())
                os_clock_drift_seconds = abs(
                    (os_time_utc - current_utc).total_seconds()
                )
                os_clock_warning = None
                online_drift_seconds = (
                    current_utc - online_result["reference_time"]
                ).total_seconds()
                online_status = (
                    "drift_detected"
                    if abs(online_drift_seconds)
                    > self._online_warning_threshold_seconds
                    else "verified"
                )
                online_result = {
                    **online_result,
                    "status": online_status,
                    "drift_seconds": online_drift_seconds,
                }

        warning_message = os_clock_warning

        if online_status == "drift_detected":
            warning_message = (
                "Device clock differs from online reference time. Please correct the "
                "system clock to avoid user confusion."
            )
        elif warning_message is None and online_status == "offline":
            warning_message = None

        return TimeHealthSnapshot(
            source="backend_monotonic_clock",
            current_time_utc=current_utc,
            current_time_local=current_local,
            time_zone_name=str(current_local.tzinfo or get_local_timezone()),
            os_clock_drift_seconds=round(os_clock_drift_seconds, 3),
            os_clock_warning=os_clock_warning,
            online_verification_status=online_status,
            online_reference_url=online_result.get("reference_url"),
            online_checked_at=online_result.get("checked_at"),
            online_reference_time=online_result.get("reference_time"),
            online_drift_seconds=(
                round(online_drift_seconds, 3)
                if online_drift_seconds is not None
                else None
            ),
            warning_message=warning_message,
        )

    async def _get_online_reference_result(self, *, force_refresh: bool) -> dict:
        async with self._cache_lock:
            if not force_refresh and self._cached_online_result is not None:
                age_seconds = (
                    self.current_time_utc() - self._cached_online_result["checked_at"]
                ).total_seconds()
                if age_seconds <= self._online_cache_ttl_seconds:
                    return self._cached_online_result

            result = await self._fetch_online_reference_time()
            self._cached_online_result = result
            return result

    async def _fetch_online_reference_time(self) -> dict:
        for reference_url in self._reference_urls:
            request_started_mono = time.monotonic()
            try:
                async with httpx.AsyncClient(
                    timeout=self._online_timeout_seconds,
                    follow_redirects=True,
                ) as client:
                    response = await client.get(reference_url)
            except Exception:
                continue

            request_finished_mono = time.monotonic()
            date_header = response.headers.get("Date")
            if not date_header:
                continue

            try:
                reference_time_utc = parsedate_to_datetime(date_header).astimezone(
                    timezone.utc
                )
            except Exception:
                continue

            midpoint_mono = request_started_mono + (
                (request_finished_mono - request_started_mono) / 2
            )
            midpoint_utc = self._boot_time_utc + timedelta(
                seconds=midpoint_mono - self._boot_time_mono
            )
            drift_seconds = (midpoint_utc - reference_time_utc).total_seconds()

            return {
                "status": (
                    "drift_detected"
                    if abs(drift_seconds) > self._online_warning_threshold_seconds
                    else "verified"
                ),
                "reference_url": reference_url,
                "checked_at": midpoint_utc,
                "reference_time": reference_time_utc,
                "drift_seconds": drift_seconds,
            }

        return {
            "status": "offline",
            "reference_url": None,
            "checked_at": self.current_time_utc(),
            "reference_time": None,
            "drift_seconds": None,
        }


_time_authority = TimeAuthorityService()


def get_time_authority() -> TimeAuthorityService:
    return _time_authority
