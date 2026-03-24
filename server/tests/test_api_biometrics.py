import asyncio
import json
import os
import tempfile
import unittest
from collections import defaultdict
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.deps import get_db
from database.models import Base
import database.session as database_session
from main import app
import core.lifespan
from hooks import face_processing
from utils.websocket_manager import manager, notification_manager


class DummyFaceRecognizer:
    def __init__(self) -> None:
        self.registered: dict[str | None, dict[str, dict]] = defaultdict(dict)
        self.threshold = 0.4

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
            "bbox": {"x": 8, "y": 12, "width": 42, "height": 36},
            "confidence": 0.98,
            "landmarks_5": [[10, 10], [30, 10], [20, 20], [12, 30], [28, 30]],
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


class DummyTracker:
    def update(self, faces: list[dict], _frame_rate: int | None) -> list[dict]:
        tracked = []
        for index, face in enumerate(faces, start=1):
            current = dict(face)
            current["track_id"] = index
            tracked.append(current)
        return tracked


class AttendanceBiometricsIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "attendance-biometrics.db")
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{self.db_path}",
            connect_args={"check_same_thread": False},
        )
        asyncio.run(self._create_schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)

        self.original_token = os.environ.get("FACENOX_API_TOKEN")
        os.environ["FACENOX_API_TOKEN"] = "biometrics-token"

        self.original_session_local = database_session.AsyncSessionLocal
        database_session.AsyncSessionLocal = self.Session

        self.original_lifespan = app.router.lifespan_context

        @asynccontextmanager
        async def no_op_lifespan(_app):
            yield

        app.router.lifespan_context = no_op_lifespan

        async def override_get_db():
            async with self.Session() as session:
                try:
                    yield session
                finally:
                    await session.close()

        app.dependency_overrides[get_db] = override_get_db

        self.original_face_recognizer = core.lifespan.face_recognizer
        self.original_liveness_detector = core.lifespan.liveness_detector
        self.original_face_detector = face_processing.face_detector
        self.original_processing_liveness = face_processing.liveness_detector
        self.original_processing_recognizer = face_processing.face_recognizer

        self.fake_recognizer = DummyFaceRecognizer()
        self.fake_detector = DummyFaceDetector()
        self.fake_liveness = DummyLivenessDetector()

        core.lifespan.face_recognizer = self.fake_recognizer
        core.lifespan.liveness_detector = self.fake_liveness
        face_processing.face_detector = self.fake_detector
        face_processing.liveness_detector = self.fake_liveness
        face_processing.face_recognizer = self.fake_recognizer

        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        try:
            self.client.__exit__(None, None, None)
        finally:
            app.dependency_overrides.clear()
            app.router.lifespan_context = self.original_lifespan
            database_session.AsyncSessionLocal = self.original_session_local

            core.lifespan.face_recognizer = self.original_face_recognizer
            core.lifespan.liveness_detector = self.original_liveness_detector
            face_processing.face_detector = self.original_face_detector
            face_processing.liveness_detector = self.original_processing_liveness
            face_processing.face_recognizer = self.original_processing_recognizer

            if self.original_token is None:
                os.environ.pop("FACENOX_API_TOKEN", None)
            else:
                os.environ["FACENOX_API_TOKEN"] = self.original_token

            manager.active_connections.clear()
            manager.connection_metadata.clear()
            manager.streaming_tasks.clear()
            manager.fps_tracking.clear()
            manager.face_trackers.clear()
            notification_manager.active_connections.clear()
            notification_manager.connection_metadata.clear()
            notification_manager.streaming_tasks.clear()
            notification_manager.fps_tracking.clear()
            notification_manager.face_trackers.clear()

            asyncio.run(self.engine.dispose())
            self.temp_dir.cleanup()

    async def _create_schema(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    def _headers(self, organization_id: str) -> dict[str, str]:
        return {
            "X-Facenox-Token": "biometrics-token",
            "X-Facenox-Organization": organization_id,
        }

    def _make_image_bytes(self) -> bytes:
        x = np.linspace(0, 255, 48, dtype=np.uint8)
        image = np.tile(x, (48, 1))
        image = np.stack([image, np.flipud(image), image], axis=-1)
        ok, encoded = cv2.imencode(".jpg", image)
        self.assertTrue(ok)
        return encoded.tobytes()

    def _make_blank_image_bytes(self) -> bytes:
        image = np.zeros((48, 48, 3), dtype=np.uint8)
        ok, encoded = cv2.imencode(".jpg", image)
        self.assertTrue(ok)
        return encoded.tobytes()

    def _create_group(self, headers: dict[str, str], name: str) -> str:
        response = self.client.post(
            "/attendance/groups",
            headers=headers,
            json={"name": name},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["id"]

    def _create_member(
        self,
        headers: dict[str, str],
        group_id: str,
        person_id: str,
        name: str,
        *,
        has_consent: bool,
    ) -> None:
        response = self.client.post(
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
        self.assertEqual(response.status_code, 200, response.text)

    def test_register_and_list_face_data_stays_org_scoped(self) -> None:
        org_one_headers = self._headers("org-one")
        org_two_headers = self._headers("org-two")
        group_one_id = self._create_group(org_one_headers, "Biometrics One")
        group_two_id = self._create_group(org_two_headers, "Biometrics Two")

        self._create_member(
            org_one_headers,
            group_one_id,
            "shared-person",
            "Alice Org One",
            has_consent=True,
        )
        self._create_member(
            org_two_headers,
            group_two_id,
            "shared-person",
            "Bob Org Two",
            has_consent=True,
        )

        image_bytes = self._make_image_bytes()
        metadata = json.dumps(
            {
                "bbox": [8, 12, 42, 36],
                "landmarks_5": [[10, 10], [30, 10], [20, 20], [12, 30], [28, 30]],
                "enable_liveness_detection": False,
            }
        )

        register_one = self.client.post(
            f"/attendance/groups/{group_one_id}/persons/shared-person/register-face",
            headers=org_one_headers,
            data={"metadata": metadata},
            files={"image": ("face-one.jpg", image_bytes, "image/jpeg")},
        )
        register_two = self.client.post(
            f"/attendance/groups/{group_two_id}/persons/shared-person/register-face",
            headers=org_two_headers,
            data={"metadata": metadata},
            files={"image": ("face-two.jpg", image_bytes, "image/jpeg")},
        )
        self.assertEqual(register_one.status_code, 200, register_one.text)
        self.assertEqual(register_two.status_code, 200, register_two.text)

        persons_one = self.client.get("/face/persons", headers=org_one_headers)
        persons_two = self.client.get("/face/persons", headers=org_two_headers)
        self.assertEqual(persons_one.status_code, 200, persons_one.text)
        self.assertEqual(persons_two.status_code, 200, persons_two.text)
        self.assertEqual(persons_one.json()["persons"], ["shared-person"])
        self.assertEqual(persons_two.json()["persons"], ["shared-person"])
        self.assertEqual(persons_one.json()["stats"]["total_persons"], 1)
        self.assertEqual(persons_two.json()["stats"]["total_persons"], 1)

        group_persons_one = self.client.get(
            f"/attendance/groups/{group_one_id}/persons",
            headers=org_one_headers,
        )
        group_persons_two = self.client.get(
            f"/attendance/groups/{group_two_id}/persons",
            headers=org_two_headers,
        )
        self.assertEqual(group_persons_one.status_code, 200, group_persons_one.text)
        self.assertEqual(group_persons_two.status_code, 200, group_persons_two.text)
        self.assertTrue(group_persons_one.json()[0]["has_face_data"])
        self.assertTrue(group_persons_two.json()[0]["has_face_data"])

    def test_recognition_is_org_scoped_and_masks_nonconsenting_member(self) -> None:
        org_one_headers = self._headers("org-one")
        org_two_headers = self._headers("org-two")
        group_one_id = self._create_group(org_one_headers, "Recognition One")
        group_two_id = self._create_group(org_two_headers, "Recognition Two")

        self._create_member(
            org_one_headers,
            group_one_id,
            "shared-person",
            "Alice Org One",
            has_consent=True,
        )
        self._create_member(
            org_two_headers,
            group_two_id,
            "shared-person",
            "Bob Org Two",
            has_consent=False,
        )

        image_bytes = self._make_image_bytes()
        register_metadata = json.dumps(
            {
                "bbox": [8, 12, 42, 36],
                "landmarks_5": [[10, 10], [30, 10], [20, 20], [12, 30], [28, 30]],
                "enable_liveness_detection": False,
            }
        )

        for group_id, headers in (
            (group_one_id, org_one_headers),
            (group_two_id, org_two_headers),
        ):
            response = self.client.post(
                f"/attendance/groups/{group_id}/persons/shared-person/register-face",
                headers=headers,
                data={"metadata": register_metadata},
                files={"image": ("face.jpg", image_bytes, "image/jpeg")},
            )
            if headers is org_one_headers:
                self.assertEqual(response.status_code, 200, response.text)
            else:
                self.assertEqual(response.status_code, 403, response.text)

        # Seed a biometric in org-two so recognition can return a person_id and hit the privacy mask.
        self.fake_recognizer.registered["org-two"]["shared-person"] = {
            "shape": (48, 48, 3)
        }

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

        recognized_one = self.client.post(
            "/face/recognize",
            headers=org_one_headers,
            data={"metadata": recognize_metadata_one},
            files={"image": ("recognize-one.jpg", image_bytes, "image/jpeg")},
        )
        recognized_two = self.client.post(
            "/face/recognize",
            headers=org_two_headers,
            data={"metadata": recognize_metadata_two},
            files={"image": ("recognize-two.jpg", image_bytes, "image/jpeg")},
        )
        self.assertEqual(recognized_one.status_code, 200, recognized_one.text)
        self.assertEqual(recognized_two.status_code, 200, recognized_two.text)
        self.assertTrue(recognized_one.json()["success"])
        self.assertEqual(recognized_one.json()["person_id"], "shared-person")
        self.assertTrue(recognized_two.json()["success"])
        self.assertEqual(recognized_two.json()["person_id"], "PROTECTED_IDENTITY")
        self.assertEqual(recognized_two.json()["error"], "Biometric consent missing")

    def test_detection_websocket_processes_frame_bytes(self) -> None:
        org_headers = self._headers("org-ws")
        group_id = self._create_group(org_headers, "WebSocket Group")
        self._create_member(
            org_headers,
            group_id,
            "ws-person",
            "WebSocket Person",
            has_consent=True,
        )

        client_id = "frame-client"
        manager.face_trackers[client_id] = DummyTracker()
        image_bytes = self._make_image_bytes()

        with self.client.websocket_connect(
            f"/ws/detect/{client_id}?token=biometrics-token&organization_id=org-ws"
        ) as websocket:
            connected = websocket.receive_json()
            self.assertEqual(connected["type"], "connection")

            websocket.send_bytes(image_bytes)
            detection = websocket.receive_json()
            self.assertEqual(detection["type"], "detection_response")
            self.assertTrue(detection["success"])
            self.assertEqual(len(detection["faces"]), 1)
            self.assertEqual(detection["faces"][0]["bbox"], [8, 12, 42, 36])
            self.assertEqual(detection["faces"][0]["track_id"], 1)
            self.assertEqual(detection["faces"][0]["liveness"]["status"], "real")

            websocket.send_json({"type": "disconnect"})

    def test_biometric_endpoints_reject_images_without_detectable_face(self) -> None:
        org_headers = self._headers("org-hardening")
        group_id = self._create_group(org_headers, "Hardening Group")
        self._create_member(
            org_headers,
            group_id,
            "hardening-person",
            "Hardening Person",
            has_consent=True,
        )

        blank_image_bytes = self._make_blank_image_bytes()
        metadata = json.dumps(
            {
                "bbox": [8, 12, 42, 36],
                "landmarks_5": [[10, 10], [30, 10], [20, 20], [12, 30], [28, 30]],
                "enable_liveness_detection": False,
            }
        )

        register = self.client.post(
            f"/attendance/groups/{group_id}/persons/hardening-person/register-face",
            headers=org_headers,
            data={"metadata": metadata},
            files={"image": ("blank.jpg", blank_image_bytes, "image/jpeg")},
        )
        self.assertEqual(register.status_code, 400, register.text)
        self.assertIn("no detectable face found", register.json()["detail"].lower())

        recognize = self.client.post(
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
        self.assertEqual(recognize.status_code, 200, recognize.text)
        self.assertFalse(recognize.json()["success"])
        self.assertIn("no detectable face found", recognize.json()["error"].lower())

        bulk = self.client.post(
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
        self.assertEqual(bulk.status_code, 200, bulk.text)
        self.assertEqual(bulk.json()["success_count"], 0)
        self.assertEqual(bulk.json()["failed_count"], 1)
        self.assertIn(
            "no detectable face found",
            bulk.json()["results"][0]["error"].lower(),
        )


if __name__ == "__main__":
    unittest.main()
