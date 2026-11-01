import json
from datetime import datetime

import numpy as np
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.routes.backup import BackupImportRequest, export_backup, import_backup
from core.cipher import decrypt_local_data, encrypt_local_data
from database.models import (
    AttendanceGroup,
    AttendanceMember,
    AttendanceRecord,
    AttendanceSession,
    Base,
)
from database.repository import AttendanceRepository, FaceRepository
from time_utils import to_storage_local


@pytest.fixture(autouse=True)
def disable_model_loading(monkeypatch):
    monkeypatch.setattr("core.lifespan.face_recognizer", None)


def restore_request(backup, overwrite=True):
    # Match the JSON round trip through the desktop backup file.
    data = json.loads(backup.model_dump_json())
    return BackupImportRequest.model_validate(
        {
            "version": data["version"],
            "exported_at": data["exported_at"],
            "attendance": {"data": data["attendance"], "overwrite_existing": overwrite},
            "biometrics": data["biometrics"],
        }
    )


async def seed(factory):
    async with factory() as session:
        repo = AttendanceRepository(session)
        await repo.create_group({"id": "g", "name": "Group"})
        await repo.add_member({"person_id": "p", "group_id": "g", "name": "Member"})
        await repo.add_record(
            {
                "id": "r",
                "person_id": "p",
                "group_id": "g",
                "timestamp": datetime(2026, 1, 2, 8),
                "confidence": 0.99,
            }
        )
        await repo.upsert_session(
            {
                "id": "s",
                "person_id": "p",
                "group_id": "g",
                "date": "2026-01-02",
                "status": "present",
                "check_in_time": datetime(2026, 1, 2, 8),
                "notes": "backup version",
            }
        )
        await session.commit()


@pytest.mark.parametrize("overwrite", [False, True])
async def test_restore_respects_overwrite_for_sessions_and_reenrollment(
    async_session_factory, overwrite
):
    await seed(async_session_factory)
    original = np.zeros(512, np.float32)
    original[0] = 1
    newer = np.zeros(512, np.float32)
    newer[1] = 1
    async with async_session_factory() as session:
        repo = AttendanceRepository(session)
        faces = FaceRepository(session)
        await faces.upsert_face("p", encrypt_local_data(original.tobytes()), 512)
        await session.commit()
        backup = await export_backup(password=None, repo=repo)
        (await repo.get_session("p", "2026-01-02")).notes = "new local version"
        await faces.upsert_face("p", encrypt_local_data(newer.tobytes()), 512)
        await session.commit()
        assert (await import_backup(restore_request(backup, overwrite), repo)).success

    async with async_session_factory() as session:
        restored = await AttendanceRepository(session).get_session("p", "2026-01-02")
        assert restored.notes == (
            "backup version" if overwrite else "new local version"
        )
        face = await FaceRepository(session).get_face("p")
        np.testing.assert_array_equal(
            np.frombuffer(decrypt_local_data(face.embedding), np.float32),
            original if overwrite else newer,
        )


async def test_overwrite_restores_member_group_and_original_dates(
    async_session_factory,
):
    await seed(async_session_factory)
    async with async_session_factory() as session:
        repo = AttendanceRepository(session)
        group = await repo.get_group("g")
        member = await repo.get_member("p")
        group.created_at = datetime(2023, 2, 3, 9)
        member.joined_at = datetime(2024, 4, 5, 10)
        await session.commit()
        backup = await export_backup(password=None, repo=repo)
        await repo.create_group({"id": "other", "name": "Other"})
        await repo.update_member("p", {"group_id": "other", "name": "Moved Member"})
        group.created_at = datetime(2026, 1, 1)
        member.joined_at = datetime(2026, 1, 1)
        await session.commit()
        assert (await import_backup(restore_request(backup), repo)).success

    async with async_session_factory() as session:
        repo = AttendanceRepository(session)
        member = await repo.get_member("p")
        assert member.name == "Member"
        assert member.group_id == "g"
        assert member.joined_at == datetime(2024, 4, 5, 10)
        assert (await repo.get_group("g")).created_at == datetime(2023, 2, 3, 9)


@pytest.mark.parametrize("overwrite", [False, True])
async def test_restore_handles_existing_deleted_group(async_session_factory, overwrite):
    await seed(async_session_factory)
    async with async_session_factory() as session:
        repo = AttendanceRepository(session)
        backup = await export_backup(password=None, repo=repo)
        await repo.delete_group("g")
        await session.commit()
        assert (await import_backup(restore_request(backup, overwrite), repo)).success
    async with async_session_factory() as session:
        group = await session.get(AttendanceGroup, "g")
        assert group.is_deleted is (not overwrite)


@pytest.mark.parametrize(
    "state",
    ["active", "inactive", "deleted_member", "deleted_group", "legacy_without_member"],
)
async def test_backup_roundtrip_preserves_history_and_deletion_state(
    async_session_factory, tmp_path, state
):
    await seed(async_session_factory)
    async with async_session_factory() as session:
        repo = AttendanceRepository(session)
        (await repo.get_group("g")).created_at = datetime(2023, 2, 3, 9)
        member = await repo.get_member("p")
        member.joined_at = datetime(2024, 4, 5, 10)
        if state == "inactive":
            member.is_active = False
        elif state == "deleted_member":
            await repo.remove_member("p")
        elif state == "deleted_group":
            await repo.delete_group("g")
        await session.commit()
        backup = await export_backup(password=None, repo=repo)
        payload = restore_request(backup)
        if state == "legacy_without_member":
            # Older backups excluded deleted member profiles but retained their history.
            payload.attendance.data.members = []
        assert (
            len(payload.attendance.data.records)
            == len(payload.attendance.data.sessions)
            == 1
        )

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'roundtrip.db'}")
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
            await connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            assert (await import_backup(payload, AttendanceRepository(session))).success
        async with factory() as session:
            records = list((await session.execute(select(AttendanceRecord))).scalars())
            sessions = list(
                (await session.execute(select(AttendanceSession))).scalars()
            )
            assert len(records) == len(sessions) == 1
            group = await session.get(AttendanceGroup, "g")
            assert group.created_at == to_storage_local(
                payload.attendance.data.groups[0].created_at
            )
            assert group.is_deleted == (state == "deleted_group")
            if state == "legacy_without_member":
                assert records[0].member_id is None and sessions[0].member_id is None
            else:
                member = (await session.execute(select(AttendanceMember))).scalar_one()
                assert member.joined_at == to_storage_local(
                    payload.attendance.data.members[0].joined_at
                )
                assert member.is_deleted == (
                    state in ("deleted_member", "deleted_group")
                )
                assert member.is_active == payload.attendance.data.members[0].is_active
                assert records[0].member_id == sessions[0].member_id == member.id
    finally:
        await engine.dispose()


async def test_legacy_backup_without_tombstone_fields_still_restores(
    async_session_factory,
):
    await seed(async_session_factory)
    async with async_session_factory() as session:
        repo = AttendanceRepository(session)
        backup = await export_backup(password=None, repo=repo)
        payload = restore_request(backup).model_dump()
        for collection in ("groups", "members", "group_rules"):
            for row in payload["attendance"]["data"][collection]:
                row.pop("is_deleted", None)
        assert (
            await import_backup(BackupImportRequest.model_validate(payload), repo)
        ).success
