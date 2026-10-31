import asyncio
import base64
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
import core.lifespan
from database.models import AttendanceGroup, AttendanceGroupRule, Face
from database.repository import AttendanceRepository, FaceRepository


@pytest.fixture
def sync_env(test_client, set_api_token, monkeypatch):
    set_api_token("sync-test-token")
    monkeypatch.setattr(core.lifespan.face_recognizer, "refresh_cache", AsyncMock())
    monkeypatch.setattr("api.routes.attendance.encrypt_local_data", lambda value: value)
    monkeypatch.setattr("api.routes.attendance.decrypt_local_data", lambda value: value)
    client, factory = test_client
    return (
        client,
        factory,
        {"X-Facenox-Token": "sync-test-token", "X-Facenox-Organization": "org"},
    )


def pull(env, groups=None, members=None, **extra):
    client, _, headers = env
    response = client.post(
        "/attendance/import-metadata",
        headers=headers,
        json={"groups": groups or [], "members": members or [], **extra},
    )
    assert response.status_code == 200, response.text
    return response.json()


def group(**extra):
    return {"id": "g", "name": "Group", "sync_revision": 1, "is_active": True, **extra}


def member(**extra):
    return {
        "person_id": "p",
        "name": "Alice",
        "group_id": "g",
        "sync_revision": 1,
        "is_active": True,
        **extra,
    }


def export(env):
    client, _, headers = env
    response = client.post("/attendance/export", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_251_member_pages_do_not_delete_prior_pages(sync_env):
    members = [member(person_id=f"p{i:04d}") for i in range(251)]
    pull(sync_env, [group()], members[:250])
    pull(sync_env, members=members[250:])
    data = export(sync_env)
    assert len(data["members"]) == 251
    assert all(m["is_active"] and not m["sync_dirty"] for m in data["members"])
    assert not data["groups"][0]["sync_dirty"]


def test_first_deleted_group_import_stays_deleted(sync_env):
    client, _, headers = sync_env
    pull(sync_env, [group(is_active=False)])
    assert client.get("/attendance/groups", headers=headers).json() == []
    assert export(sync_env)["groups"][0]["is_active"] is False


def test_synced_person_id_rename_exports_member_and_template_changes(sync_env):
    client, factory, headers = sync_env
    pull(sync_env, [group()], [member()])
    raw_embedding = bytes(512 * 4)
    response = client.post(
        "/attendance/import-embedding",
        headers=headers,
        json={
            "person_id": "p",
            "embedding_bytes": base64.b64encode(raw_embedding).decode(),
            "embedding_dimension": 512,
            "sync_revision": 1,
        },
    )
    assert response.status_code == 200 and response.json()["success"], response.text
    before = export(sync_env)["members"][0]
    assert before["sync_dirty"] is False
    renamed = client.put(
        "/face/person",
        headers=headers,
        json={"old_person_id": "p", "new_person_id": "renamed"},
    )
    assert renamed.status_code == 200, renamed.text
    after = export(sync_env)["members"][0]
    assert after["person_id"] == "renamed"
    assert after["sync_dirty"] is True
    assert after["version"] > before["version"]
    face_export = client.post("/attendance/export-embeddings", headers=headers)
    assert face_export.status_code == 200, face_export.text
    faces = face_export.json()["embeddings"]
    assert len(faces) == 1
    assert faces[0]["person_id"] == "renamed"
    assert base64.b64decode(faces[0]["embedding_bytes"]) == raw_embedding
    assert faces[0]["version"] > 1

    async def check():
        async with factory() as session:
            repo = FaceRepository(session, "org")
            assert await repo.get_face("p") is None
            assert (await repo.get_face("renamed")).sync_dirty is True

    asyncio.run(check())


@pytest.mark.parametrize(
    "field,value",
    [
        ("scan_behavior", "entry_only"),
        ("min_checkout_delay_minutes", 45),
    ],
)
def test_synced_group_setting_edit_is_marked_for_upload(sync_env, field, value):
    client, _, headers = sync_env
    pull(sync_env, [group()], [member()])
    before = export(sync_env)["groups"][0]
    assert before["sync_dirty"] is False
    response = client.put(
        "/attendance/groups/g", headers=headers, json={"settings": {field: value}}
    )
    assert response.status_code == 200, response.text
    after = export(sync_env)["groups"][0]
    assert after["settings"][field] == value
    assert after["sync_dirty"] is True
    assert after["version"] > before["version"]


def test_pending_local_edit_survives_pull_without_acknowledgement(sync_env):
    client, _, headers = sync_env
    pull(sync_env, [group()], [member()])
    assert (
        client.put(
            "/attendance/members/p", headers=headers, json={"name": "Local edit"}
        ).status_code
        == 200
    )
    pull(sync_env, members=[member(name="Cloud edit", sync_revision=2)])
    local = export(sync_env)["members"][0]
    assert local["name"] == "Local edit"
    assert local["sync_dirty"]
    assert local["sync_revision"] == 1
    assert local["version"] > 1


def test_acknowledgement_does_not_overwrite_an_edit_made_during_upload(sync_env):
    client, _, headers = sync_env
    pull(sync_env, [group()], [member()])
    client.put("/attendance/members/p", headers=headers, json={"name": "First edit"})
    sent = export(sync_env)["members"][0]
    client.put("/attendance/members/p", headers=headers, json={"name": "Newer edit"})
    pull(
        sync_env,
        members=[member(name="First edit", sync_revision=2)],
        acknowledged_members={"p": sent["version"]},
        accepted_members={"p": 2},
    )
    local = export(sync_env)["members"][0]
    assert local["name"] == "Newer edit"
    assert local["sync_dirty"]
    assert local["sync_revision"] == 2


def test_conflicting_acknowledged_edit_adopts_cloud_revision(sync_env):
    client, _, headers = sync_env
    pull(sync_env, [group()], [member()])
    client.put("/attendance/members/p", headers=headers, json={"name": "Stale edit"})
    sent = export(sync_env)["members"][0]
    pull(
        sync_env,
        members=[member(name="Cloud edit", sync_revision=2)],
        acknowledged_members={"p": sent["version"]},
    )
    local = export(sync_env)["members"][0]
    assert local["name"] == "Cloud edit"
    assert local["sync_dirty"] is False
    assert local["sync_revision"] == 2


@pytest.mark.asyncio
async def test_schedule_pull_updates_end_time_and_effective_rules(sync_env):
    _, factory, _ = sync_env
    pull(
        sync_env,
        [group(settings={"class_start_time": "08:00", "class_end_time": "17:00"})],
    )
    pull(
        sync_env,
        [
            group(
                sync_revision=2,
                settings={"class_start_time": "09:00", "class_end_time": "18:00"},
            )
        ],
    )
    async with factory() as session:
        row = await session.get(AttendanceGroup, "g")
        assert row.class_end_time == "18:00"
        rules = list((await session.execute(select(AttendanceGroupRule))).scalars())
        assert len(rules) == 2
        assert rules[-1].class_end_time == "18:00"


@pytest.mark.asyncio
async def test_transfer_removal_clears_pending_member_and_face_without_echo(sync_env):
    _, factory, _ = sync_env
    pull(sync_env, [group()], [member()])
    async with factory() as session:
        await FaceRepository(session, "org").upsert_face("p", b"private", 512)
        await session.commit()
    pull(sync_env, removed_group_ids=["g"], removed_member_ids=["p"])
    data = export(sync_env)
    assert not data["members"][0]["is_active"]
    assert not data["members"][0]["sync_dirty"]
    async with factory() as session:
        face = (await session.execute(select(Face))).scalar_one()
        assert face.embedding == b"" and face.is_deleted and not face.sync_dirty


@pytest.mark.asyncio
async def test_face_removal_erases_bytes_but_exports_a_tombstone(sync_env):
    client, factory, headers = sync_env
    pull(sync_env, [group()], [member()])
    async with factory() as session:
        faces = FaceRepository(session, "org")
        await faces.upsert_face("p", b"private", 512)
        await session.commit()
        assert await faces.remove_face("p")
        await session.commit()
    response = client.post("/attendance/export-embeddings", headers=headers)
    assert response.status_code == 200
    [face] = response.json()["embeddings"]
    assert face["is_deleted"] and face["embedding_bytes"] == ""
    assert face["version"] > 1


def test_embedding_import_rejects_inactive_members(sync_env):
    import base64

    client, _, headers = sync_env
    pull(sync_env, [group()], [member()])
    pull(sync_env, members=[member(is_active=False, sync_revision=2)])
    response = client.post(
        "/attendance/import-embeddings-batch",
        headers=headers,
        json={
            "embeddings": [
                {
                    "person_id": "p",
                    "embedding_bytes": base64.b64encode(bytes(2048)).decode(),
                    "sync_revision": 2,
                }
            ]
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["imported_count"] == 0


@pytest.mark.asyncio
async def test_utc_delta_boundary_matches_local_storage_inclusively(
    sync_env, monkeypatch
):
    import time_utils

    client, factory, headers = sync_env
    monkeypatch.setattr(
        time_utils, "get_local_timezone", lambda: timezone(timedelta(hours=8))
    )
    pull(sync_env, [group()], [member()])
    async with factory() as session:
        record = await AttendanceRepository(session, "org").add_record(
            {
                "id": "r",
                "person_id": "p",
                "group_id": "g",
                "timestamp": datetime(2026, 10, 13, 8),
                "confidence": 1,
            }
        )
        record.last_modified_at = datetime(2026, 10, 13, 8)
        await session.commit()
    response = client.post(
        "/attendance/export?since=2026-10-13T00:00:00Z", headers=headers
    )
    assert response.status_code == 200, response.text
    assert [r["id"] for r in response.json()["records"]] == ["r"]
