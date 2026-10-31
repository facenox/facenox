import asyncio
import json
from collections import defaultdict
from unittest.mock import AsyncMock, Mock
from datetime import datetime, timezone
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

import core.lifespan
from hooks import face_processing


class DummyFaceRecognizer:
    def __init__(self) -> None:
        self.enrolled: dict[str | None, dict[str, dict]] = defaultdict(dict)
        self.threshold = 0.5

    async def enroll_person(
        self,
        person_id: str,
        image: np.ndarray,
        landmarks_5: list,
        organization_id: str | None,
    ) -> dict:
        self.enrolled[organization_id][person_id] = {
            "shape": image.shape,
            "landmarks_5": landmarks_5,
        }
        return {
            "success": True,
            "person_id": person_id,
            "total_persons": len(self.enrolled[organization_id]),
        }

    async def get_all_persons(self, organization_id: str | None) -> list[str]:
        return sorted(self.enrolled[organization_id].keys())

    async def get_stats(self, organization_id: str | None) -> dict:
        return {
            "total_persons": len(self.enrolled[organization_id]),
            "threshold": self.threshold,
        }

    async def recognize_face(
        self,
        image: np.ndarray,
        landmarks_5: list,
        allowed_person_ids: list[str] | None = None,
        organization_id: str | None = None,
    ) -> dict:
        candidates = (
            allowed_person_ids
            if allowed_person_ids is not None
            else list(self.enrolled[organization_id].keys())
        )
        for person_id in candidates:
            if person_id in self.enrolled[organization_id]:
                return {
                    "success": True,
                    "person_id": person_id,
                    "similarity": 0.97,
                }
        return {"success": False, "error": "No match", "similarity": 0.0}

    async def recognize_faces(
        self,
        image: np.ndarray,
        faces: list[dict],
        allowed_person_ids: list[str] | None = None,
        organization_id: str | None = None,
        **kwargs,
    ) -> list[dict]:
        return [
            await self.recognize_face(
                image,
                face.get("landmarks_5", []),
                allowed_person_ids,
                organization_id,
            )
            for face in faces
        ]

    async def remove_person(self, person_id: str, organization_id: str | None) -> dict:
        removed = self.enrolled[organization_id].pop(person_id, None)
        return {
            "success": removed is not None,
            "total_persons": len(self.enrolled[organization_id]),
            "error": None if removed is not None else "Person not found",
        }

    async def update_person_id(
        self, old_person_id: str, new_person_id: str, organization_id: str | None
    ) -> dict:
        existing = self.enrolled[organization_id].pop(old_person_id, None)
        if existing is None:
            return {"success": False, "message": "No biometric data for person"}
        self.enrolled[organization_id][new_person_id] = existing
        return {"success": True, "updated_records": 1}

    async def clear_database(self, organization_id: str | None) -> dict:
        self.enrolled[organization_id].clear()
        return {"success": True}

    def invalidate_cache(self, organization_id: str | None) -> None:
        return None

    def set_similarity_threshold(self, threshold: float) -> None:
        self.threshold = threshold

    async def export_embeddings(
        self, organization_id: str | None = None
    ) -> dict[str, np.ndarray]:
        return {
            person_id: np.zeros((128,), dtype=np.float32)
            for person_id in self.enrolled[organization_id].keys()
        }


class DummyFaceDetector:
    def set_confidence_threshold(self, _value: float) -> None:
        return None

    def set_nms_threshold(self, _value: float) -> None:
        return None

    def set_min_face_size(self, _value: int) -> None:
        return None

    def detect_faces(
        self, image: np.ndarray, enable_liveness: bool = False
    ) -> list[dict]:
        if float(np.std(image)) < 5.0:
            return []

        face = {
            "bbox": {"x": 0, "y": 0, "width": 48, "height": 48},
            "confidence": 0.98,
            "landmarks_5": [[12, 14], [36, 14], [24, 24], [16, 36], [32, 36]],
        }
        if enable_liveness:
            face["liveness"] = {
                "status": "real",
                "is_real": True,
                "confidence": 0.99,
            }
        return [face]


class DummyLivenessDetector:
    def detect_faces(self, _image: np.ndarray, faces: list[dict]) -> list[dict]:
        enriched = []
        for face in faces:
            current = dict(face)
            current["liveness"] = {
                "status": "real",
                "is_real": True,
                "confidence": 0.99,
            }
            enriched.append(current)
        return enriched

    def update_face_identity(
        self,
        track_id: int,
        person_id: str | None,
        current_liveness: dict,
        namespace: str | None = None,
    ) -> dict:
        return current_liveness

    def clear_namespace(self, _namespace: str | None = None) -> None:
        return None


class SuspiciousLivenessDetector:
    def detect_faces(self, _image: np.ndarray, faces: list[dict]) -> list[dict]:
        enriched = []
        for face in faces:
            current = dict(face)
            current["liveness"] = {
                "status": "move_closer",
                "is_real": False,
                "confidence": 0.21,
            }
            enriched.append(current)
        return enriched

    def update_face_identity(
        self,
        track_id: int,
        person_id: str | None,
        current_liveness: dict,
        namespace: str | None = None,
    ) -> dict:
        return current_liveness

    def clear_namespace(self, _namespace: str | None = None) -> None:
        return None


class PreserveGuidanceLivenessDetector:
    def detect_faces(self, _image: np.ndarray, faces: list[dict]) -> list[dict]:
        enriched = []
        for face in faces:
            current = dict(face)
            current_liveness = current.get("liveness") or {}
            if current_liveness.get("status") in {"move_closer", "center_face"}:
                enriched.append(current)
                continue

            current["liveness"] = {
                "status": "real",
                "is_real": True,
                "confidence": 0.99,
            }
            enriched.append(current)
        return enriched

    def update_face_identity(self, _track_id: int, _person_id: str | None) -> None:
        return None

    def clear_namespace(self, _namespace: str | None = None) -> None:
        return None


class CenterFaceDetector(DummyFaceDetector):
    def detect_faces(
        self, image: np.ndarray, enable_liveness: bool = False
    ) -> list[dict]:
        faces = super().detect_faces(image, enable_liveness=False)
        if enable_liveness and faces:
            faces[0]["liveness"] = {
                "status": "center_face",
                "is_real": None,
                "confidence": 0.0,
            }
        return faces


class DummyTracker:
    def update(self, faces: list[dict], _frame_rate: int | None) -> list[dict]:
        tracked = []
        for index, face in enumerate(faces, start=1):
            current = dict(face)
            current["track_id"] = index
            tracked.append(current)
        return tracked


@pytest.fixture
def biometrics_env(test_client, set_api_token, monkeypatch):
    client, _session_factory = test_client
    set_api_token("biometrics-token")

    fake_recognizer = DummyFaceRecognizer()
    fake_detector = DummyFaceDetector()
    fake_liveness = DummyLivenessDetector()

    monkeypatch.setattr(core.lifespan, "face_recognizer", fake_recognizer)
    monkeypatch.setattr(core.lifespan, "liveness_detector", fake_liveness)
    monkeypatch.setattr(face_processing, "face_detector", fake_detector)
    monkeypatch.setattr(face_processing, "liveness_detector", fake_liveness)
    monkeypatch.setattr(face_processing, "face_recognizer", fake_recognizer)

    return {
        "client": client,
        "recognizer": fake_recognizer,
    }


def _headers(organization_id: str) -> dict[str, str]:
    return {
        "X-Facenox-Token": "biometrics-token",
        "X-Facenox-Organization": organization_id,
    }


def _make_image_bytes() -> bytes:
    x = np.linspace(0, 255, 48, dtype=np.uint8)
    image = np.tile(x, (48, 1))
    image = np.stack([image, np.flipud(image), image], axis=-1)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


def _make_blank_image_bytes() -> bytes:
    image = np.zeros((48, 48, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return encoded.tobytes()


def _create_group(client, headers: dict[str, str], name: str) -> str:
    response = client.post("/attendance/groups", headers=headers, json={"name": name})
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _create_member(
    client,
    headers: dict[str, str],
    group_id: str,
    person_id: str,
    name: str,
) -> None:
    response = client.post(
        "/attendance/members",
        headers=headers,
        json={
            "person_id": person_id,
            "group_id": group_id,
            "name": name,
        },
    )
    assert response.status_code == 200, response.text


def _enroll_metadata(enable_liveness_detection: bool = False) -> str:
    return json.dumps(
        {
            "bbox": [8, 12, 42, 36],
            "landmarks_5": [[10, 10], [30, 10], [20, 20], [12, 30], [28, 30]],
            "enable_liveness_detection": enable_liveness_detection,
        }
    )


@pytest.mark.parametrize("selection", ["all", "single", "already-loaded"])
def test_deactivated_group_cannot_recognize_or_log_live_attendance(
    biometrics_env,
    monkeypatch,
    selection,
):
    from services.live_stream_service import LiveStreamService, LiveSessionConfig

    client = biometrics_env["client"]
    headers = _headers("inactive-group-org")
    group_id = _create_group(client, headers, "Disabled")
    _create_group(client, headers, "Active One")
    _create_group(client, headers, "Active Two")
    _create_member(client, headers, group_id, "disabled-person", "Disabled Member")
    enrolled = client.post(
        f"/attendance/groups/{group_id}/persons/disabled-person/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face.jpg", _make_image_bytes(), "image/jpeg")},
    )
    assert enrolled.status_code == 200, enrolled.text
    now = datetime.now(timezone.utc)
    health = SimpleNamespace(
        source="test",
        current_time_utc=now,
        current_time_local=now,
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
    monkeypatch.setattr(
        "services.attendance_service.get_time_authority",
        lambda: SimpleNamespace(get_time_health=AsyncMock(return_value=health)),
    )

    async def scan():
        service = LiveStreamService("inactive-group-org")
        config = LiveSessionConfig(
            organization_id="inactive-group-org",
            active_group_id="all" if selection != "single" else group_id,
        )
        if selection == "already-loaded":
            context = await service.ensure_group_context(config)
            assert "disabled-person" in context.allowed_person_ids
            # Keep a pre-deactivation context to verify the event-time guard too.
            from database.repository import AttendanceRepository
            from database.session import AsyncSessionLocal

            async with AsyncSessionLocal() as session:
                repo = AttendanceRepository(session, "inactive-group-org")
                await repo.update_group(group_id, {"is_active": False})
                await session.commit()
        else:
            disabled = client.put(
                f"/attendance/groups/{group_id}",
                headers=headers,
                json={"is_active": False},
            )
            assert disabled.status_code == 200, disabled.text

        face = {
            "bbox": {"x": 0, "y": 0, "width": 80, "height": 80},
            "confidence": 0.99,
            "track_id": 1,
            "landmarks_5": [],
        }
        events = await service.process_live_recognition(
            np.zeros((112, 112, 3), np.uint8),
            [face],
            config,
        )
        assert events == []
        if selection != "already-loaded":
            assert "disabled-person" not in config.group_context.allowed_person_ids
            assert not face.get("recognition", {}).get("person_id")

    asyncio.run(scan())
    assert client.get("/attendance/records", headers=headers).json() == []
    event = client.post(
        "/attendance/events",
        headers=headers,
        json={"person_id": "disabled-person", "confidence": 0.99},
    )
    assert event.status_code == 200, event.text
    assert event.json()["processed"] is False
    assert event.json()["error"] == "Attendance group is inactive or unavailable."

    metadata = dict(
        json.loads(_enroll_metadata()),
        group_id="all" if selection != "single" else group_id,
    )
    recognition = client.post(
        "/face/recognize",
        headers=headers,
        data={"metadata": json.dumps(metadata)},
        files={"image": ("face.jpg", _make_image_bytes(), "image/jpeg")},
    )
    assert recognition.status_code == 200, recognition.text
    assert recognition.json()["person_id"] is None


@pytest.mark.parametrize("stage", ["inference", "event"])
def test_live_recognition_discards_work_invalidated_in_flight(
    biometrics_env,
    monkeypatch,
    stage,
):
    from api.schemas import AttendanceEventResponse
    from services.attendance_service import AttendanceService
    from services.live_stream_service import LiveSessionConfig, LiveStreamService

    client = biometrics_env["client"]
    headers = _headers("inflight-org")
    group_id = _create_group(client, headers, "Live")
    _create_member(client, headers, group_id, "p", "Member")
    enrolled = client.post(
        f"/attendance/groups/{group_id}/persons/p/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face.jpg", _make_image_bytes(), "image/jpeg")},
    )
    assert enrolled.status_code == 200, enrolled.text
    events_started = []

    async def process_event(service, event, member, _settings):
        events_started.append(event.person_id)
        assert stage == "event", "Removed identity reached attendance processing"
        timestamp = datetime.now(timezone.utc)
        await service.repo.add_record(
            {
                "id": "pending-event",
                "person_id": member.person_id,
                "group_id": member.group_id,
                "timestamp": timestamp,
                "confidence": 0.99,
            }
        )
        LiveStreamService.invalidate_all("inflight-org")
        return AttendanceEventResponse(
            id="pending-event",
            person_id=member.person_id,
            group_id=member.group_id,
            timestamp=timestamp,
            confidence=0.99,
            location=None,
            processed=True,
            error=None,
        )

    monkeypatch.setattr(AttendanceService, "process_event", process_event)

    async def scan():
        service = LiveStreamService("inflight-org")
        config = LiveSessionConfig(
            organization_id="inflight-org", active_group_id=group_id
        )
        LiveStreamService.register_config(config)
        started = asyncio.Event()
        finish = asyncio.Event()

        async def recognize(*_args, **_kwargs):
            started.set()
            await finish.wait()
            return [{"success": True, "person_id": "p", "similarity": 0.99}]

        monkeypatch.setattr(biometrics_env["recognizer"], "recognize_faces", recognize)
        face = {
            "bbox": {"x": 0, "y": 0, "width": 80, "height": 80},
            "confidence": 0.99,
            "track_id": 1,
            "landmarks_5": [],
        }
        pending = asyncio.create_task(
            service.process_live_recognition(
                np.zeros((112, 112, 3), np.uint8),
                [face],
                config,
            )
        )
        try:
            await asyncio.wait_for(started.wait(), 5)
            if stage == "inference":
                removed = client.delete(
                    f"/attendance/groups/{group_id}/persons/p/face-data",
                    headers=headers,
                )
                assert removed.status_code == 200, removed.text
            finish.set()
            assert await asyncio.wait_for(pending, 5) == []
            assert not face.get("recognition", {}).get("person_id")
        finally:
            finish.set()
            if not pending.done():
                pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)
            LiveStreamService.unregister_config(config)

    asyncio.run(scan())
    assert events_started == ([] if stage == "inference" else ["p"])
    assert client.get("/attendance/records", headers=headers).json() == []


def test_bulk_enrollment_reuses_a_photo_for_multiple_faces(biometrics_env):
    client = biometrics_env["client"]
    headers = _headers("org-shared-photo")
    group_id = _create_group(client, headers, "Team")
    registrations = []
    for person_id in ("one", "two"):
        _create_member(client, headers, group_id, person_id, person_id)
        registrations.append(
            dict(
                json.loads(_enroll_metadata()), person_id=person_id, filename="team.jpg"
            )
        )

    response = client.post(
        f"/attendance/groups/{group_id}/bulk-enroll-faces",
        headers=headers,
        data={"metadata": json.dumps(registrations)},
        files={"images": ("team.jpg", _make_image_bytes(), "image/jpeg")},
    )

    assert response.status_code == 200, response.text
    assert response.json()["success_count"] == 2, response.json()
    assert response.json()["failed_count"] == 0
    assert set(biometrics_env["recognizer"].enrolled["org-shared-photo"]) == {
        "one",
        "two",
    }


@pytest.mark.parametrize("indexed", [False, True])
def test_bulk_enrollment_duplicate_filenames_are_never_silently_mismatched(
    biometrics_env,
    indexed,
):
    client = biometrics_env["client"]
    headers = _headers("org-repeated-name")
    group_id = _create_group(client, headers, "Photos")
    registrations = []
    for index, person_id in enumerate(("one", "two")):
        _create_member(client, headers, group_id, person_id, person_id)
        registration = dict(
            json.loads(_enroll_metadata()), person_id=person_id, filename="photo.jpg"
        )
        if indexed:
            registration["image_index"] = index
        registrations.append(registration)

    image = np.tile(np.linspace(0, 255, 96, dtype=np.uint8), (48, 1))
    ok, encoded = cv2.imencode(".jpg", np.stack([image] * 3, axis=-1))
    assert ok
    response = client.post(
        f"/attendance/groups/{group_id}/bulk-enroll-faces",
        headers=headers,
        data={"metadata": json.dumps(registrations)},
        files=[
            ("images", ("photo.jpg", _make_image_bytes(), "image/jpeg")),
            ("images", ("photo.jpg", encoded.tobytes(), "image/jpeg")),
        ],
    )

    assert response.status_code == 200, response.text
    result = response.json()
    enrolled = biometrics_env["recognizer"].enrolled["org-repeated-name"]
    if indexed:
        assert result["success_count"] == 2, result
        assert enrolled["one"]["shape"] == (48, 48, 3)
        assert enrolled["two"]["shape"] == (48, 96, 3)
    else:
        assert result["success_count"] == 0, result
        assert result["failed_count"] == 2
        assert all(
            "Ambiguous image filename" in row["error"] for row in result["results"]
        )
        assert enrolled == {}


@pytest.mark.parametrize("image_index", [-1, 1, True, "0", None])
def test_bulk_enrollment_invalid_image_index_does_not_fall_back_to_filename(
    biometrics_env,
    image_index,
):
    client = biometrics_env["client"]
    headers = _headers("org-invalid-image")
    group_id = _create_group(client, headers, "Photos")
    _create_member(client, headers, group_id, "one", "One")
    registration = dict(
        json.loads(_enroll_metadata()),
        person_id="one",
        filename="photo.jpg",
        image_index=image_index,
    )
    response = client.post(
        f"/attendance/groups/{group_id}/bulk-enroll-faces",
        headers=headers,
        data={"metadata": json.dumps([registration])},
        files={"images": ("photo.jpg", _make_image_bytes(), "image/jpeg")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["success_count"] == 0
    assert response.json()["results"][0]["error"] == "Invalid image index"


def test_bulk_members_report_duplicate_id_without_rolling_back_valid_entries(
    biometrics_env,
):
    client = biometrics_env["client"]
    headers = _headers("org-bulk-duplicates")
    group_id = _create_group(client, headers, "Members")
    response = client.post(
        "/attendance/members/bulk",
        headers=headers,
        json={
            "members": [
                {"person_id": person_id, "group_id": group_id, "name": name}
                for person_id, name in (
                    ("duplicate", "First"),
                    ("duplicate", "Second"),
                    ("valid", "Third"),
                )
            ]
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["success_count"] == 2
    assert result["error_count"] == 1
    assert result["errors"][0]["person_id"] == "duplicate"
    members = client.get("/attendance/members", headers=headers).json()
    assert {row["person_id"]: row["name"] for row in members} == {
        "duplicate": "First",
        "valid": "Third",
    }


@pytest.mark.parametrize("enrolled", [False, True])
def test_person_id_rename_commits_member_and_face_together(
    biometrics_env,
    test_client,
    monkeypatch,
    enrolled,
):
    from database.repository import FaceRepository

    client, factory = test_client
    headers = _headers("org-rename")
    group_id = _create_group(client, headers, "Rename")
    _create_member(client, headers, group_id, "old", "Member")

    async def seed():
        async with factory() as session:
            if enrolled:
                await FaceRepository(session, "org-rename").upsert_face(
                    "old", b"encrypted-test-template", 512
                )
            await FaceRepository(session, "other-org").upsert_face(
                "old", b"other-org-template", 512
            )
            await session.commit()

    asyncio.run(seed())

    async def verify_committed_cache_refresh(organization_id):
        assert organization_id == "org-rename"
        async with factory() as session:
            from database.repository import AttendanceRepository

            repo = AttendanceRepository(session, organization_id)
            assert await repo.get_member("old") is None
            assert (await repo.get_member("new")).name == "Member"
            faces = FaceRepository(session, organization_id)
            assert await faces.get_face("old") is None
            renamed = await faces.get_face("new")
            assert (renamed is not None) is enrolled
            if enrolled:
                assert renamed.embedding == b"encrypted-test-template"
            assert (
                await FaceRepository(session, "other-org").get_face("old")
            ).embedding == b"other-org-template"

    refresh = AsyncMock(side_effect=verify_committed_cache_refresh)
    monkeypatch.setattr(
        biometrics_env["recognizer"], "refresh_cache", refresh, raising=False
    )
    rename = AsyncMock(side_effect=AssertionError("Must use the member transaction"))
    monkeypatch.setattr(biometrics_env["recognizer"], "update_person_id", rename)
    response = client.put(
        "/face/person",
        headers=headers,
        json={"old_person_id": "old", "new_person_id": "new"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["success"] is True
    assert client.get("/attendance/members/old", headers=headers).status_code == 404
    assert client.get("/attendance/members/new", headers=headers).status_code == 200
    refresh.assert_awaited_once_with("org-rename")
    rename.assert_not_awaited()


@pytest.mark.parametrize("enrolled", [False, True])
def test_person_id_rename_face_conflict_rolls_back_member_change(
    biometrics_env,
    test_client,
    monkeypatch,
    enrolled,
):
    from database.repository import FaceRepository

    client, factory = test_client
    headers = _headers("org-rename-conflict")
    group_id = _create_group(client, headers, "Conflict")
    _create_member(client, headers, group_id, "old", "Member")

    async def seed():
        async with factory() as session:
            faces = FaceRepository(session, "org-rename-conflict")
            if enrolled:
                await faces.upsert_face("old", b"old-template", 512)
            await faces.upsert_face("new", b"existing-template", 512)
            await session.commit()

    asyncio.run(seed())
    refresh = AsyncMock()
    monkeypatch.setattr(
        biometrics_env["recognizer"], "refresh_cache", refresh, raising=False
    )
    response = client.put(
        "/face/person",
        headers=headers,
        json={"old_person_id": "old", "new_person_id": "new"},
    )
    assert response.status_code == 409, response.text
    assert client.get("/attendance/members/old", headers=headers).status_code == 200
    assert client.get("/attendance/members/new", headers=headers).status_code == 404

    async def check_faces():
        async with factory() as session:
            faces = FaceRepository(session, "org-rename-conflict")
            old_face = await faces.get_face("old")
            assert (old_face is not None) is enrolled
            if enrolled:
                assert old_face.embedding == b"old-template"
            assert (await faces.get_face("new")).embedding == b"existing-template"

    asyncio.run(check_faces())
    refresh.assert_not_awaited()


@pytest.mark.parametrize("reported_success", [False, True])
@pytest.mark.parametrize("bulk", [False, True])
def test_enrollment_rejects_unsaved_face_data(
    biometrics_env, monkeypatch, reported_success, bulk
) -> None:
    from services.live_stream_service import LiveStreamService

    client = biometrics_env["client"]
    headers = _headers("org-save-failure")
    group_id = _create_group(client, headers, "Enrollment Storage")
    _create_member(client, headers, group_id, "unsaved-person", "Unsaved Person")
    monkeypatch.setattr(
        biometrics_env["recognizer"],
        "enroll_person",
        AsyncMock(return_value={"success": reported_success, "database_saved": False}),
    )
    invalidate = Mock()
    monkeypatch.setattr(LiveStreamService, "invalidate_all", invalidate)

    if bulk:
        metadata = json.loads(_enroll_metadata())
        metadata.update(person_id="unsaved-person", filename="face.jpg")
        response = client.post(
            f"/attendance/groups/{group_id}/bulk-enroll-faces",
            headers=headers,
            data={"metadata": json.dumps([metadata])},
            files=[("images", ("face.jpg", _make_image_bytes(), "image/jpeg"))],
        )
        assert response.status_code == 200, response.text
        assert response.json()["success_count"] == 0
        assert response.json()["failed_count"] == 1
        assert response.json()["results"][0]["success"] is False
        error = response.json()["results"][0]["error"]
    else:
        response = client.post(
            f"/attendance/groups/{group_id}/persons/unsaved-person/enroll-face",
            headers=headers,
            data={"metadata": _enroll_metadata()},
            files={"image": ("face.jpg", _make_image_bytes(), "image/jpeg")},
        )
        assert response.status_code == 400, response.text
        error = response.json()["detail"]

    assert error == "Failed to save face data. Please try enrolling again."
    invalidate.assert_not_called()


def test_enroll_and_list_face_data_stays_org_scoped(biometrics_env) -> None:
    client = biometrics_env["client"]
    org_one_headers = _headers("org-one")
    org_two_headers = _headers("org-two")
    group_one_id = _create_group(client, org_one_headers, "Biometrics One")
    group_two_id = _create_group(client, org_two_headers, "Biometrics Two")

    _create_member(
        client,
        org_one_headers,
        group_one_id,
        "shared-person",
        "Alice Org One",
    )
    _create_member(
        client,
        org_two_headers,
        group_two_id,
        "shared-person",
        "Bob Org Two",
    )

    image_bytes = _make_image_bytes()
    metadata = _enroll_metadata()

    enroll_one = client.post(
        f"/attendance/groups/{group_one_id}/persons/shared-person/enroll-face",
        headers=org_one_headers,
        data={"metadata": metadata},
        files={"image": ("face-one.jpg", image_bytes, "image/jpeg")},
    )
    enroll_two = client.post(
        f"/attendance/groups/{group_two_id}/persons/shared-person/enroll-face",
        headers=org_two_headers,
        data={"metadata": metadata},
        files={"image": ("face-two.jpg", image_bytes, "image/jpeg")},
    )
    assert enroll_one.status_code == 200, enroll_one.text
    assert enroll_two.status_code == 200, enroll_two.text

    persons_one = client.get("/face/persons", headers=org_one_headers)
    persons_two = client.get("/face/persons", headers=org_two_headers)
    assert persons_one.status_code == 200, persons_one.text
    assert persons_two.status_code == 200, persons_two.text
    assert persons_one.json()["persons"] == ["shared-person"]
    assert persons_two.json()["persons"] == ["shared-person"]
    assert persons_one.json()["stats"]["total_persons"] == 1
    assert persons_two.json()["stats"]["total_persons"] == 1

    group_persons_one = client.get(
        f"/attendance/groups/{group_one_id}/persons",
        headers=org_one_headers,
    )
    group_persons_two = client.get(
        f"/attendance/groups/{group_two_id}/persons",
        headers=org_two_headers,
    )
    assert group_persons_one.status_code == 200, group_persons_one.text
    assert group_persons_two.status_code == 200, group_persons_two.text
    assert group_persons_one.json()[0]["has_face_data"] is True
    assert group_persons_two.json()[0]["has_face_data"] is True

    all_members_one = client.get("/attendance/members", headers=org_one_headers)
    all_members_two = client.get("/attendance/members", headers=org_two_headers)
    assert all_members_one.status_code == 200, all_members_one.text
    assert all_members_two.status_code == 200, all_members_two.text
    assert all_members_one.json()[0]["has_face_data"] is True
    assert all_members_two.json()[0]["has_face_data"] is True


def test_recognition_is_org_scoped(
    biometrics_env,
) -> None:
    client = biometrics_env["client"]
    org_one_headers = _headers("org-one")
    org_two_headers = _headers("org-two")
    group_one_id = _create_group(client, org_one_headers, "Recognition One")
    group_two_id = _create_group(client, org_two_headers, "Recognition Two")

    _create_member(
        client,
        org_one_headers,
        group_one_id,
        "shared-person",
        "Alice Org One",
    )
    _create_member(
        client,
        org_two_headers,
        group_two_id,
        "shared-person",
        "Bob Org Two",
    )

    image_bytes = _make_image_bytes()
    enroll_metadata = _enroll_metadata()

    # Enroll shared-person in org-one only
    response = client.post(
        f"/attendance/groups/{group_one_id}/persons/shared-person/enroll-face",
        headers=org_one_headers,
        data={"metadata": enroll_metadata},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert response.status_code == 200, response.text

    recognize_metadata_one = json.dumps(
        {
            "bbox": [8, 12, 42, 36],
            "landmarks_5": [[10, 10], [30, 10], [20, 20], [12, 30], [28, 30]],
            "group_id": group_one_id,
            "enable_liveness_detection": False,
        }
    )
    recognize_metadata_two = json.dumps(
        {
            "bbox": [8, 12, 42, 36],
            "landmarks_5": [[10, 10], [30, 10], [20, 20], [12, 30], [28, 30]],
            "group_id": group_two_id,
            "enable_liveness_detection": False,
        }
    )

    recognized_one = client.post(
        "/face/recognize",
        headers=org_one_headers,
        data={"metadata": recognize_metadata_one},
        files={"image": ("recognize-one.jpg", image_bytes, "image/jpeg")},
    )
    recognized_two = client.post(
        "/face/recognize",
        headers=org_two_headers,
        data={"metadata": recognize_metadata_two},
        files={"image": ("recognize-two.jpg", image_bytes, "image/jpeg")},
    )
    assert recognized_one.status_code == 200, recognized_one.text
    assert recognized_two.status_code == 200, recognized_two.text
    assert recognized_one.json()["success"] is True
    assert recognized_one.json()["person_id"] == "shared-person"
    assert recognized_two.json()["success"] is False


def test_detection_websocket_processes_frame_bytes(biometrics_env) -> None:
    client = biometrics_env["client"]
    org_headers = _headers("org-ws")
    group_id = _create_group(client, org_headers, "WebSocket Group")
    _create_member(client, org_headers, group_id, "ws-person", "WebSocket Person")

    from utils.websocket_manager import manager

    client_id = "frame-client"
    manager.face_trackers[client_id] = DummyTracker()
    image_bytes = _make_image_bytes()

    with client.websocket_connect(
        f"/ws/detect/{client_id}?token=biometrics-token&organization_id=org-ws"
    ) as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connection"

        websocket.send_json({"type": "config", "enable_liveness_detection": True})
        config_ack = websocket.receive_json()
        assert config_ack["type"] == "config_ack"

        websocket.send_bytes(image_bytes)
        detection = websocket.receive_json()
        assert detection["type"] == "detection_response"
        assert detection["success"] is True
        assert len(detection["faces"]) == 1
        assert detection["faces"][0]["bbox"] == [0, 0, 48, 48]
        assert detection["faces"][0]["track_id"] == 1
        assert detection["faces"][0]["liveness"]["status"] == "real"

        websocket.send_json({"type": "disconnect"})


def test_detection_websocket_live_pipeline_embeds_recognition_and_logs_once(
    biometrics_env,
) -> None:
    client = biometrics_env["client"]
    org_headers = _headers("org-live")
    group_id = _create_group(client, org_headers, "Live Group")
    _create_member(client, org_headers, group_id, "live-person", "Live Person")

    image_bytes = _make_image_bytes()
    enroll = client.post(
        f"/attendance/groups/{group_id}/persons/live-person/enroll-face",
        headers=org_headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert enroll.status_code == 200, enroll.text

    from utils.websocket_manager import manager

    client_id = "live-pipeline-client"
    manager.face_trackers[client_id] = DummyTracker()

    with client.websocket_connect(
        f"/ws/detect/{client_id}?token=biometrics-token&organization_id=org-live"
    ) as websocket:
        connected = websocket.receive_json()
        assert connected["type"] == "connection"

        websocket.send_json({"type": "config", "group_id": group_id})
        config_ack = websocket.receive_json()
        assert config_ack["type"] == "config_ack"
        assert config_ack["group_id"] == group_id

        websocket.send_bytes(image_bytes)
        detection = websocket.receive_json()
        assert detection["type"] == "detection_response"
        face = detection["faces"][0]
        assert face["recognition"]["person_id"] == "live-person"
        assert face["recognition"]["name"] == "Live Person"

        attendance_event = websocket.receive_json()
        assert attendance_event["type"] == "attendance_event"
        assert attendance_event["data"]["person_id"] == "live-person"
        assert attendance_event["data"]["group_id"] == group_id

        websocket.send_bytes(image_bytes)
        second_detection = websocket.receive_json()
        assert second_detection["type"] == "detection_response"

        websocket.send_json({"type": "disconnect"})

    records = client.get(
        "/attendance/records",
        headers=org_headers,
        params={"group_id": group_id},
    )
    assert records.status_code == 200, records.text
    assert len(records.json()) == 1


def test_detection_websocket_group_switch_refreshes_live_recognition_context(
    biometrics_env,
) -> None:
    client = biometrics_env["client"]
    headers = _headers("org-switch")
    first_group_id = _create_group(client, headers, "First Group")
    second_group_id = _create_group(client, headers, "Second Group")

    _create_member(
        client,
        headers,
        second_group_id,
        "switch-person",
        "Switch Person",
    )

    image_bytes = _make_image_bytes()
    enroll = client.post(
        f"/attendance/groups/{second_group_id}/persons/switch-person/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert enroll.status_code == 200, enroll.text

    from utils.websocket_manager import manager

    client_id = "group-switch-client"
    manager.face_trackers[client_id] = DummyTracker()

    with client.websocket_connect(
        f"/ws/detect/{client_id}?token=biometrics-token&organization_id=org-switch"
    ) as websocket:
        assert websocket.receive_json()["type"] == "connection"

        websocket.send_json({"type": "config", "group_id": first_group_id})
        assert websocket.receive_json()["group_id"] == first_group_id
        websocket.send_bytes(image_bytes)
        first_detection = websocket.receive_json()
        assert first_detection["type"] == "detection_response"
        assert first_detection["faces"][0]["recognition"]["success"] is False
        assert first_detection["faces"][0]["recognition"]["person_id"] is None

        websocket.send_json({"type": "config", "group_id": second_group_id})
        assert websocket.receive_json()["group_id"] == second_group_id
        websocket.send_bytes(image_bytes)
        second_detection = websocket.receive_json()
        assert second_detection["type"] == "detection_response"
        assert (
            second_detection["faces"][0]["recognition"]["person_id"] == "switch-person"
        )

        websocket.send_json({"type": "disconnect"})


def test_detection_websocket_requires_real_liveness_for_identity_when_enabled(
    biometrics_env, monkeypatch
) -> None:
    client = biometrics_env["client"]
    headers = _headers("org-strict-live")
    group_id = _create_group(client, headers, "Strict Live Group")
    _create_member(client, headers, group_id, "strict-person", "Strict Person")

    image_bytes = _make_image_bytes()
    enroll = client.post(
        f"/attendance/groups/{group_id}/persons/strict-person/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert enroll.status_code == 200, enroll.text

    suspicious_liveness = SuspiciousLivenessDetector()
    monkeypatch.setattr(core.lifespan, "liveness_detector", suspicious_liveness)
    monkeypatch.setattr(face_processing, "liveness_detector", suspicious_liveness)

    from utils.websocket_manager import manager

    client_id = "strict-live-client"
    manager.face_trackers[client_id] = DummyTracker()

    with client.websocket_connect(
        f"/ws/detect/{client_id}?token=biometrics-token&organization_id=org-strict-live"
    ) as websocket:
        assert websocket.receive_json()["type"] == "connection"

        websocket.send_json(
            {
                "type": "config",
                "group_id": group_id,
                "enable_liveness_detection": True,
            }
        )
        config_ack = websocket.receive_json()
        assert config_ack["type"] == "config_ack"

        websocket.send_bytes(image_bytes)
        detection = websocket.receive_json()
        assert detection["type"] == "detection_response"
        face = detection["faces"][0]
        assert face["liveness"]["status"] == "move_closer"
        assert "recognition" not in face

        websocket.send_json({"type": "disconnect"})

    records = client.get(
        "/attendance/records",
        headers=headers,
        params={"group_id": group_id},
    )
    assert records.status_code == 200, records.text
    assert len(records.json()) == 0


def test_detection_websocket_blocks_identity_when_face_must_be_centered(
    biometrics_env, monkeypatch
) -> None:
    client = biometrics_env["client"]
    headers = _headers("org-center-live")
    group_id = _create_group(client, headers, "Center Live Group")
    _create_member(client, headers, group_id, "center-person", "Center Person")

    image_bytes = _make_image_bytes()
    enroll = client.post(
        f"/attendance/groups/{group_id}/persons/center-person/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert enroll.status_code == 200, enroll.text

    center_face_detector = CenterFaceDetector()
    preserve_guidance_liveness = PreserveGuidanceLivenessDetector()
    monkeypatch.setattr(face_processing, "face_detector", center_face_detector)
    monkeypatch.setattr(core.lifespan, "liveness_detector", preserve_guidance_liveness)
    monkeypatch.setattr(
        face_processing, "liveness_detector", preserve_guidance_liveness
    )

    from utils.websocket_manager import manager

    client_id = "center-live-client"
    manager.face_trackers[client_id] = DummyTracker()

    with client.websocket_connect(
        f"/ws/detect/{client_id}?token=biometrics-token&organization_id=org-center-live"
    ) as websocket:
        assert websocket.receive_json()["type"] == "connection"

        websocket.send_json(
            {
                "type": "config",
                "group_id": group_id,
                "enable_liveness_detection": True,
            }
        )
        config_ack = websocket.receive_json()
        assert config_ack["type"] == "config_ack"

        websocket.send_bytes(image_bytes)
        detection = websocket.receive_json()
        assert detection["type"] == "detection_response"
        face = detection["faces"][0]
        assert face["liveness"]["status"] == "center_face"
        assert "recognition" not in face

        websocket.send_json({"type": "disconnect"})

    records = client.get(
        "/attendance/records",
        headers=headers,
        params={"group_id": group_id},
    )
    assert records.status_code == 200, records.text
    assert len(records.json()) == 0


def test_detection_websocket_logs_attendance_when_liveness_is_disabled(
    biometrics_env,
) -> None:
    client = biometrics_env["client"]
    headers = _headers("org-live-no-liveness")
    group_id = _create_group(client, headers, "No Liveness Group")
    _create_member(client, headers, group_id, "no-live-person", "No Live Person")

    image_bytes = _make_image_bytes()
    enroll = client.post(
        f"/attendance/groups/{group_id}/persons/no-live-person/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert enroll.status_code == 200, enroll.text

    from utils.websocket_manager import manager

    client_id = "live-no-liveness-client"
    manager.face_trackers[client_id] = DummyTracker()

    with client.websocket_connect(
        f"/ws/detect/{client_id}?token=biometrics-token&organization_id=org-live-no-liveness"
    ) as websocket:
        assert websocket.receive_json()["type"] == "connection"

        websocket.send_json(
            {
                "type": "config",
                "group_id": group_id,
                "enable_liveness_detection": False,
            }
        )
        config_ack = websocket.receive_json()
        assert config_ack["type"] == "config_ack"
        assert config_ack["group_id"] == group_id

        websocket.send_bytes(image_bytes)
        detection = websocket.receive_json()
        assert detection["type"] == "detection_response"
        face = detection["faces"][0]
        assert face["recognition"]["person_id"] == "no-live-person"
        assert "liveness" not in face

        attendance_event = websocket.receive_json()
        assert attendance_event["type"] == "attendance_event"
        assert attendance_event["data"]["person_id"] == "no-live-person"

        websocket.send_json({"type": "disconnect"})

    records = client.get(
        "/attendance/records",
        headers=headers,
        params={"group_id": group_id},
    )
    assert records.status_code == 200, records.text
    assert len(records.json()) == 1


def test_biometric_endpoints_reject_images_without_detectable_face(
    biometrics_env,
) -> None:
    client = biometrics_env["client"]
    org_headers = _headers("org-hardening")
    group_id = _create_group(client, org_headers, "Hardening Group")
    _create_member(
        client,
        org_headers,
        group_id,
        "hardening-person",
        "Hardening Person",
    )

    blank_image_bytes = _make_blank_image_bytes()
    metadata = _enroll_metadata()

    enroll = client.post(
        f"/attendance/groups/{group_id}/persons/hardening-person/enroll-face",
        headers=org_headers,
        data={"metadata": metadata},
        files={"image": ("blank.jpg", blank_image_bytes, "image/jpeg")},
    )
    assert enroll.status_code == 400, enroll.text
    assert "no detectable face found" in enroll.json()["detail"].lower()

    recognize = client.post(
        "/face/recognize",
        headers=org_headers,
        data={
            "metadata": json.dumps(
                {
                    "bbox": [8, 12, 42, 36],
                    "landmarks_5": [
                        [10, 10],
                        [30, 10],
                        [20, 20],
                        [12, 30],
                        [28, 30],
                    ],
                    "group_id": group_id,
                    "enable_liveness_detection": False,
                }
            )
        },
        files={"image": ("blank.jpg", blank_image_bytes, "image/jpeg")},
    )
    assert recognize.status_code == 200, recognize.text
    assert recognize.json()["success"] is False
    assert "no detectable face found" in recognize.json()["error"].lower()

    bulk = client.post(
        f"/attendance/groups/{group_id}/bulk-enroll-faces",
        headers=org_headers,
        data={
            "metadata": json.dumps(
                [
                    {
                        "person_id": "hardening-person",
                        "bbox": [8, 12, 42, 36],
                        "landmarks_5": [
                            [10, 10],
                            [30, 10],
                            [20, 20],
                            [12, 30],
                            [28, 30],
                        ],
                        "filename": "blank.jpg",
                    }
                ]
            )
        },
        files=[("images", ("blank.jpg", blank_image_bytes, "image/jpeg"))],
    )
    assert bulk.status_code == 200, bulk.text
    assert bulk.json()["success_count"] == 0
    assert bulk.json()["failed_count"] == 1
    assert "no detectable face found" in bulk.json()["results"][0]["error"].lower()


def test_recognition_and_websocket_all_groups_mode(biometrics_env) -> None:
    client = biometrics_env["client"]
    headers = _headers("org-all-groups")
    group_a = _create_group(client, headers, "Teachers")
    group_b = _create_group(client, headers, "Admins")

    _create_member(client, headers, group_a, "person-a", "Teacher Alice")
    _create_member(client, headers, group_b, "person-b", "Admin Bob")

    image_bytes = _make_image_bytes()
    enroll_a = client.post(
        f"/attendance/groups/{group_a}/persons/person-a/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face_a.jpg", image_bytes, "image/jpeg")},
    )
    assert enroll_a.status_code == 200, enroll_a.text

    enroll_b = client.post(
        f"/attendance/groups/{group_b}/persons/person-b/enroll-face",
        headers=headers,
        data={"metadata": _enroll_metadata()},
        files={"image": ("face_b.jpg", image_bytes, "image/jpeg")},
    )
    assert enroll_b.status_code == 200, enroll_b.text

    # 1. HTTP Recognition route with group_id="all" matches members across both groups
    recognize = client.post(
        "/face/recognize",
        headers=headers,
        data={
            "metadata": json.dumps(
                {
                    "bbox": [8, 12, 42, 36],
                    "landmarks_5": [
                        [10, 10],
                        [30, 10],
                        [20, 20],
                        [12, 30],
                        [28, 30],
                    ],
                    "group_id": "all",
                    "enable_liveness_detection": False,
                }
            )
        },
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert recognize.status_code == 200, recognize.text
    res_json = recognize.json()
    assert res_json["success"] is True
    assert res_json["person_id"] in ["person-a", "person-b"]

    # 2. WebSocket live stream with group_id="all"
    from utils.websocket_manager import manager

    client_id = "all-groups-client"
    manager.face_trackers[client_id] = DummyTracker()

    with client.websocket_connect(
        f"/ws/detect/{client_id}?token=biometrics-token&organization_id=org-all-groups"
    ) as websocket:
        assert websocket.receive_json()["type"] == "connection"

        websocket.send_json({"type": "config", "group_id": "all"})
        assert websocket.receive_json()["group_id"] == "all"

        websocket.send_bytes(image_bytes)
        detection = websocket.receive_json()
        assert detection["type"] == "detection_response"
        assert detection["faces"][0]["recognition"]["success"] is True
        assert detection["faces"][0]["recognition"]["person_id"] in [
            "person-a",
            "person-b",
        ]

        websocket.send_json({"type": "disconnect"})
