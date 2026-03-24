import asyncio
import os
import tempfile
import unittest
from contextlib import asynccontextmanager

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.deps import get_db
from database.models import Base
import database.session as database_session
from main import app
from utils.websocket_manager import manager, notification_manager


class AttendanceApiSmokeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "attendance-smoke.db")
        self.engine = create_async_engine(
            f"sqlite+aiosqlite:///{self.db_path}",
            connect_args={"check_same_thread": False},
        )
        asyncio.run(self._create_schema())
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)

        self.original_token = os.environ.get("FACENOX_API_TOKEN")
        os.environ["FACENOX_API_TOKEN"] = "smoke-token"

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

        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self) -> None:
        try:
            self.client.__exit__(None, None, None)
        finally:
            app.dependency_overrides.clear()
            app.router.lifespan_context = self.original_lifespan
            database_session.AsyncSessionLocal = self.original_session_local

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
            "X-Facenox-Token": "smoke-token",
            "X-Facenox-Organization": organization_id,
        }

    def test_org_scoped_http_flow_supports_same_person_id_across_orgs(self) -> None:
        org_one_headers = self._headers("org-one")
        org_two_headers = self._headers("org-two")

        group_one = self.client.post(
            "/attendance/groups",
            headers=org_one_headers,
            json={"name": "Org One Group"},
        )
        self.assertEqual(group_one.status_code, 200, group_one.text)
        group_one_id = group_one.json()["id"]

        group_two = self.client.post(
            "/attendance/groups",
            headers=org_two_headers,
            json={"name": "Org Two Group"},
        )
        self.assertEqual(group_two.status_code, 200, group_two.text)
        group_two_id = group_two.json()["id"]

        member_one = self.client.post(
            "/attendance/members",
            headers=org_one_headers,
            json={
                "person_id": "shared-person",
                "group_id": group_one_id,
                "name": "Alice Org One",
                "has_consent": True,
                "consent_granted_by": "smoke-test",
            },
        )
        self.assertEqual(member_one.status_code, 200, member_one.text)

        member_two = self.client.post(
            "/attendance/members",
            headers=org_two_headers,
            json={
                "person_id": "shared-person",
                "group_id": group_two_id,
                "name": "Bob Org Two",
                "has_consent": True,
                "consent_granted_by": "smoke-test",
            },
        )
        self.assertEqual(member_two.status_code, 200, member_two.text)

        fetched_one = self.client.get(
            "/attendance/members/shared-person", headers=org_one_headers
        )
        fetched_two = self.client.get(
            "/attendance/members/shared-person", headers=org_two_headers
        )
        self.assertEqual(fetched_one.status_code, 200, fetched_one.text)
        self.assertEqual(fetched_two.status_code, 200, fetched_two.text)
        self.assertEqual(fetched_one.json()["name"], "Alice Org One")
        self.assertEqual(fetched_two.json()["name"], "Bob Org Two")
        self.assertEqual(fetched_one.json()["group_id"], group_one_id)
        self.assertEqual(fetched_two.json()["group_id"], group_two_id)

        event_one = self.client.post(
            "/attendance/events",
            headers=org_one_headers,
            json={
                "person_id": "shared-person",
                "confidence": 0.99,
                "location": "camera-one",
            },
        )
        event_two = self.client.post(
            "/attendance/events",
            headers=org_two_headers,
            json={
                "person_id": "shared-person",
                "confidence": 0.97,
                "location": "camera-two",
            },
        )
        self.assertEqual(event_one.status_code, 200, event_one.text)
        self.assertEqual(event_two.status_code, 200, event_two.text)
        self.assertTrue(event_one.json()["processed"])
        self.assertTrue(event_two.json()["processed"])
        self.assertEqual(event_one.json()["group_id"], group_one_id)
        self.assertEqual(event_two.json()["group_id"], group_two_id)

        records_one = self.client.get("/attendance/records", headers=org_one_headers)
        records_two = self.client.get("/attendance/records", headers=org_two_headers)
        self.assertEqual(records_one.status_code, 200, records_one.text)
        self.assertEqual(records_two.status_code, 200, records_two.text)
        self.assertEqual(len(records_one.json()), 1)
        self.assertEqual(len(records_two.json()), 1)
        self.assertEqual(records_one.json()[0]["group_id"], group_one_id)
        self.assertEqual(records_two.json()[0]["group_id"], group_two_id)

        export_one = self.client.post("/attendance/export", headers=org_one_headers)
        export_two = self.client.post("/attendance/export", headers=org_two_headers)
        self.assertEqual(export_one.status_code, 200, export_one.text)
        self.assertEqual(export_two.status_code, 200, export_two.text)

        export_one_data = export_one.json()
        export_two_data = export_two.json()
        self.assertEqual(
            [group["id"] for group in export_one_data["groups"]], [group_one_id]
        )
        self.assertEqual(
            [group["id"] for group in export_two_data["groups"]], [group_two_id]
        )
        self.assertEqual(
            [member["name"] for member in export_one_data["members"]],
            ["Alice Org One"],
        )
        self.assertEqual(
            [member["name"] for member in export_two_data["members"]],
            ["Bob Org Two"],
        )
        self.assertEqual(
            [record["location"] for record in export_one_data["records"]],
            ["camera-one"],
        )
        self.assertEqual(
            [record["location"] for record in export_two_data["records"]],
            ["camera-two"],
        )
        self.assertEqual(
            [session["group_id"] for session in export_one_data["sessions"]],
            [group_one_id],
        )
        self.assertEqual(
            [session["group_id"] for session in export_two_data["sessions"]],
            [group_two_id],
        )

    def test_detect_websocket_requires_token_and_accepts_scoped_client(self) -> None:
        with self.assertRaises(WebSocketDisconnect) as unauthorized:
            with self.client.websocket_connect(
                "/ws/detect/unauthorized-client?organization_id=org-ws"
            ):
                pass
        self.assertEqual(unauthorized.exception.code, 1008)

        client_id = "authorized-client"
        manager.face_trackers[client_id] = object()

        with self.client.websocket_connect(
            f"/ws/detect/{client_id}?token=smoke-token&organization_id=org-ws"
        ) as websocket:
            connection_message = websocket.receive_json()
            self.assertEqual(connection_message["type"], "connection")
            self.assertEqual(connection_message["client_id"], client_id)

            websocket.send_json({"type": "ping"})
            pong_message = websocket.receive_json()
            self.assertEqual(pong_message["type"], "pong")
            self.assertEqual(pong_message["client_id"], client_id)

            websocket.send_json({"type": "disconnect"})

        self.assertNotIn(client_id, manager.active_connections)


if __name__ == "__main__":
    unittest.main()
