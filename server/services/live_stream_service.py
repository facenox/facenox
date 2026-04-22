import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import numpy as np

from api.schemas import AttendanceEventCreate
from services.attendance_service import AttendanceService

logger = logging.getLogger(__name__)

MIN_RECOGNITION_FACE_SIZE = 48
LIVE_CONTEXT_TTL_SECONDS = 5.0
PROTECTED_IDENTITY = "PROTECTED_IDENTITY"


@dataclass
class LiveGroupContext:
    group_id: Optional[str] = None
    group_exists: bool = False
    allowed_person_ids: list[str] = field(default_factory=list)
    members_by_person_id: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    attendance_cooldown_seconds: int = 300
    max_recognition_faces_per_frame: int = 6
    loaded_at: float = 0.0


@dataclass
class LiveSessionConfig:
    enable_liveness_detection: bool = False
    active_group_id: Optional[str] = None
    max_recognition_faces_per_frame: int = 6
    group_context: LiveGroupContext = field(default_factory=LiveGroupContext)
    attendance_cooldowns: Dict[str, float] = field(default_factory=dict)

    def reset_group(self, group_id: Optional[str]) -> None:
        self.active_group_id = group_id
        self.group_context = LiveGroupContext(
            group_id=None,
            max_recognition_faces_per_frame=self.max_recognition_faces_per_frame,
        )
        self.attendance_cooldowns.clear()


class LiveStreamService:
    def __init__(self, organization_id: Optional[str]):
        self.organization_id = organization_id

    @staticmethod
    def _extract_face_area(face: Dict[str, Any]) -> float:
        bbox = face.get("bbox") or {}
        return float(bbox.get("width", 0) * bbox.get("height", 0))

    @staticmethod
    def _has_live_recognition_basics(face: Dict[str, Any]) -> bool:
        bbox = face.get("bbox") or {}
        if bbox.get("width", 0) < MIN_RECOGNITION_FACE_SIZE:
            return False
        if bbox.get("height", 0) < MIN_RECOGNITION_FACE_SIZE:
            return False
        return face.get("track_id") is not None

    @staticmethod
    def _is_attendance_candidate(face: Dict[str, Any]) -> bool:
        liveness = face.get("liveness") or {}
        return liveness.get("status") == "real" and liveness.get("is_real") is True

    def _is_attendance_allowed(
        self, face: Dict[str, Any], config: LiveSessionConfig
    ) -> bool:
        if not config.enable_liveness_detection:
            return self._has_live_recognition_basics(face)
        return self._is_attendance_candidate(face)

    @staticmethod
    def _serialize_recognition_result(
        result: Dict[str, Any], member_info: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        person_id = result.get("person_id")
        similarity = float(result.get("similarity") or 0.0)
        error = result.get("error")

        if not person_id:
            return {
                "success": bool(result.get("success", False)),
                "person_id": None,
                "name": None,
                "has_consent": None,
                "similarity": similarity,
                "processing_time": 0.0,
                "error": error,
            }

        has_consent = bool(member_info and member_info.get("has_consent"))
        if not has_consent:
            return {
                "success": True,
                "person_id": PROTECTED_IDENTITY,
                "name": "Protected",
                "has_consent": False,
                "similarity": similarity,
                "processing_time": 0.0,
                "error": None,
            }

        return {
            "success": True,
            "person_id": person_id,
            "name": (member_info or {}).get("name") or person_id,
            "has_consent": True,
            "similarity": similarity,
            "processing_time": 0.0,
            "error": error,
        }

    @staticmethod
    def _build_attendance_message(
        event_result, member_info: Dict[str, Any], face: Dict[str, Any]
    ) -> Dict[str, Any]:
        bbox = face.get("bbox") or {}
        return {
            "type": "attendance_event",
            "data": {
                "id": event_result.id,
                "person_id": event_result.person_id,
                "group_id": event_result.group_id,
                "timestamp": event_result.timestamp.isoformat(),
                "confidence": event_result.confidence,
                "location": event_result.location,
                "event_type": event_result.event_type,
                "time_health": (
                    event_result.time_health.model_dump(mode="json")
                    if event_result.time_health
                    else None
                ),
                "member": {
                    "name": member_info.get("name"),
                    "role": member_info.get("role"),
                },
                "bbox": {
                    "x": bbox.get("x"),
                    "y": bbox.get("y"),
                    "width": bbox.get("width"),
                    "height": bbox.get("height"),
                },
                "track_id": face.get("track_id"),
            },
        }

    async def load_initial_config(self) -> LiveSessionConfig:
        from database.repository import AttendanceRepository
        from database.session import AsyncSessionLocal

        config = LiveSessionConfig()
        try:
            async with AsyncSessionLocal() as session:
                repo = AttendanceRepository(
                    session, organization_id=self.organization_id
                )
                settings = await repo.get_settings()
                config.enable_liveness_detection = settings.enable_liveness_detection
                config.max_recognition_faces_per_frame = (
                    settings.max_recognition_faces_per_frame or 6
                )
                config.group_context.max_recognition_faces_per_frame = (
                    config.max_recognition_faces_per_frame
                )
        except Exception as exc:
            logger.warning(
                "[LiveStreamService] Failed to load initial stream config: %s", exc
            )
        return config

    def apply_config_message(
        self, config: LiveSessionConfig, message: Dict[str, Any]
    ) -> None:
        if "enable_liveness_detection" in message:
            config.enable_liveness_detection = message.get(
                "enable_liveness_detection", True
            )

        if "group_id" in message:
            requested_group_id = message.get("group_id")
            normalized_group_id = (
                requested_group_id.strip()
                if isinstance(requested_group_id, str) and requested_group_id.strip()
                else None
            )
            config.reset_group(normalized_group_id)

        if "max_recognition_faces_per_frame" in message:
            configured_cap = message.get("max_recognition_faces_per_frame", 6)
            try:
                config.max_recognition_faces_per_frame = max(1, int(configured_cap))
            except (TypeError, ValueError):
                config.max_recognition_faces_per_frame = 6
            config.group_context.max_recognition_faces_per_frame = (
                config.max_recognition_faces_per_frame
            )

    async def ensure_group_context(self, config: LiveSessionConfig) -> LiveGroupContext:
        if not config.active_group_id:
            return config.group_context

        should_refresh = (
            config.group_context.group_id != config.active_group_id
            or time.time() - config.group_context.loaded_at > LIVE_CONTEXT_TTL_SECONDS
        )
        if not should_refresh:
            return config.group_context

        from database.repository import AttendanceRepository
        from database.session import AsyncSessionLocal

        group_context = LiveGroupContext(
            group_id=config.active_group_id,
            max_recognition_faces_per_frame=config.max_recognition_faces_per_frame,
            loaded_at=time.time(),
        )

        async with AsyncSessionLocal() as session:
            repo = AttendanceRepository(session, organization_id=self.organization_id)
            settings = await repo.get_settings()
            group = await repo.get_group(config.active_group_id)

            group_context.attendance_cooldown_seconds = (
                settings.attendance_cooldown_seconds or 300
            )
            group_context.max_recognition_faces_per_frame = (
                settings.max_recognition_faces_per_frame or 6
            )

            if group:
                members = await repo.get_group_members(config.active_group_id)
                group_context.group_exists = True
                group_context.allowed_person_ids = [m.person_id for m in members]
                group_context.members_by_person_id = {
                    member.person_id: {
                        "name": member.name,
                        "role": member.role,
                        "has_consent": member.has_consent,
                    }
                    for member in members
                }

        config.group_context = group_context
        return group_context

    async def process_live_recognition(
        self,
        image: np.ndarray,
        faces: list[Dict[str, Any]],
        config: LiveSessionConfig,
    ) -> list[Dict[str, Any]]:
        if not faces:
            return []

        group_context = await self.ensure_group_context(config)
        if not config.active_group_id or not group_context.group_exists:
            return []

        from core.lifespan import face_recognizer
        from database.repository import AttendanceRepository
        from database.session import AsyncSessionLocal

        if not face_recognizer:
            return []

        recognition_candidates = sorted(
            (
                face
                for face in faces
                if self._has_live_recognition_basics(face)
                and (
                    not config.enable_liveness_detection
                    or self._is_attendance_candidate(face)
                )
            ),
            key=self._extract_face_area,
            reverse=True,
        )

        limit = config.max_recognition_faces_per_frame
        if limit > 0:
            recognition_candidates = recognition_candidates[:limit]

        if not recognition_candidates:
            return []

        recognition_results = await face_recognizer.recognize_faces(
            image,
            recognition_candidates,
            allowed_person_ids=group_context.allowed_person_ids,
            organization_id=self.organization_id,
        )

        attendance_messages: list[Dict[str, Any]] = []
        for face, result in zip(recognition_candidates, recognition_results):
            original_person_id = result.get("person_id")
            member_info = group_context.members_by_person_id.get(original_person_id)
            serialized_result = self._serialize_recognition_result(result, member_info)
            face["recognition"] = serialized_result

            if (
                not original_person_id
                or serialized_result["person_id"] == PROTECTED_IDENTITY
                or not self._is_attendance_allowed(face, config)
            ):
                continue

            cooldown_seconds = group_context.attendance_cooldown_seconds or 300
            cooldown_key = f"{original_person_id}:{group_context.group_id}"
            now = time.time()
            if (
                now - config.attendance_cooldowns.get(cooldown_key, 0.0)
                < cooldown_seconds
            ):
                continue

            try:
                async with AsyncSessionLocal() as session:
                    repo = AttendanceRepository(
                        session, organization_id=self.organization_id
                    )
                    member = await repo.get_member(original_person_id)
                    if not member:
                        continue

                    settings = await repo.get_settings()
                    service = AttendanceService(
                        repo,
                        face_recognizer=face_recognizer,
                        ws_manager=None,
                    )
                    event_result = await service.process_event(
                        AttendanceEventCreate(
                            person_id=original_person_id,
                            confidence=float(face.get("confidence") or 0.0),
                            location="LiveVideo Camera",
                            liveness_status=(face.get("liveness") or {}).get("status"),
                            liveness_confidence=(face.get("liveness") or {}).get(
                                "confidence"
                            ),
                        ),
                        member,
                        settings,
                    )

                if event_result.processed:
                    config.attendance_cooldowns[cooldown_key] = now
                    attendance_messages.append(
                        self._build_attendance_message(
                            event_result, member_info or {}, face
                        )
                    )
            except Exception as exc:
                logger.warning(
                    "[LiveStreamService] Live attendance processing failed for %s: %s",
                    original_person_id,
                    exc,
                )

        return attendance_messages
