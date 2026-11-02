import logging
import asyncio
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import List, Optional, Any, Dict
import ulid
import numpy as np
import cv2

from api.schemas import AttendanceEventResponse, AttendanceTimeHealthResponse
from database.repository import AttendanceRepository
from services.time_authority_service import get_time_authority
from attendance_time import event_time, instant_for_sort, read_value
from time_utils import (
    elapsed_seconds,
    ensure_local_aware,
    local_day_bounds,
    local_now,
    to_api_utc,
)

logger = logging.getLogger(__name__)
_background_tasks: set = set()


class AttendanceService:
    def __init__(
        self,
        repo: AttendanceRepository,
        face_detector=None,
        face_recognizer=None,
        ws_manager=None,
    ):
        self.repo = repo
        self.face_detector = face_detector
        self.face_recognizer = face_recognizer
        self.ws_manager = ws_manager
        self.time_authority = get_time_authority()

    def generate_id(self) -> str:
        """Generate a unique ID"""
        return ulid.ulid()

    async def generate_person_id(self, name: str, group_id: str = None) -> str:
        """Generate a unique person ID"""
        person_id = ulid.ulid()

        max_attempts = 10
        attempt = 0

        while attempt < max_attempts:
            existing_member = await self.repo.get_member(person_id)
            if not existing_member:
                break

            person_id = ulid.ulid()
            attempt += 1

        return person_id

    @staticmethod
    def _normalize_rule(
        rule: Optional[Any],
        *,
        late_threshold_minutes: int,
        class_start_time: Optional[str],
        class_end_time: Optional[str] = None,
        attendance_mode: Optional[str] = None,
        late_threshold_enabled: bool,
        track_checkout: bool,
        min_checkout_delay_minutes: Optional[int] = 15,
        scan_behavior: str = "automatic",
    ) -> Dict[str, Any]:
        if rule is None:
            return {
                "id": None,
                "late_threshold_minutes": late_threshold_minutes,
                "class_start_time": class_start_time or local_now().strftime("%H:%M"),
                "class_end_time": class_end_time,
                "attendance_mode": (
                    "work_hours"
                    if track_checkout and attendance_mode in (None, "attendance")
                    else (attendance_mode or "attendance")
                ),
                "late_threshold_enabled": late_threshold_enabled,
                "track_checkout": track_checkout,
                "min_checkout_delay_minutes": (
                    min_checkout_delay_minutes
                    if min_checkout_delay_minutes is not None
                    else 15
                ),
                "scan_behavior": scan_behavior or "automatic",
            }

        rule_track_checkout = getattr(rule, "track_checkout", track_checkout)
        normalized_mode = getattr(rule, "attendance_mode", None)
        if normalized_mode == "attendance" and rule_track_checkout:
            normalized_mode = "work_hours"

        return {
            "id": getattr(rule, "id", None),
            "late_threshold_minutes": getattr(
                rule, "late_threshold_minutes", late_threshold_minutes
            ),
            "class_start_time": getattr(
                rule,
                "class_start_time",
                class_start_time or local_now().strftime("%H:%M"),
            ),
            "class_end_time": getattr(rule, "class_end_time", class_end_time),
            "attendance_mode": normalized_mode
            or ("work_hours" if rule_track_checkout else "attendance"),
            "late_threshold_enabled": getattr(
                rule, "late_threshold_enabled", late_threshold_enabled
            ),
            "track_checkout": rule_track_checkout,
            "min_checkout_delay_minutes": (
                getattr(rule, "min_checkout_delay_minutes", None)
                if getattr(rule, "min_checkout_delay_minutes", None) is not None
                else (
                    min_checkout_delay_minutes
                    if min_checkout_delay_minutes is not None
                    else 15
                )
            ),
            "scan_behavior": getattr(rule, "scan_behavior", None) or "automatic",
        }

    @staticmethod
    def _select_effective_rule(
        rule_history: Optional[List[Any]],
        effective_at: datetime,
    ) -> Optional[Any]:
        if not rule_history:
            return None

        selected_rule = None
        for rule in rule_history:
            rule_effective_from = getattr(rule, "effective_from", None)
            if (
                rule_effective_from is None
                or rule_effective_from <= effective_at.replace(tzinfo=None)
            ):
                selected_rule = rule
            else:
                break

        return selected_rule or rule_history[0]

    @staticmethod
    def _calculate_late_status(
        check_in_time: datetime, rule: Dict[str, Any]
    ) -> tuple[bool, Optional[int]]:
        if not rule.get("late_threshold_enabled"):
            return False, None

        localized_check_in = (
            check_in_time if check_in_time.tzinfo else ensure_local_aware(check_in_time)
        )

        class_start_time = rule.get("class_start_time") or local_now().strftime("%H:%M")
        try:
            start_hour, start_minute = [
                int(part) for part in class_start_time.split(":")
            ]
        except (TypeError, ValueError, AttributeError):
            start_hour, start_minute = 8, 0

        late_threshold_minutes = int(rule.get("late_threshold_minutes") or 0)

        check_in_hour = localized_check_in.hour
        is_early_morning_arrival = 0 <= check_in_hour < 4
        is_late_night_start = 20 <= start_hour <= 23

        base_date = localized_check_in
        if is_early_morning_arrival and is_late_night_start:
            base_date = localized_check_in - timedelta(days=1)

        day_start = base_date.replace(
            hour=start_hour, minute=start_minute, second=0, microsecond=0
        )
        time_diff_minutes = (localized_check_in - day_start).total_seconds() / 60
        is_late = time_diff_minutes > late_threshold_minutes
        if not is_late:
            return False, None

        # Minutes late should reflect lateness against the scheduled start time.
        return True, max(0, int(time_diff_minutes))

    def compute_sessions_from_records(
        self,
        records: List[Any],
        members: List[Any],
        late_threshold_minutes: int,
        target_date: str,
        class_start_time: str = None,
        late_threshold_enabled: bool = False,
        existing_sessions: Optional[List[Any]] = None,
        track_checkout: bool = False,
        attendance_mode: Optional[str] = None,
        scan_behavior: str = "automatic",
        rule_history: Optional[List[Any]] = None,
    ) -> List[dict]:
        """Compute attendance sessions from records using effective-dated group rules."""
        sessions = []

        existing_sessions_map = {}
        if existing_sessions:
            for session in existing_sessions:
                visits = existing_sessions_map.setdefault(session.person_id, {})
                visits[getattr(session, "visit_number", 1) or 1] = session

        records_by_person = {}
        for record in records:
            person_id = record.person_id
            if person_id not in records_by_person:
                records_by_person[person_id] = []
            records_by_person[person_id].append(record)

        try:
            target_date_obj = datetime.strptime(target_date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            target_date_obj = None

        for member in members:
            person_id = member.person_id

            existing_visits = existing_sessions_map.get(person_id, {})
            manual_visits = {
                number: session
                for number, session in existing_visits.items()
                if session.notes or getattr(session, "is_manual_override", False)
            }
            # Overrides belong to a specific visit, not the entire person/day.
            for visit_number, existing_session in sorted(manual_visits.items()):
                sessions.append(
                    {
                        "id": existing_session.id,
                        "person_id": person_id,
                        "group_id": existing_session.group_id,
                        "applied_rule_id": existing_session.applied_rule_id,
                        "date": target_date,
                        "visit_number": visit_number,
                        "check_in_time": event_time(existing_session, "check_in_time"),
                        "check_out_time": event_time(
                            existing_session, "check_out_time"
                        ),
                        "total_hours": existing_session.total_hours,
                        "status": existing_session.status,
                        "is_late": existing_session.is_late,
                        "late_minutes": existing_session.late_minutes,
                        "notes": existing_session.notes,
                        "is_manual_override": True,
                    }
                )

            # Check if member was enrolled on or before target_date
            if target_date_obj is not None and member.joined_at:
                try:
                    joined_at = member.joined_at
                    # joined_at is datetime in SQLAlchemy model
                    joined_at_obj = joined_at.date()

                    if joined_at_obj and target_date_obj < joined_at_obj:
                        continue

                    today = local_now().date()
                    if joined_at_obj and joined_at_obj > today:
                        continue
                except (ValueError, TypeError, AttributeError) as e:
                    logger.debug(f"Error comparing dates for member {person_id}: {e}")

            person_records = records_by_person.get(person_id, [])

            if not person_records:
                if manual_visits:
                    continue
                existing_session = existing_visits.get(1)
                sessions.append(
                    {
                        "id": (
                            existing_session.id
                            if existing_session
                            else self.generate_id()
                        ),
                        "person_id": person_id,
                        "group_id": member.group_id,
                        "applied_rule_id": None,
                        "date": target_date,
                        "check_in_time": None,
                        "status": "absent",
                        "is_late": False,
                        "late_minutes": None,
                        "notes": existing_session.notes if existing_session else None,
                    }
                )
                continue

            person_records.sort(key=lambda r: instant_for_sort(r, "timestamp"))

            first_record = person_records[0]
            timestamp = event_time(first_record, "timestamp")
            # Get the rule in effect at the end of the target day, so settings updates made during the day apply to the day's session
            rule_effective_time = timestamp.replace(
                hour=23, minute=59, second=59, microsecond=999999
            )
            selected_rule = self._select_effective_rule(
                rule_history, rule_effective_time
            )
            normalized_rule = self._normalize_rule(
                selected_rule,
                late_threshold_minutes=late_threshold_minutes,
                class_start_time=class_start_time,
                attendance_mode=attendance_mode,
                late_threshold_enabled=late_threshold_enabled,
                track_checkout=track_checkout,
                scan_behavior=scan_behavior,
            )
            is_late, late_minutes = self._calculate_late_status(
                timestamp, normalized_rule
            )

            if normalized_rule.get("attendance_mode") == "visits":
                for index in range(0, len(person_records), 2):
                    visit_number = index // 2 + 1
                    if visit_number in manual_visits:
                        continue
                    existing_session = existing_visits.get(visit_number)
                    visit_in = event_time(person_records[index], "timestamp")
                    visit_out = (
                        event_time(person_records[index + 1], "timestamp")
                        if index + 1 < len(person_records)
                        else None
                    )
                    sessions.append(
                        {
                            "id": existing_session.id
                            if existing_session
                            else self.generate_id(),
                            "person_id": person_id,
                            "group_id": member.group_id,
                            "applied_rule_id": normalized_rule.get("id"),
                            "date": target_date,
                            "visit_number": visit_number,
                            "check_in_time": visit_in,
                            "check_out_time": visit_out,
                            "total_hours": (
                                elapsed_seconds(visit_in, visit_out) / 3600.0
                                if visit_out
                                else None
                            ),
                            "status": "present",
                            "is_late": is_late if index == 0 else False,
                            "late_minutes": late_minutes if index == 0 else None,
                            "notes": None,
                        }
                    )
                continue

            if 1 in manual_visits:
                continue
            existing_session = existing_visits.get(1)
            should_track_checkout = (
                normalized_rule.get("attendance_mode") != "attendance"
            )
            sessions.append(
                {
                    "id": (
                        existing_session.id if existing_session else self.generate_id()
                    ),
                    "person_id": person_id,
                    "group_id": member.group_id,
                    "applied_rule_id": normalized_rule.get("id"),
                    "date": target_date,
                    "check_in_time": timestamp,
                    "check_out_time": (
                        event_time(person_records[-1], "timestamp")
                        if should_track_checkout and len(person_records) > 1
                        else None
                    ),
                    "total_hours": (
                        elapsed_seconds(
                            timestamp, event_time(person_records[-1], "timestamp")
                        )
                        / 3600.0
                        if should_track_checkout and len(person_records) > 1
                        else None
                    ),
                    "status": "present",
                    "is_late": is_late,
                    "late_minutes": late_minutes,
                    "notes": existing_session.notes if existing_session else None,
                }
            )

        return sessions

    def calculate_group_stats(self, members: List[Any], sessions: List[Any]) -> dict:
        """Calculate group attendance statistics"""
        total_members = len(members)
        present_today = 0
        absent_today = 0
        late_today = 0

        session_map = {}
        for session in sessions:
            pid = read_value(session, "person_id")
            if pid:
                session_map.setdefault(pid, []).append(session)

        for member in members:
            person_id = member.person_id
            visits = session_map.get(person_id, [])
            present_visits = [
                visit
                for visit in visits
                if read_value(visit, "status") in ("present", "late")
            ]
            if present_visits:
                present_today += 1
                if any(
                    read_value(visit, "is_late")
                    or read_value(visit, "status") == "late"
                    for visit in present_visits
                ):
                    late_today += 1
            else:
                absent_today += 1

        return {
            "total_members": total_members,
            "present_today": present_today,
            "absent_today": absent_today,
            "late_today": late_today,
        }

    @staticmethod
    def _is_overnight_checkout(check_in, checkout, rule) -> bool:
        """Only an explicit overnight work schedule can carry an open session."""
        if not check_in or not rule or rule.get("attendance_mode") != "work_hours":
            return False
        try:
            start = datetime.strptime(rule["class_start_time"], "%H:%M").time()
            end = datetime.strptime(rule["class_end_time"], "%H:%M").time()
        except (KeyError, TypeError, ValueError):
            return False
        check_in = ensure_local_aware(check_in)
        checkout = ensure_local_aware(checkout).astimezone(check_in.tzinfo)
        return (
            end < start
            and checkout.date() == check_in.date() + timedelta(days=1)
            and checkout.time().replace(tzinfo=None) < start
            and elapsed_seconds(check_in, checkout) >= 0
        )

    async def records_for_attendance_date(
        self, group_id: str, target_date: str, *, person_id=None, rule_history=None
    ) -> List[Any]:
        """Keep a typed overnight checkout with its preceding day's arrival."""
        day = datetime.strptime(target_date, "%Y-%m-%d")
        start, _ = local_day_bounds((day - timedelta(days=1)).strftime("%Y-%m-%d"))
        _, end = local_day_bounds((day + timedelta(days=1)).strftime("%Y-%m-%d"))
        records = await self.repo.get_records(
            group_id=group_id, person_id=person_id, start_date=start, end_date=end
        )
        if rule_history is None:
            rule_history = await self.repo.get_group_rules(group_id)
        pending = {}
        result = []
        for record in sorted(
            records, key=lambda row: instant_for_sort(row, "timestamp")
        ):
            timestamp = event_time(record, "timestamp")
            record_date = timestamp.strftime("%Y-%m-%d")
            event_type = getattr(record, "event_type", None)
            arrival = pending.get(record.person_id)
            if event_type == "check_out":
                if arrival and self._is_overnight_checkout(
                    arrival[0], timestamp, arrival[1]
                ):
                    record_date = arrival[0].strftime("%Y-%m-%d")
                pending.pop(record.person_id, None)
            elif event_type == "check_in" or not arrival:
                rule = self._select_effective_rule(
                    rule_history,
                    timestamp.replace(
                        hour=23, minute=59, second=59, microsecond=999999
                    ),
                )
                pending[record.person_id] = (
                    timestamp,
                    {
                        "attendance_mode": getattr(rule, "attendance_mode", None),
                        "class_start_time": getattr(rule, "class_start_time", None),
                        "class_end_time": getattr(rule, "class_end_time", None),
                    },
                )
            else:
                pending.pop(record.person_id, None)
            if record_date == target_date:
                result.append(record)
        return result

    async def save_recomputed_sessions(self, sessions, existing_sessions):
        """Replace derived visits without discarding any manual overrides."""
        await self.repo.upsert_sessions(sessions)
        expected = {(row["person_id"], row.get("visit_number", 1)) for row in sessions}
        rebuilt_people = {row["person_id"] for row in sessions}
        for old in existing_sessions:
            if (
                old.person_id in rebuilt_people
                and not old.notes
                and not getattr(old, "is_manual_override", False)
                and (old.person_id, old.visit_number or 1) not in expected
            ):
                await self.repo.retire_session(old)

    async def recompute_sessions_for_date(
        self,
        group_id: str,
        target_date: str,
        *,
        person_id: Optional[str] = None,
    ) -> List[dict]:
        """Rebuild derived sessions for a group/date after record corrections."""
        group = await self.repo.get_group(group_id)
        if not group:
            raise ValueError("Group not found")

        if person_id:
            member = await self.repo.get_member(person_id)
            if not member or member.group_id != group_id:
                raise ValueError("Member not found")
            members = [member]
        else:
            members = await self.repo.get_group_members(group_id)

        existing_sessions = await self.repo.get_sessions(
            group_id=group_id,
            person_id=person_id,
            start_date=target_date,
            end_date=target_date,
        )
        rule_history = await self.repo.get_group_rules(group_id)
        records = await self.records_for_attendance_date(
            group_id,
            target_date,
            person_id=person_id,
            rule_history=rule_history,
        )

        session_dicts = self.compute_sessions_from_records(
            records=records,
            members=members,
            late_threshold_minutes=group.late_threshold_minutes or 15,
            target_date=target_date,
            class_start_time=group.class_start_time,
            late_threshold_enabled=group.late_threshold_enabled or False,
            existing_sessions=existing_sessions,
            track_checkout=getattr(group, "track_checkout", False),
            attendance_mode=(
                getattr(group, "attendance_mode", None)
                or (
                    "work_hours"
                    if getattr(group, "track_checkout", False)
                    else "attendance"
                )
            ),
            scan_behavior=getattr(group, "scan_behavior", "automatic"),
            rule_history=rule_history,
        )

        await self.save_recomputed_sessions(session_dicts, existing_sessions)

        return session_dicts

    async def process_event(
        self, event_data, member, settings
    ) -> AttendanceEventResponse:
        """Process an attendance event"""
        cooldown_seconds = settings.attendance_cooldown_seconds or 300

        time_health = await self.time_authority.get_time_health()
        time_health_payload = AttendanceTimeHealthResponse.model_validate(
            time_health.__dict__
        ).model_dump(mode="json")
        current_time = time_health.current_time_local
        attendance_zone = getattr(settings, "attendance_timezone", None)
        if attendance_zone:
            device_zone = str(time_health.time_zone_name or "").strip()
            current_time = time_health.current_time_utc.astimezone(
                ZoneInfo(attendance_zone)
            )
            time_health_payload["current_time_local"] = current_time.isoformat()
            time_health_payload["time_zone_name"] = attendance_zone
            if device_zone and device_zone != attendance_zone:
                time_health_payload["timezone_mismatch"] = True
                warning = "Your device timezone doesn't match the configured attendance timezone."
                time_health_payload["warning_message"] = " ".join(
                    filter(None, [time_health_payload.get("warning_message"), warning])
                )
        window_seconds = cooldown_seconds

        recent_records = await self.repo.get_recent_records_by_instant(
            person_id=event_data.person_id,
            start=current_time.astimezone(timezone.utc)
            - timedelta(seconds=window_seconds),
            end=current_time,
        )

        today_str = current_time.strftime("%Y-%m-%d")

        # Get group settings for late threshold and check-out tracking
        group = await self.repo.get_group(member.group_id)
        if not group or not group.is_active:
            return AttendanceEventResponse(
                id=None,
                person_id=event_data.person_id,
                group_id=member.group_id,
                timestamp=current_time,
                confidence=event_data.confidence,
                location=event_data.location,
                processed=False,
                error="Attendance group is inactive or unavailable.",
                time_health=time_health_payload,
            )

        # Always fetch the effective rule at the current event time to support settings changes midway through the day
        session_rule = await self.repo.get_effective_group_rule(
            member.group_id, current_time.replace(tzinfo=None)
        )

        normalized_rule = self._normalize_rule(
            session_rule,
            late_threshold_minutes=(
                group.late_threshold_minutes
                if group and group.late_threshold_minutes is not None
                else 15
            ),
            class_start_time=(
                group.class_start_time
                if group and group.class_start_time
                else time_health.current_time_local.strftime("%H:%M")
            ),
            late_threshold_enabled=(
                group.late_threshold_enabled
                if group and group.late_threshold_enabled is not None
                else False
            ),
            attendance_mode=(
                getattr(group, "attendance_mode", None)
                or (
                    "work_hours"
                    if getattr(group, "track_checkout", False)
                    else "attendance"
                )
            )
            if group
            else "attendance",
            track_checkout=getattr(group, "track_checkout", False) if group else False,
            min_checkout_delay_minutes=(
                getattr(group, "min_checkout_delay_minutes", 15) if group else 15
            ),
            scan_behavior=(
                getattr(group, "scan_behavior", "automatic") if group else "automatic"
            ),
        )

        attendance_mode = normalized_rule.get("attendance_mode") or (
            "work_hours" if normalized_rule.get("track_checkout") else "attendance"
        )
        track_checkout = attendance_mode != "attendance"
        scan_behavior = (
            getattr(event_data, "scan_behavior", None)
            or normalized_rule.get("scan_behavior")
            or "automatic"
        )
        latest_session = await (
            self.repo.get_latest_session(event_data.person_id, today_str)
            if attendance_mode == "visits"
            else self.repo.get_session(event_data.person_id, today_str)
        )
        session_date = today_str
        # A new calendar day must not turn an overnight departure into an arrival.
        if scan_behavior != "entry_only" and (
            not latest_session or not latest_session.check_in_time
        ):
            previous_date = (current_time - timedelta(days=1)).strftime("%Y-%m-%d")
            previous = await self.repo.get_latest_session(
                event_data.person_id, previous_date
            )
            schedule = previous.applied_schedule if previous else None
            if (
                previous
                and previous.group_id == member.group_id
                and not previous.check_out_time
                and self._is_overnight_checkout(
                    event_time(previous, "check_in_time"), current_time, schedule
                )
            ):
                latest_session = previous
                session_date = previous.date
                attendance_mode = "work_hours"
                track_checkout = True
                normalized_rule = self._normalize_rule(
                    previous.applied_rule,
                    late_threshold_minutes=normalized_rule["late_threshold_minutes"],
                    class_start_time=schedule["class_start_time"],
                    late_threshold_enabled=normalized_rule["late_threshold_enabled"],
                    track_checkout=True,
                )
        visit_number = (latest_session.visit_number or 1) if latest_session else 1
        existing_session = latest_session
        if (
            attendance_mode in ("work_hours", "visits")
            and scan_behavior == "exit_only"
            and (
                not existing_session
                or not existing_session.check_in_time
                or existing_session.check_out_time
            )
        ):
            return AttendanceEventResponse(
                id=None,
                person_id=event_data.person_id,
                group_id=member.group_id,
                timestamp=current_time,
                confidence=event_data.confidence,
                location=event_data.location,
                processed=False,
                error="No open session is available for this exit scan.",
                time_health=time_health_payload,
            )
        if (
            attendance_mode == "visits"
            and latest_session
            and latest_session.check_out_time
        ):
            visit_number = (latest_session.visit_number or 1) + 1
            existing_session = None

        if (
            attendance_mode == "attendance"
            and existing_session
            and existing_session.check_in_time
        ):
            return AttendanceEventResponse(
                id=None,
                person_id=event_data.person_id,
                group_id=member.group_id,
                timestamp=current_time,
                confidence=event_data.confidence,
                location=event_data.location,
                processed=False,
                error="Member is already checked in for today.",
                time_health=time_health_payload,
            )

        if (
            attendance_mode == "work_hours"
            and existing_session
            and existing_session.check_in_time
            and existing_session.check_out_time
        ):
            return AttendanceEventResponse(
                id=None,
                person_id=event_data.person_id,
                group_id=member.group_id,
                timestamp=current_time,
                confidence=event_data.confidence,
                location=event_data.location,
                processed=False,
                error="Member has already checked out for today.",
                time_health=time_health_payload,
            )

        if (
            attendance_mode in ("work_hours", "visits")
            and scan_behavior == "entry_only"
            and existing_session
            and existing_session.check_in_time
            and not existing_session.check_out_time
        ):
            return AttendanceEventResponse(
                id=None,
                person_id=event_data.person_id,
                group_id=member.group_id,
                timestamp=current_time,
                confidence=event_data.confidence,
                location=event_data.location,
                processed=False,
                error="Entry-only scanning is enabled for this device.",
                time_health=time_health_payload,
            )

        if (
            attendance_mode in ("work_hours", "visits")
            and scan_behavior != "entry_only"
            and existing_session
            and existing_session.check_in_time
            and not existing_session.check_out_time
        ):
            time_since_check_in = abs(
                elapsed_seconds(
                    event_time(existing_session, "check_in_time"), current_time
                )
            )
            min_delay_val = normalized_rule.get("min_checkout_delay_minutes")
            min_delay_minutes = 15 if min_delay_val is None else min_delay_val
            if min_delay_minutes > 0:
                time_since_check_in = abs(
                    elapsed_seconds(
                        event_time(existing_session, "check_in_time"), current_time
                    )
                )
                min_delay_seconds = min_delay_minutes * 60
                if time_since_check_in < min_delay_seconds:
                    remaining_seconds = int(min_delay_seconds - time_since_check_in)
                    remaining_mins = max(1, (remaining_seconds + 59) // 60)
                    return AttendanceEventResponse(
                        id=None,
                        person_id=event_data.person_id,
                        group_id=member.group_id,
                        timestamp=current_time,
                        confidence=event_data.confidence,
                        location=event_data.location,
                        processed=False,
                        error=f"Time-Out locked. Must wait {remaining_mins}m after Time-In before clocking out.",
                        time_health=time_health_payload,
                    )

        if recent_records:
            for record in recent_records:
                record_time = event_time(record, "timestamp")
                time_diff = abs(elapsed_seconds(record_time, current_time))

                if time_diff < cooldown_seconds:
                    return AttendanceEventResponse(
                        id=None,
                        person_id=event_data.person_id,
                        group_id=member.group_id,
                        timestamp=current_time,
                        confidence=event_data.confidence,
                        location=event_data.location,
                        processed=False,
                        error=f"Cooldown active. Wait {int(cooldown_seconds - time_diff)}s.",
                        time_health=time_health_payload,
                    )

        record_id = self.generate_id()
        timestamp = current_time

        record_data = {
            "id": record_id,
            "person_id": event_data.person_id,
            "group_id": member.group_id,
            "timestamp": timestamp,
            "confidence": event_data.confidence,
            "location": event_data.location,
            "device_id": getattr(event_data, "device_id", None),
            "notes": None,
            "is_manual": False,
            "created_by": None,
        }

        # Determine event type and session data
        event_type = "check_in"
        check_in_time = timestamp
        check_out_time = None
        total_hours = None

        if existing_session and existing_session.check_in_time:
            check_in_time = event_time(existing_session, "check_in_time")
            if track_checkout and scan_behavior != "entry_only":
                event_type = "check_out"
                check_out_time = timestamp
                total_hours = max(
                    0, elapsed_seconds(check_in_time, check_out_time) / 3600.0
                )
            else:
                # Preserve earliest check-in if not tracking check-out
                check_in_time = min(
                    (check_in_time, timestamp),
                    key=lambda value: ensure_local_aware(value).astimezone(
                        timezone.utc
                    ),
                )

        record_data["event_type"] = event_type
        await self.repo.add_record(record_data)

        is_late, late_minutes = self._calculate_late_status(
            check_in_time, normalized_rule
        )
        if attendance_mode == "visits" and visit_number > 1:
            is_late, late_minutes = False, None

        session_data = {
            "id": (existing_session.id if existing_session else self.generate_id()),
            "person_id": event_data.person_id,
            "group_id": member.group_id,
            "applied_rule_id": normalized_rule.get("id"),
            "date": session_date,
            "visit_number": visit_number,
            "check_in_time": check_in_time,
            "check_out_time": check_out_time,
            "total_hours": total_hours,
            "status": "present",
            "is_late": is_late,
            "late_minutes": late_minutes,
            "notes": None,
        }

        await self.repo.upsert_session(session_data)

        if self.ws_manager:
            broadcast_message = {
                "type": "attendance_event",
                "data": {
                    "id": record_id,
                    "person_id": event_data.person_id,
                    "group_id": member.group_id,
                    "timestamp": to_api_utc(timestamp).isoformat(),
                    "confidence": event_data.confidence,
                    "location": event_data.location,
                    "event_type": event_type,
                    "check_in_time": (
                        to_api_utc(check_in_time).isoformat() if check_in_time else None
                    ),
                    "check_out_time": (
                        to_api_utc(check_out_time).isoformat()
                        if check_out_time
                        else None
                    ),
                    "total_hours": total_hours,
                    "time_health": (
                        time_health_payload
                        if time_health_payload.get("warning_message")
                        else None
                    ),
                    "member": {
                        "name": member.name,
                        "role": member.role,
                    },
                },
            }
            task = asyncio.create_task(self.ws_manager.broadcast(broadcast_message))
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)

        return AttendanceEventResponse(
            id=record_id,
            person_id=event_data.person_id,
            group_id=member.group_id,
            timestamp=timestamp,
            confidence=event_data.confidence,
            location=event_data.location,
            processed=True,
            event_type=event_type,
            error=None,
            time_health=time_health_payload,
        )

    async def enroll_member(
        self,
        group_id: str,
        person_id: str,
        image: np.ndarray,
        bbox: List[float],
        landmarks_5: List[List[float]],
    ) -> Dict[str, Any]:
        """Enroll member for recognition in a group."""
        if not self.face_recognizer:
            raise ValueError("Face recognition system not available")

        group = await self.repo.get_group(group_id)
        if not group:
            raise ValueError("Group not found")

        member = await self.repo.get_member(person_id)
        if not member:
            raise ValueError("Member not found")

        if member.group_id != group_id:
            raise ValueError("Member does not belong to this group")

        from hooks import process_face_detection

        detections = await process_face_detection(
            image, min_face_size=0, enable_liveness=False
        )
        if not detections:
            raise ValueError("No detectable face found in image")

        result = await self.face_recognizer.enroll_person(
            person_id, image, landmarks_5, self.repo.organization_id
        )

        if result["success"] and result.get("database_saved") is not False:
            from services.live_stream_service import LiveStreamService

            LiveStreamService.invalidate_all(self.repo.organization_id)
            logger.info(
                f"Face enrolled successfully for {person_id}. Total persons: {result.get('total_persons', 0)}"
            )
            return {
                "success": True,
                "message": f"Face enrolled successfully for {person_id} in group {group.name}",
                "person_id": person_id,
                "group_id": group_id,
                "total_persons": result.get("total_persons", 0),
            }
        else:
            logger.error(
                f"Face enrollment failed for {person_id}: {result.get('error', 'Unknown error')}"
            )
            raise ValueError(
                result.get("error")
                or "Failed to save face data. Please try enrolling again."
            )

    async def remove_face_data(self, group_id: str, person_id: str) -> Dict[str, Any]:
        """Remove face data for a person"""
        if not self.face_recognizer:
            raise ValueError("Face recognition system not available")

        group = await self.repo.get_group(group_id)
        if not group:
            raise ValueError("Group not found")

        member = await self.repo.get_member(person_id)
        if not member:
            raise ValueError("Member not found")

        if member.group_id != group_id:
            raise ValueError("Member does not belong to this group")

        result = await self.face_recognizer.remove_person(
            person_id, self.repo.organization_id
        )

        if result["success"]:
            from services.live_stream_service import LiveStreamService

            LiveStreamService.invalidate_all(self.repo.organization_id)
            return {
                "success": True,
                "message": f"Face data removed for {person_id} in group {group.name}",
                "person_id": person_id,
                "group_id": group_id,
            }
        else:
            raise ValueError("Face data not found for this person")

    async def bulk_detect_faces_in_files(
        self, group_id: str, images: list
    ) -> Dict[str, Any]:
        """Detect faces in multiple uploaded binary files (Multipart)"""
        if not self.face_detector:
            raise ValueError("Face detection system not available")

        group = await self.repo.get_group(group_id)
        if not group:
            raise ValueError("Group not found")

        results = []
        from hooks import process_face_detection

        for idx, file in enumerate(images):
            image_id = f"image_{idx}"
            try:
                contents = await file.read()
                nparr = np.frombuffer(contents, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if image is None:
                    results.append(
                        {
                            "image_id": image_id,
                            "success": False,
                            "error": "Failed to decode image",
                            "faces": [],
                        }
                    )
                    continue

                detections = await process_face_detection(image)

                processed_faces = []
                for face in detections:
                    processed_faces.append(
                        {
                            "bbox": face.get("bbox"),
                            "confidence": face.get("confidence", 0.0),
                            "landmarks_5": face.get("landmarks_5"),
                            "quality_score": 0.8,
                            "is_acceptable": True,
                        }
                    )

                results.append(
                    {
                        "image_id": image_id,
                        "success": True,
                        "faces": processed_faces,
                        "total_faces": len(processed_faces),
                    }
                )

            except Exception as e:
                logger.error(f"Error processing image {image_id}: {e}")
                results.append(
                    {
                        "image_id": image_id,
                        "success": False,
                        "error": str(e),
                        "faces": [],
                    }
                )
            finally:
                await file.close()

        return {
            "success": True,
            "group_id": group_id,
            "total_images": len(images),
            "results": results,
        }

    async def bulk_enroll_with_files(
        self, group_id: str, registrations: list, files: list
    ) -> Dict[str, Any]:
        """Bulk enroll members for recognition from uploaded binary files (Multipart)"""
        if not self.face_recognizer:
            raise ValueError("Face recognition system not available")

        group = await self.repo.get_group(group_id)
        if not group:
            raise ValueError("Group not found")

        file_list = list(files)
        files_by_name = {}
        for file in file_list:
            if file.filename:
                files_by_name.setdefault(file.filename, []).append(file)

        success_count = 0
        failed_count = 0
        results = []

        try:
            for idx, reg_data in enumerate(registrations):
                person_id = reg_data.get("person_id")
                filename = reg_data.get("filename")

                try:
                    file = None
                    if "image_index" in reg_data:
                        image_index = reg_data["image_index"]
                        if type(image_index) is not int or not 0 <= image_index < len(
                            file_list
                        ):
                            raise ValueError("Invalid image index")
                        file = file_list[image_index]
                    elif filename:
                        matches = files_by_name.get(filename, [])
                        if len(matches) > 1:
                            raise ValueError(
                                "Ambiguous image filename; provide an image index"
                            )
                        if matches:
                            file = matches[0]
                    elif idx < len(file_list):
                        file = file_list[idx]

                    if file is None:
                        raise ValueError("No image file matched")

                    member = await self.repo.get_member(person_id)
                    if not member or member.group_id != group_id:
                        raise ValueError("Invalid member")

                    # Multiple registrations may reference different faces in
                    # the same photo. Keep it open and rewind before each read.
                    await file.seek(0)
                    contents = await file.read()
                    nparr = np.frombuffer(contents, np.uint8)
                    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                    if image is None:
                        raise ValueError("Failed to decode image")

                    from hooks import process_face_detection

                    detections = await process_face_detection(
                        image, min_face_size=0, enable_liveness=False
                    )
                    if not detections:
                        raise ValueError("No detectable face found in image")

                    landmarks_5 = reg_data.get("landmarks_5")
                    if landmarks_5 is None:
                        raise ValueError("Landmarks required")

                    result = await self.face_recognizer.enroll_person(
                        person_id, image, landmarks_5, self.repo.organization_id
                    )

                    if result["success"] and result.get("database_saved") is not False:
                        success_count += 1
                        results.append(
                            {"index": idx, "person_id": person_id, "success": True}
                        )
                    else:
                        raise ValueError(
                            result.get("error")
                            or "Failed to save face data. Please try enrolling again."
                        )

                except Exception as e:
                    logger.error(f"Error in bulk enroll item {idx}: {e}")
                    failed_count += 1
                    results.append(
                        {
                            "index": idx,
                            "person_id": person_id,
                            "success": False,
                            "error": str(e),
                        }
                    )
        finally:
            for file in file_list:
                await file.close()

        if success_count > 0:
            from services.live_stream_service import LiveStreamService

            LiveStreamService.invalidate_all(self.repo.organization_id)

        return {
            "success": True,
            "group_id": group_id,
            "success_count": success_count,
            "failed_count": failed_count,
            "results": results,
        }
