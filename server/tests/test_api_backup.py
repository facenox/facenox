import numpy as np
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from database.models import AttendanceGroup, AttendanceMember, Face, AttendanceSettings
from core.cipher import encrypt_local_data, decrypt_local_data


@pytest.mark.asyncio
async def test_backup_export_and_import_biometrics_roundtrip(
    async_session_factory, monkeypatch
):
    import core.lifespan

    dummy_embedding = np.ones(512, dtype=np.float32)

    class MockRecognizer:
        async def export_embeddings(self, org_id):
            return {"person_test_1": dummy_embedding}

        async def refresh_cache(self, org_id):
            pass

        async def get_all_persons(self, org_id=None):
            return ["person_test_1"]

    monkeypatch.setattr(core.lifespan, "face_recognizer", MockRecognizer())

    async with async_session_factory() as session:
        from database.repository import AttendanceRepository
        from api.routes.backup import export_backup, import_backup, BackupImportRequest

        # Seed data
        session.add(AttendanceSettings(late_threshold_minutes=15))
        session.add(AttendanceGroup(id="grp_test_1", name="Grade 10", is_active=True))
        session.add(
            AttendanceMember(
                id="mem_test_1",
                person_id="person_test_1",
                group_id="grp_test_1",
                name="John Doe",
                is_active=True,
                is_deleted=False,
            )
        )
        encrypted_embedding = encrypt_local_data(dummy_embedding.tobytes())
        session.add(
            Face(
                id="face_test_1",
                person_id="person_test_1",
                embedding=encrypted_embedding,
                embedding_dimension=512,
                is_deleted=False,
            )
        )
        await session.commit()

        repo = AttendanceRepository(session, organization_id=None)

        # 1. Export without password (standard Electron loopback call)
        export_resp = await export_backup(password=None, repo=repo)

        assert export_resp.version == 1
        assert len(export_resp.attendance.groups) == 1
        assert len(export_resp.attendance.members) == 1
        assert len(export_resp.biometrics) == 1
        assert export_resp.biometrics[0].person_id == "person_test_1"
        assert "[REDACTED" not in export_resp.biometrics[0].embedding_b64

        # 2. Clear face and member tables (simulate restoring to new environment)
        from database.models import Base

        await session.execute(Base.metadata.tables["faces"].delete())
        await session.execute(Base.metadata.tables["attendance_members"].delete())
        await session.execute(Base.metadata.tables["attendance_groups"].delete())
        await session.commit()

        # 3. Import payload (simulating Electron sending decrypted payload)
        electron_payload = {
            "version": export_resp.version,
            "exported_at": export_resp.exported_at,
            "attendance": {
                "data": export_resp.attendance.model_dump(),
                "overwrite_existing": True,
            },
            "biometrics": [b.model_dump() for b in export_resp.biometrics],
        }
        import_req = BackupImportRequest.model_validate(electron_payload)
        import_resp = await import_backup(payload=import_req, repo=repo)

        assert "1 biometric profiles restored" in import_resp.message
        assert "0 items skipped" in import_resp.message

        # 4. Verify FaceModel restored in SQLite
        restored_faces = (await session.execute(select(Face))).scalars().all()
        assert len(restored_faces) == 1
        assert restored_faces[0].person_id == "person_test_1"
        assert not restored_faces[0].is_deleted

        decrypted_raw = decrypt_local_data(restored_faces[0].embedding)
        restored_array = np.frombuffer(decrypted_raw, dtype=np.float32)
        assert np.allclose(restored_array, dummy_embedding)


@pytest.mark.asyncio
async def test_backup_export_fails_when_any_biometric_cannot_be_decrypted(
    async_session_factory,
):
    async with async_session_factory() as session:
        from database.repository import AttendanceRepository
        from api.routes.backup import export_backup

        session.add(AttendanceSettings(late_threshold_minutes=15))
        session.add(AttendanceGroup(id="grp_test_1", name="Grade 10", is_active=True))
        session.add(
            AttendanceMember(
                id="mem_test_1",
                person_id="person_test_1",
                group_id="grp_test_1",
                name="John Doe",
                is_active=True,
                is_deleted=False,
            )
        )
        session.add(
            Face(
                id="face_test_1",
                person_id="person_test_1",
                embedding=b"not-an-encrypted-embedding",
                embedding_dimension=512,
                is_deleted=False,
            )
        )
        await session.commit()

        repo = AttendanceRepository(session, organization_id=None)
        with pytest.raises(HTTPException) as error:
            await export_backup(password=None, repo=repo)

        assert error.value.status_code == 500
        assert "Backup export failed" in error.value.detail
