import pytest
from datetime import datetime, timedelta
from collections import defaultdict
from sqlalchemy import select

import core.lifespan
from database.models import (
    AttendanceGroup,
    AttendanceMember,
    AttendanceRecord,
    AttendanceSession,
    AttendanceSettings,
    Face,
)
from database.repository import AttendanceRepository, FaceRepository


class DummyFaceRecognizer:
    def __init__(self) -> None:
        self.enrolled = defaultdict(dict)
        self.refreshed_orgs = []

    async def remove_person(self, person_id: str, organization_id: str | None) -> dict:
        removed = self.enrolled[organization_id].pop(person_id, None)
        return {
            "success": True,
            "error": None if removed is not None else "Person not found",
        }

    async def refresh_cache(self, organization_id: str | None) -> None:
        self.refreshed_orgs.append(organization_id)

    async def clear_database(self, organization_id: str | None) -> dict:
        self.enrolled[organization_id].clear()
        return {"success": True}


@pytest.fixture
def maintenance_env(test_client, set_api_token, monkeypatch):
    client, session_factory = test_client
    set_api_token("maintenance-token")

    fake_recognizer = DummyFaceRecognizer()
    monkeypatch.setattr(core.lifespan, "face_recognizer", fake_recognizer)

    return {
        "client": client,
        "session_factory": session_factory,
        "recognizer": fake_recognizer,
    }


def _headers(organization_id: str) -> dict[str, str]:
    return {
        "X-Facenox-Token": "maintenance-token",
        "X-Facenox-Organization": organization_id,
    }


@pytest.mark.asyncio
async def test_cleanup_old_data(maintenance_env) -> None:
    client = maintenance_env["client"]
    session_factory = maintenance_env["session_factory"]

    # Setup database contents for org-1
    async with session_factory() as session:
        repo = AttendanceRepository(session, organization_id="org-1")
        # Create group and member
        await repo.create_group({"id": "group-1", "name": "Morning Group"})
        await repo.add_member(
            {"person_id": "member-1", "group_id": "group-1", "name": "Alice"}
        )

        # Record 40 days ago (to be cleaned up)
        await repo.add_record(
            {
                "id": "rec-old",
                "person_id": "member-1",
                "group_id": "group-1",
                "timestamp": datetime.now() - timedelta(days=40),
                "confidence": 0.9,
            }
        )
        # Record today (to keep)
        await repo.add_record(
            {
                "id": "rec-new",
                "person_id": "member-1",
                "group_id": "group-1",
                "timestamp": datetime.now(),
                "confidence": 0.95,
            }
        )

        # Session 40 days ago
        await repo.upsert_session(
            {
                "id": "sess-old",
                "person_id": "member-1",
                "group_id": "group-1",
                "date": (datetime.now() - timedelta(days=40)).strftime("%Y-%m-%d"),
                "status": "present",
            }
        )
        # Session today
        await repo.upsert_session(
            {
                "id": "sess-new",
                "person_id": "member-1",
                "group_id": "group-1",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "status": "present",
            }
        )
        await session.commit()

    # Call endpoint /cleanup with days_to_keep=30
    response = client.post(
        "/attendance/cleanup",
        headers=_headers("org-1"),
        json={"days_to_keep": 30},
    )
    assert response.status_code == 200, response.text
    assert "Cleanup successful" in response.json()["message"]

    # Assert DB content
    async with session_factory() as session:
        repo = AttendanceRepository(session, organization_id="org-1")
        records = await repo.get_records()
        sessions = await repo.get_sessions()

        assert len(records) == 1
        assert records[0].id == "rec-new"

        assert len(sessions) == 1
        assert sessions[0].id == "sess-new"


@pytest.mark.asyncio
async def test_remote_wipe(maintenance_env) -> None:
    client = maintenance_env["client"]
    session_factory = maintenance_env["session_factory"]
    recognizer = maintenance_env["recognizer"]

    # Set up face enrollment in mock recognizer
    recognizer.enrolled["org-1"]["member-1"] = {"face": True}

    async with session_factory() as session:
        repo = AttendanceRepository(session, organization_id="org-1")
        face_repo = FaceRepository(session, organization_id="org-1")

        await repo.create_group({"id": "group-1", "name": "Morning Group"})
        await repo.add_member(
            {"person_id": "member-1", "group_id": "group-1", "name": "Alice"}
        )
        await repo.add_record(
            {
                "id": "rec-1",
                "person_id": "member-1",
                "group_id": "group-1",
                "timestamp": datetime.now(),
                "confidence": 0.9,
            }
        )
        await repo.upsert_session(
            {
                "id": "sess-1",
                "person_id": "member-1",
                "group_id": "group-1",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "status": "present",
            }
        )
        # Add face to DB
        await face_repo.upsert_face("member-1", b"emb-data", 128)
        await session.commit()

    # Call wipe endpoint
    response = client.post("/attendance/wipe", headers=_headers("org-1"))
    assert response.status_code == 200, response.text
    assert "Remote wipe completed" in response.json()["message"]

    # Assertions
    async with session_factory() as session:
        # DB: records and sessions should be deleted
        res_rec = await session.execute(select(AttendanceRecord))
        assert len(res_rec.scalars().all()) == 0

        res_sess = await session.execute(select(AttendanceSession))
        assert len(res_sess.scalars().all()) == 0

        # Members and groups soft-deleted
        res_m = await session.execute(select(AttendanceMember))
        members = res_m.scalars().all()
        assert len(members) == 1
        assert members[0].is_deleted is True
        assert members[0].is_active is False

        res_g = await session.execute(select(AttendanceGroup))
        groups = res_g.scalars().all()
        assert len(groups) == 1
        assert groups[0].is_deleted is True
        assert groups[0].is_active is False

    # Mock recognizer cleared
    assert "member-1" not in recognizer.enrolled["org-1"]


@pytest.mark.asyncio
async def test_unpair(maintenance_env) -> None:
    client = maintenance_env["client"]
    session_factory = maintenance_env["session_factory"]

    # Seed paired settings
    async with session_factory() as session:
        settings = AttendanceSettings(
            id=1,
            organization_id="org-1",
            late_threshold_minutes=15,
        )
        session.add(settings)
        await session.commit()

    # Call unpair endpoint
    response = client.post("/attendance/unpair", headers=_headers("org-1"))
    assert response.status_code == 200, response.text
    assert "unpaired successfully" in response.json()["message"]

    # Verify organization_id is None
    async with session_factory() as session:
        result = await session.execute(select(AttendanceSettings))
        settings_rows = result.scalars().all()
        assert len(settings_rows) == 1
        assert settings_rows[0].organization_id is None


@pytest.mark.asyncio
async def test_purge_history(maintenance_env) -> None:
    client = maintenance_env["client"]
    session_factory = maintenance_env["session_factory"]

    async with session_factory() as session:
        repo = AttendanceRepository(session, organization_id="org-1")
        await repo.create_group({"id": "group-1", "name": "Morning Group"})
        await repo.add_member(
            {"person_id": "member-1", "group_id": "group-1", "name": "Alice"}
        )
        await repo.add_record(
            {
                "id": "rec-1",
                "person_id": "member-1",
                "group_id": "group-1",
                "timestamp": datetime.now(),
                "confidence": 0.9,
            }
        )
        await repo.upsert_session(
            {
                "id": "sess-1",
                "person_id": "member-1",
                "group_id": "group-1",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "status": "present",
            }
        )
        await session.commit()

    # Call purge history endpoint
    response = client.post("/attendance/purge-history", headers=_headers("org-1"))
    assert response.status_code == 200, response.text
    assert "Purged successfully" in response.json()["message"]

    # Assertions
    async with session_factory() as session:
        # Records and sessions are gone
        res_rec = await session.execute(select(AttendanceRecord))
        assert len(res_rec.scalars().all()) == 0

        res_sess = await session.execute(select(AttendanceSession))
        assert len(res_sess.scalars().all()) == 0

        # Members and groups remain intact
        res_m = await session.execute(select(AttendanceMember))
        members = res_m.scalars().all()
        assert len(members) == 1
        assert members[0].is_deleted is False
        assert members[0].is_active is True


@pytest.mark.asyncio
async def test_import_metadata_sync_pruning_and_consent_preservation(
    maintenance_env,
) -> None:
    client = maintenance_env["client"]
    session_factory = maintenance_env["session_factory"]
    recognizer = maintenance_env["recognizer"]

    # Seed mock face recognizer
    recognizer.enrolled["org-1"]["member-1"] = {"face": True}
    recognizer.enrolled["org-1"]["member-2"] = {"face": True}
    recognizer.enrolled["org-1"]["member-3"] = {"face": True}
    recognizer.enrolled["org-1"]["member-4"] = {"face": True}

    async with session_factory() as session:
        repo = AttendanceRepository(session, organization_id="org-1")
        face_repo = FaceRepository(session, organization_id="org-1")

        # Group 1, Member 1, Face 1
        await repo.create_group({"id": "group-1", "name": "Morning Group"})
        await repo.add_member(
            {
                "person_id": "member-1",
                "group_id": "group-1",
                "name": "Alice",
                "has_consent": True,
            }
        )
        await face_repo.upsert_face("member-1", b"AliceEmb", 128)

        # Member 4 in Group 1 (will be pruned individually because G1 is kept, but member-4 is not in pulled list)
        await repo.add_member(
            {
                "person_id": "member-4",
                "group_id": "group-1",
                "name": "David",
                "has_consent": True,
            }
        )
        await face_repo.upsert_face("member-4", b"DavidEmb", 128)

        # Group 2, Member 2, Face 2
        await repo.create_group({"id": "group-2", "name": "Evening Group"})
        await repo.add_member(
            {
                "person_id": "member-2",
                "group_id": "group-2",
                "name": "Bob",
                "has_consent": True,
            }
        )
        await face_repo.upsert_face("member-2", b"BobEmb", 128)

        # Group 3, Member 3, Face 3 (will be pruned via group deletion)
        await repo.create_group({"id": "group-3", "name": "Night Group"})
        await repo.add_member(
            {
                "person_id": "member-3",
                "group_id": "group-3",
                "name": "Charlie",
                "has_consent": True,
            }
        )
        await face_repo.upsert_face("member-3", b"CharlieEmb", 128)

        await session.commit()

    # Define import-metadata payload
    # G1 and G2 are pulled (G3 is missing => G3 and Charlie should be pruned)
    # Alice has_consent remains True (cloud True => local True, no change)
    # Bob has_consent: cloud sends False, but local is True => local consent preserved (NOT revoked)
    # Consent revocation via pull is blocked to prevent breaking recognition for
    # members enrolled before cloud pairing. True revocations require is_active=False.
    # David (member-4) is missing => David should be pruned and counted in pruned_faces
    import_payload = {
        "groups": [
            {"id": "group-1", "name": "Morning Group Updated", "is_active": True},
            {"id": "group-2", "name": "Evening Group", "is_active": True},
        ],
        "members": [
            {
                "person_id": "member-1",
                "group_id": "group-1",
                "name": "Alice",
                "is_active": True,
                "has_consent": True,
            },
            {
                "person_id": "member-2",
                "group_id": "group-2",
                "name": "Bob",
                "is_active": True,
                "has_consent": False,  # Cloud sends False, but local True is preserved
            },
        ],
    }

    # Call import-metadata
    response = client.post(
        "/attendance/import-metadata",
        headers=_headers("org-1"),
        json=import_payload,
    )
    assert response.status_code == 200, response.text
    res_data = response.json()

    assert res_data["success"] is True
    assert res_data["groups_count"] == 2
    assert res_data["members_count"] == 2
    assert (
        res_data["pruned_faces"] == 1
    )  # David's face pruned (Charlie was pruned via group deletion)
    assert (
        res_data["erased_faces"] == 0
    )  # Bob's face NOT erased — local consent preserved

    # Verify DB state
    async with session_factory() as session:
        # Group 3 soft-deleted
        g3 = await session.get(AttendanceGroup, "group-3")
        assert g3.is_deleted is True
        assert g3.is_active is False

        # Group 1 updated
        g1 = await session.get(AttendanceGroup, "group-1")
        assert g1.name == "Morning Group Updated"

        # Member 3 (Charlie) soft-deleted
        res_charlie = await session.execute(
            select(AttendanceMember).where(AttendanceMember.person_id == "member-3")
        )
        charlie = res_charlie.scalars().first()
        assert charlie.is_deleted is True
        assert charlie.is_active is False

        # Face 3 (Charlie's face) hard-deleted from DB (via group delete)
        res_f3 = await session.execute(select(Face).where(Face.person_id == "member-3"))
        assert res_f3.scalars().first() is None

        # Member 4 (David) soft-deleted
        res_david = await session.execute(
            select(AttendanceMember).where(AttendanceMember.person_id == "member-4")
        )
        david = res_david.scalars().first()
        assert david.is_deleted is True
        assert david.is_active is False

        # Face 4 (David's face) hard-deleted from DB (via face pruning)
        res_f4 = await session.execute(select(Face).where(Face.person_id == "member-4"))
        assert res_f4.scalars().first() is None

        # Member 2 (Bob) consent is preserved — cloud's False did NOT overwrite local True
        res_bob = await session.execute(
            select(AttendanceMember).where(AttendanceMember.person_id == "member-2")
        )
        bob = res_bob.scalars().first()
        assert bob.has_consent is True

    # Verify mock face recognizer state
    # Bob (member-2) was NOT erased — local consent took precedence over cloud's False
    assert "member-2" in recognizer.enrolled["org-1"]
    # Cache should still have been refreshed
    assert "org-1" in recognizer.refreshed_orgs
