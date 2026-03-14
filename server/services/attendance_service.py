import logging
import asyncio
from datetime import datetime, timedelta
from typing import List, Optional, Any, Dict
import ulid
import numpy as np
import cv2

from api.schemas import AttendanceEventResponse
from database.repository import AttendanceRepository

logger = logging.getLogger(__name__)


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

        # Security: Monotonic clock trackers to strictly prevent mid-class system clock tampering
        import time

        self._boot_time_wall = datetime.now()
        self._boot_time_mono = time.monotonic()

    def generate_id(self) -> str:
        """Generate a unique ID"""
        return ulid.ulid()

    async def generate_person_id(self, name: str, group_id: str = None) -> str:
        """Generate a unique person ID"""
        # Generate ULID
        person_id = ulid.ulid()

        # Ensure uniqueness
        max_attempts = 10
        attempt = 0

        while attempt < max_attempts:
            existing_member = await self.repo.get_member(person_id)
            if not existing_member:
                break

            # Generate new ULID if collision occurs
            person_id = ulid.ulid()
            attempt += 1

        return person_id

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
    ) -> List[dict]:
        """Compute attendance sessions from records using configurable late threshold"""
        sessions = []

        existing_sessions_map = {}
        if existing_sessions:
            for session in existing_sessions:
                existing_sessions_map[session.person_id] = session

        records_by_person = {}
        for record in records:
            person_id = record.person_id
            if person_id not in records_by_person:
                records_by_person[person_id] = []
            records_by_person[person_id].append(record)

        if not class_start_time:
            class_start_time = datetime.now().strftime("%H:%M")

        try:
            time_parts = class_start_time.split(":")
            day_start_hour = int(time_parts[0])
            day_start_minute = int(time_parts[1])
        except (ValueError, IndexError):
            day_start_hour = 8
            day_start_minute = 0

        try:
            target_date_obj = datetime.strptime(target_date, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            target_date_obj = None

        for member in members:
            person_id = member.person_id

            # Check if member was enrolled on or before target_date
            if target_date_obj is not None and member.joined_at:
                try:
                    joined_at = member.joined_at
                    # joined_at is datetime in SQLAlchemy model
                    joined_at_obj = joined_at.date()

                    if joined_at_obj and target_date_obj < joined_at_obj:
                        continue

                    today = datetime.now().date()
                    if joined_at_obj and joined_at_obj > today:
                        continue
                except (ValueError, TypeError, AttributeError) as e:
                    logger.debug(f"Error comparing dates for member {person_id}: {e}")

            person_records = records_by_person.get(person_id, [])

            if not person_records:
                existing_session = existing_sessions_map.get(person_id)
                sessions.append(
                    {
                        "id": (
                            existing_session.id
                            if existing_session
                            else self.generate_id()
                        ),
                        "person_id": person_id,
                        "group_id": member.group_id,
                        "date": target_date,
                        "check_in_time": None,
                        "status": "absent",
                        "is_late": False,
                        "late_minutes": None,
                        "notes": None,
                    }
                )
                continue

            person_records.sort(key=lambda r: r.timestamp)

            first_record = person_records[0]
            timestamp = first_record.timestamp  # earliest check-in for the day

            if late_threshold_enabled:
                day_start = timestamp.replace(
                    hour=day_start_hour,
                    minute=day_start_minute,
                    second=0,
                    microsecond=0,
                )
                time_diff_minutes = (timestamp - day_start).total_seconds() / 60
                is_late = time_diff_minutes >= late_threshold_minutes
                late_minutes = (
                    int(time_diff_minutes - late_threshold_minutes) if is_late else 0
                )
            else:
                is_late = False
                late_minutes = 0

            existing_session = existing_sessions_map.get(person_id)
            sessions.append(
                {
                    "id": (
                        existing_session.id if existing_session else self.generate_id()
                    ),
                    "person_id": person_id,
                    "group_id": member.group_id,
                    "date": target_date,
                    "check_in_time": timestamp,
                    "check_out_time": (
                        person_records[-1].timestamp
                        if track_checkout and len(person_records) > 1
                        else None
                    ),
                    "total_hours": (
                        (person_records[-1].timestamp - timestamp).total_seconds()
                        / 3600.0
                        if track_checkout and len(person_records) > 1
                        else None
                    ),
                    "status": "present",
                    "is_late": is_late,
                    "late_minutes": late_minutes if is_late else None,
                    "notes": None,
                }
            )

        return sessions

    def calculate_group_stats(self, members: List[Any], sessions: List[Any]) -> dict:
        """Calculate group attendance statistics"""
        total_members = len(members)
        present_today = 0
        absent_today = 0
        late_today = 0

        session_map = {session.person_id: session for session in sessions}

        for member in members:
            person_id = member.person_id
            session = session_map.get(person_id)

            if session:
                status = session.status
                if status == "present":
                    present_today += 1
                    if session.is_late:
                        late_today += 1
                else:
                    absent_today += 1
            else:
                absent_today += 1

        return {
            "total_members": total_members,
            "present_today": present_today,
            "absent_today": absent_today,
            "late_today": late_today,
        }

    async def process_event(
        self, event_data, member, settings
    ) -> AttendanceEventResponse:
        """Process an attendance event"""
        cooldown_seconds = settings.attendance_cooldown_seconds or 10

        import time

        elapsed_seconds_since_boot = time.monotonic() - self._boot_time_mono
        true_time = self._boot_time_wall + timedelta(seconds=elapsed_seconds_since_boot)

        os_time = datetime.now()
        time_drift = abs((os_time - true_time).total_seconds())
        if time_drift > 60:
            logger.warning(
                f"System clock tampering detected. OS Time is {os_time}, but Monotonic True Time is {true_time}."
            )

        current_time = true_time
        window_seconds = cooldown_seconds

        recent_records = await self.repo.get_records(
            person_id=event_data.person_id,
            start_date=current_time - timedelta(seconds=window_seconds),
            end_date=current_time,
            limit=20,
        )

        today_str = current_time.strftime("%Y-%m-%d")

        # Get group settings for late threshold and check-out tracking
        group = await self.repo.get_group(member.group_id)
        track_checkout = getattr(group, "track_checkout", False)

        existing_session = await self.repo.get_session(event_data.person_id, today_str)

        # Ensure single source of truth for cooldown based on UI settings
        if recent_records:
            for record in recent_records:
                record_time = record.timestamp
                time_diff = (current_time - record_time).total_seconds()

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
            "notes": None,
            "is_manual": False,
            "created_by": None,
        }

        # Add record
        await self.repo.add_record(record_data)

        late_threshold_minutes = group.late_threshold_minutes or 15
        class_start_time = group.class_start_time or current_time.strftime("%H:%M")
        late_threshold_enabled = group.late_threshold_enabled or False

        # Determine event type and session data
        event_type = "check_in"
        check_in_time = timestamp
        check_out_time = None
        total_hours = None

        if existing_session and existing_session.check_in_time:
            check_in_time = existing_session.check_in_time
            if track_checkout:
                event_type = "check_out"
                check_out_time = timestamp
                # Calculate hours
                duration = check_out_time - check_in_time
                total_hours = max(0, duration.total_seconds() / 3600.0)
            else:
                # Preserve earliest check-in if not tracking check-out
                check_in_time = min(existing_session.check_in_time, timestamp)

        if late_threshold_enabled:
            try:
                time_parts = class_start_time.split(":")
                day_start_hour = int(time_parts[0])
                day_start_minute = int(time_parts[1])
            except (ValueError, IndexError):
                day_start_hour = 8
                day_start_minute = 0

            # Calculate if late (based on earliest check-in)
            check_in_hour = check_in_time.hour
            is_early_morning_arrival = 0 <= check_in_hour < 4
            is_late_night_start = 20 <= day_start_hour <= 23

            base_date = check_in_time
            if is_early_morning_arrival and is_late_night_start:
                base_date = check_in_time - timedelta(days=1)

            day_start = base_date.replace(
                hour=day_start_hour, minute=day_start_minute, second=0, microsecond=0
            )

            # Recalculate diff with the adjusted day_start
            time_diff_minutes = (check_in_time - day_start).total_seconds() / 60
            is_late = time_diff_minutes >= late_threshold_minutes
            late_minutes = (
                int(time_diff_minutes - late_threshold_minutes) if is_late else 0
            )
        else:
            is_late = False
            late_minutes = 0

        session_data = {
            "id": (existing_session.id if existing_session else self.generate_id()),
            "person_id": event_data.person_id,
            "group_id": member.group_id,
            "date": today_str,
            "check_in_time": check_in_time,
            "check_out_time": check_out_time,
            "total_hours": total_hours,
            "status": "present",
            "is_late": is_late,
            "late_minutes": late_minutes if is_late else None,
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
                    "timestamp": timestamp.isoformat(),
                    "confidence": event_data.confidence,
                    "location": event_data.location,
                    "event_type": event_type,
                    "check_in_time": (
                        check_in_time.isoformat() if check_in_time else None
                    ),
                    "check_out_time": (
                        check_out_time.isoformat() if check_out_time else None
                    ),
                    "total_hours": total_hours,
                    "member": {
                        "name": member.name,
                        "role": member.role,
                    },
                },
            }
            asyncio.create_task(self.ws_manager.broadcast(broadcast_message))

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
        )

    async def register_face(
        self,
        group_id: str,
        person_id: str,
        image: np.ndarray,
        bbox: List[float],
        landmarks_5: List[List[float]],
        enable_liveness: bool = True,
    ) -> Dict[str, Any]:
        """Register face for a person"""
        if not self.face_recognizer:
            raise ValueError("Face recognition system not available")

        # Verify group exists
        group = await self.repo.get_group(group_id)
        if not group:
            raise ValueError("Group not found")

        # Verify member exists and belongs to group
        member = await self.repo.get_member(person_id)
        if not member:
            raise ValueError("Member not found")

        if member.group_id != group_id:
            raise ValueError("Member does not belong to this group")

        if not member.has_consent:
            raise PermissionError(
                "Biometric consent is required before face registration"
            )

        enable_liveness = enable_liveness

        from hooks import process_liveness_for_face_operation

        should_block, error_msg, liveness_status = (
            await process_liveness_for_face_operation(
                image, bbox, enable_liveness, "Registration"
            )
        )
        if should_block:
            raise ValueError(error_msg)

        logger.info(f"Registering face for {person_id} in group {group_id}")

        result = await self.face_recognizer.register_person(
            person_id, image, landmarks_5
        )

        if result["success"]:
            logger.info(
                f"Face registered successfully for {person_id}. Total persons: {result.get('total_persons', 0)}"
            )
            return {
                "success": True,
                "message": f"Face registered successfully for {person_id} in group {group.name}",
                "person_id": person_id,
                "group_id": group_id,
                "total_persons": result.get("total_persons", 0),
            }
        else:
            logger.error(
                f"Face registration failed for {person_id}: {result.get('error', 'Unknown error')}"
            )
            raise ValueError(result.get("error", "Face registration failed"))

    async def remove_face_data(self, group_id: str, person_id: str) -> Dict[str, Any]:
        """Remove face data for a person"""
        if not self.face_recognizer:
            raise ValueError("Face recognition system not available")

        # Verify group exists
        group = await self.repo.get_group(group_id)
        if not group:
            raise ValueError("Group not found")

        # Verify member exists and belongs to group
        member = await self.repo.get_member(person_id)
        if not member:
            raise ValueError("Member not found")

        if member.group_id != group_id:
            raise ValueError("Member does not belong to this group")

        result = await self.face_recognizer.remove_person(person_id)

        if result["success"]:
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
            image_id = file.filename or f"image_{idx}"
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

    async def bulk_register_with_files(
        self, group_id: str, registrations: list, files: list
    ) -> Dict[str, Any]:
        """Bulk register faces from uploaded binary files (Multipart)"""
        if not self.face_recognizer:
            raise ValueError("Face recognition system not available")

        group = await self.repo.get_group(group_id)
        if not group:
            raise ValueError("Group not found")

        # Create a mapping of file names to UploadFile objects for easy lookup
        file_map = {f.filename: f for f in files if f.filename}
        # Fallback to index-based mapping if no filenames
        file_list = [f for f in files]

        success_count = 0
        failed_count = 0
        results = []

        for idx, reg_data in enumerate(registrations):
            person_id = reg_data.get("person_id")
            filename = reg_data.get("filename")

            try:
                # Get the corresponding file
                file = None
                if filename and filename in file_map:
                    file = file_map[filename]
                elif idx < len(file_list):
                    file = file_list[idx]

                if not file:
                    failed_count += 1
                    results.append(
                        {
                            "index": idx,
                            "person_id": person_id,
                            "success": False,
                            "error": "No image file matched",
                        }
                    )
                    continue

                member = await self.repo.get_member(person_id)
                if not member or member.group_id != group_id:
                    failed_count += 1
                    results.append(
                        {"index": idx, "success": False, "error": "Invalid member"}
                    )
                    continue

                if not member.has_consent:
                    failed_count += 1
                    results.append(
                        {
                            "index": idx,
                            "person_id": person_id,
                            "success": False,
                            "error": "Biometric consent required",
                        }
                    )
                    continue

                contents = await file.read()
                nparr = np.frombuffer(contents, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if image is None:
                    failed_count += 1
                    results.append(
                        {
                            "index": idx,
                            "person_id": person_id,
                            "success": False,
                            "error": "Failed to decode image",
                        }
                    )
                    continue

                landmarks_5 = reg_data.get("landmarks_5")
                if landmarks_5 is None:
                    failed_count += 1
                    results.append(
                        {
                            "index": idx,
                            "person_id": person_id,
                            "success": False,
                            "error": "Landmarks required",
                        }
                    )
                    continue

                result = await self.face_recognizer.register_person(
                    person_id, image, landmarks_5
                )

                if result["success"]:
                    success_count += 1
                    results.append(
                        {"index": idx, "person_id": person_id, "success": True}
                    )
                else:
                    failed_count += 1
                    results.append(
                        {
                            "index": idx,
                            "person_id": person_id,
                            "success": False,
                            "error": result.get("error"),
                        }
                    )

            except Exception as e:
                logger.error(f"Error in bulk register item {idx}: {e}")
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
                if file:
                    await file.close()

        return {
            "success": True,
            "group_id": group_id,
            "success_count": success_count,
            "failed_count": failed_count,
            "results": results,
        }
