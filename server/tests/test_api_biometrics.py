import json
from collections import defaultdict

import cv2
import numpy as np
import pytest

import core.lifespan
from hooks import face_processing


class DummyFaceRecognizer:
    def __init__(self) -> None:
        self.registered: dict[str | None, dict[str, dict]] = defaultdict(dict)
        self.threshold = 0.5

    async def register_person(
        self,
        person_id: str,
        image: np.ndarray,
        landmarks_5: list,
        organization_id: str | None,
    ) -> dict:
        self.registered[organization_id][person_id] = {
            "shape": image.shape,
            "landmarks_5": landmarks_5,
        }
        return {
            "success": True,
            "person_id": person_id,
            "total_persons": len(self.registered[organization_id]),
        }

    async def get_all_persons(self, organization_id: str | None) -> list[str]:
        return sorted(self.registered[organization_id].keys())

    async def get_stats(self, organization_id: str | None) -> dict:
        return {
            "total_persons": len(self.registered[organization_id]),
            "threshold": self.threshold,
        }

    async def recognize_face(
        self,
        image: np.ndarray,
        landmarks_5: list,
        allowed_person_ids: list[str],
        organization_id: str | None,
    ) -> dict:
        for person_id in allowed_person_ids:
            if person_id in self.registered[organization_id]:
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
        allowed_person_ids: list[str],
        organization_id: str | None,
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
        removed = self.registered[organization_id].pop(person_id, None)
        return {
            "success": removed is not None,
            "total_persons": len(self.registered[organization_id]),
            "error": None if removed is not None else "Person not found",
        }

    async def update_person_id(
        self, old_person_id: str, new_person_id: str, organization_id: str | None
    ) -> dict:
        existing = self.registered[organization_id].pop(old_person_id, None)
        if existing is None:
            return {"success": False, "message": "No biometric data for person"}
        self.registered[organization_id][new_person_id] = existing
        return {"success": True, "updated_records": 1}

    async def clear_database(self, organization_id: str | None) -> dict:
        self.registered[organization_id].clear()
        return {"success": True}

    def invalidate_cache(self, organization_id: str | None) -> None:
        return None

    def set_similarity_threshold(self, threshold: float) -> None:
        self.threshold = threshold


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
    *,
    has_consent: bool,
) -> None:
    response = client.post(
        "/attendance/members",
        headers=headers,
        json={
            "person_id": person_id,
            "group_id": group_id,
            "name": name,
            "has_consent": has_consent,
            "consent_granted_by": "integration-test" if has_consent else None,
        },
    )
    assert response.status_code == 200, response.text


def _register_metadata(enable_liveness_detection: bool = False) -> str:
    return json.dumps(
        {
            "bbox": [8, 12, 42, 36],
            "landmarks_5": [[10, 10], [30, 10], [20, 20], [12, 30], [28, 30]],
            "enable_liveness_detection": enable_liveness_detection,
        }
    )


def test_register_and_list_face_data_stays_org_scoped(biometrics_env) -> None:
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
        has_consent=True,
    )
    _create_member(
        client,
        org_two_headers,
        group_two_id,
        "shared-person",
        "Bob Org Two",
        has_consent=True,
    )

    image_bytes = _make_image_bytes()
    metadata = _register_metadata()

    register_one = client.post(
        f"/attendance/groups/{group_one_id}/persons/shared-person/register-face",
        headers=org_one_headers,
        data={"metadata": metadata},
        files={"image": ("face-one.jpg", image_bytes, "image/jpeg")},
    )
    register_two = client.post(
        f"/attendance/groups/{group_two_id}/persons/shared-person/register-face",
        headers=org_two_headers,
        data={"metadata": metadata},
        files={"image": ("face-two.jpg", image_bytes, "image/jpeg")},
    )
    assert register_one.status_code == 200, register_one.text
    assert register_two.status_code == 200, register_two.text

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


def test_recognition_is_org_scoped_and_masks_nonconsenting_member(
    biometrics_env,
) -> None:
    client = biometrics_env["client"]
    fake_recognizer = biometrics_env["recognizer"]
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
        has_consent=True,
    )
    _create_member(
        client,
        org_two_headers,
        group_two_id,
        "shared-person",
        "Bob Org Two",
        has_consent=False,
    )

    image_bytes = _make_image_bytes()
    register_metadata = _register_metadata()

    for group_id, headers in (
        (group_one_id, org_one_headers),
        (group_two_id, org_two_headers),
    ):
        response = client.post(
            f"/attendance/groups/{group_id}/persons/shared-person/register-face",
            headers=headers,
            data={"metadata": register_metadata},
            files={"image": ("face.jpg", image_bytes, "image/jpeg")},
        )
        if headers is org_one_headers:
            assert response.status_code == 200, response.text
        else:
            assert response.status_code == 403, response.text

    fake_recognizer.registered["org-two"]["shared-person"] = {"shape": (48, 48, 3)}

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
    assert recognized_two.json()["success"] is True
    assert recognized_two.json()["person_id"] == "PROTECTED_IDENTITY"
    assert recognized_two.json()["error"] == "Biometric consent missing"


def test_detection_websocket_processes_frame_bytes(biometrics_env) -> None:
    client = biometrics_env["client"]
    org_headers = _headers("org-ws")
    group_id = _create_group(client, org_headers, "WebSocket Group")
    _create_member(
        client, org_headers, group_id, "ws-person", "WebSocket Person", has_consent=True
    )

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
    _create_member(
        client, org_headers, group_id, "live-person", "Live Person", has_consent=True
    )

    image_bytes = _make_image_bytes()
    register = client.post(
        f"/attendance/groups/{group_id}/persons/live-person/register-face",
        headers=org_headers,
        data={"metadata": _register_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert register.status_code == 200, register.text

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
        assert face["recognition"]["has_consent"] is True

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
        has_consent=True,
    )

    image_bytes = _make_image_bytes()
    register = client.post(
        f"/attendance/groups/{second_group_id}/persons/switch-person/register-face",
        headers=headers,
        data={"metadata": _register_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert register.status_code == 200, register.text

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
    _create_member(
        client, headers, group_id, "strict-person", "Strict Person", has_consent=True
    )

    image_bytes = _make_image_bytes()
    register = client.post(
        f"/attendance/groups/{group_id}/persons/strict-person/register-face",
        headers=headers,
        data={"metadata": _register_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert register.status_code == 200, register.text

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
    _create_member(
        client, headers, group_id, "center-person", "Center Person", has_consent=True
    )

    image_bytes = _make_image_bytes()
    register = client.post(
        f"/attendance/groups/{group_id}/persons/center-person/register-face",
        headers=headers,
        data={"metadata": _register_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert register.status_code == 200, register.text

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
    _create_member(
        client, headers, group_id, "no-live-person", "No Live Person", has_consent=True
    )

    image_bytes = _make_image_bytes()
    register = client.post(
        f"/attendance/groups/{group_id}/persons/no-live-person/register-face",
        headers=headers,
        data={"metadata": _register_metadata()},
        files={"image": ("face.jpg", image_bytes, "image/jpeg")},
    )
    assert register.status_code == 200, register.text

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
        has_consent=True,
    )

    blank_image_bytes = _make_blank_image_bytes()
    metadata = _register_metadata()

    register = client.post(
        f"/attendance/groups/{group_id}/persons/hardening-person/register-face",
        headers=org_headers,
        data={"metadata": metadata},
        files={"image": ("blank.jpg", blank_image_bytes, "image/jpeg")},
    )
    assert register.status_code == 400, register.text
    assert "no detectable face found" in register.json()["detail"].lower()

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
        f"/attendance/groups/{group_id}/bulk-register-faces",
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
