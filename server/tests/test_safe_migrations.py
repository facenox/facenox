import asyncio
import base64
import hashlib
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace

import pytest

from core import cipher
from database import generation_store as generations
from database import migrate


SOURCE_REVISION = "e3b4c5d6e7f8"
HEAD_REVISION = "o0p1q2r3s4t5"
AUTH_KEY = hashlib.sha256(b"facenox-generation-tests").digest()


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _revision(db_path: Path) -> str:
    with closing(sqlite3.connect(db_path)) as connection:
        return connection.execute("SELECT version_num FROM alembic_version").fetchone()[
            0
        ]


def _counts(db_path: Path) -> dict[str, int]:
    with closing(sqlite3.connect(db_path)) as connection:
        return {
            table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
            for table in ("attendance_groups", "attendance_members", "faces")
        }


def _make_beta15_fixture(data_dir: Path) -> Path:
    data_dir.mkdir(parents=True)
    db_path = data_dir / migrate.DB_FILENAME
    migrate._upgrade_database_to_revision(db_path, SOURCE_REVISION)
    embedding = bytes(512 * 4)
    with closing(sqlite3.connect(db_path)) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(
            "INSERT INTO attendance_groups "
            "(id,name,is_active,class_start_time,track_checkout,biometric_consent_certified) "
            "VALUES ('group-1','Migration Test',1,'08:00',0,1)"
        )
        connection.execute(
            "INSERT INTO attendance_members "
            "(id,person_id,group_id,name,is_active,has_consent) "
            "VALUES ('member-1','person-1','group-1','Alice',1,1)"
        )
        connection.execute(
            "INSERT INTO faces "
            "(id,person_id,embedding,embedding_dimension,is_deleted) "
            "VALUES ('face-1','person-1',?,512,0)",
            (embedding,),
        )
        connection.commit()
    return db_path


def _run(data_dir: Path, **kwargs) -> migrate.MigrationResult:
    return migrate.run_migrations(
        data_dir,
        decryptor=kwargs.pop("decryptor", lambda blob: blob),
        authentication_key=AUTH_KEY,
        **kwargs,
    )


def _pointer(data_dir: Path) -> generations.GenerationPointer:
    pointer = generations.read_pointer(data_dir, AUTH_KEY)
    assert pointer is not None
    return pointer


def _mark_healthy(data_dir: Path) -> generations.GenerationPointer:
    pointer = _pointer(data_dir)
    generations.write_health_marker(
        data_dir, pointer.generation, pointer.sequence, AUTH_KEY
    )
    healthy = generations.GenerationPointer(
        pointer.generation,
        pointer.previous_generation,
        pointer.sequence,
        "healthy",
    )
    generations.write_pointer(data_dir, healthy, AUTH_KEY)
    return healthy


def _reset_cipher_cache(monkeypatch) -> None:
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_PROVIDER", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_DATA_DIR", None)


def test_beta15_upgrade_publishes_generation_and_retains_legacy(tmp_path):
    data_dir = tmp_path / "data"
    legacy_db = _make_beta15_fixture(data_dir)
    legacy_hash = _hash(legacy_db)
    source_counts = _counts(legacy_db)

    result = _run(data_dir)
    active_db = Path(result.active_database)
    pointer = _pointer(data_dir)

    assert result.migrated is True
    assert result.source_revisions == (SOURCE_REVISION,)
    assert result.target_revisions == (HEAD_REVISION,)
    assert pointer.activation == "pending"
    assert pointer.previous_generation is not None
    assert active_db == generations.generation_database(data_dir, pointer.generation)
    assert _revision(active_db) == HEAD_REVISION
    assert _counts(active_db) == source_counts
    assert _hash(legacy_db) == legacy_hash
    previous_db = generations.generation_database(data_dir, pointer.previous_generation)
    assert _revision(previous_db) == SOURCE_REVISION

    _mark_healthy(data_dir)
    active_hash = _hash(active_db)
    second = _run(data_dir)
    assert second.migrated is False
    assert second.generation == pointer.generation
    assert _hash(active_db) == active_hash


def test_healthy_startup_uses_one_lightweight_validation(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    result = _run(data_dir)
    _mark_healthy(data_dir)
    quick_checks = 0
    original_quick_check = migrate._check_quick_integrity

    def track_quick_check(connection):
        nonlocal quick_checks
        quick_checks += 1
        original_quick_check(connection)

    def reject_exhaustive_validation(*_args, **_kwargs):
        raise AssertionError("healthy startup performed exhaustive validation")

    monkeypatch.setattr(migrate, "_check_quick_integrity", track_quick_check)
    monkeypatch.setattr(migrate, "_preflight_database", reject_exhaustive_validation)

    restarted = _run(data_dir)

    assert restarted.migrated is False
    assert restarted.generation == result.generation
    assert quick_checks == 1


def test_beta22_head_database_is_adopted_without_rewriting_legacy(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    legacy_db = data_dir / migrate.DB_FILENAME
    migrate._upgrade_database(legacy_db)
    with closing(sqlite3.connect(legacy_db)) as connection:
        connection.execute(
            "INSERT INTO attendance_groups (id,name) VALUES ('beta22','Beta 22')"
        )
        connection.commit()
    legacy_hash = _hash(legacy_db)

    result = _run(data_dir)
    pointer = _pointer(data_dir)

    assert result.migrated is True
    assert result.source_revisions == (HEAD_REVISION,)
    assert result.target_revisions == (HEAD_REVISION,)
    assert pointer.activation == "healthy"
    assert pointer.previous_generation is None
    assert _hash(legacy_db) == legacy_hash
    with closing(sqlite3.connect(Path(result.active_database))) as active:
        assert (
            active.execute(
                "SELECT name FROM attendance_groups WHERE id='beta22'"
            ).fetchone()[0]
            == "Beta 22"
        )


def test_new_database_is_a_pending_generation_without_legacy_file(tmp_path):
    data_dir = tmp_path / "data"

    result = _run(data_dir)
    pointer = _pointer(data_dir)

    assert result.migrated is True
    assert result.source_revisions == ()
    assert pointer.activation == "pending"
    assert pointer.previous_generation is None
    assert _revision(Path(result.active_database)) == HEAD_REVISION
    assert not (data_dir / migrate.DB_FILENAME).exists()


def test_public_health_commit_uses_pinned_provider(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.setenv("FACENOX_MACHINE_KEY", base64.b64encode(AUTH_KEY).decode())
    _reset_cipher_cache(monkeypatch)

    result = migrate.run_migrations(data_dir)
    pending = generations.read_pointer(data_dir, AUTH_KEY)
    assert pending is not None and pending.activation == "pending"

    migrate.mark_active_generation_healthy(data_dir)

    healthy = generations.read_pointer(data_dir, AUTH_KEY)
    assert healthy is not None and healthy.activation == "healthy"
    assert healthy.generation == result.generation


def test_machine_key_can_be_recovered_from_generation_bundle(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    monkeypatch.delenv("FACENOX_MACHINE_KEY", raising=False)
    monkeypatch.delenv("DBUS_SESSION_BUS_ADDRESS", raising=False)
    monkeypatch.setattr(cipher.platform, "system", lambda: "Linux")
    _reset_cipher_cache(monkeypatch)

    first = migrate.run_migrations(data_dir)
    migrate.mark_active_generation_healthy(data_dir)
    (data_dir / ".machine_key").unlink()
    (data_dir / cipher.KEY_PROVIDER_FILENAME).unlink()
    _reset_cipher_cache(monkeypatch)

    recovered = migrate.run_migrations(data_dir)

    assert recovered.migrated is False
    assert recovered.generation == first.generation
    assert (data_dir / ".machine_key").is_file()
    assert (data_dir / cipher.KEY_PROVIDER_FILENAME).is_file()


def test_missing_revision_is_blocked_without_publishing_generation(tmp_path):
    data_dir = tmp_path / "data"
    db_path = _make_beta15_fixture(data_dir)
    with closing(sqlite3.connect(db_path)) as connection:
        connection.execute("DELETE FROM alembic_version")
        connection.commit()
    before = _hash(db_path)

    with pytest.raises(migrate.MigrationSafetyError, match="no Alembic revision"):
        _run(data_dir)

    assert _hash(db_path) == before
    assert not generations.has_published_generations(data_dir)
    assert not generations.pointer_path(data_dir).exists()


def test_unreadable_biometrics_fail_before_generation_publication(tmp_path):
    data_dir = tmp_path / "data"
    db_path = _make_beta15_fixture(data_dir)
    before = _hash(db_path)

    def reject(_blob: bytes) -> bytes:
        raise RuntimeError("wrong key")

    with pytest.raises(migrate.MigrationSafetyError, match="encryption key validation"):
        _run(data_dir, decryptor=reject)

    assert _hash(db_path) == before
    assert not generations.has_published_generations(data_dir)


def test_key_preflight_does_not_create_a_missing_file_key(tmp_path, monkeypatch):
    monkeypatch.setattr(cipher, "DATA_DIR", tmp_path)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)

    with pytest.raises(
        cipher.MachineKeyUnavailableError, match="machine key is missing"
    ):
        cipher._machine_key_file(create_if_missing=False)

    assert not (tmp_path / ".machine_key").exists()


def test_pinned_environment_provider_never_falls_back(tmp_path, monkeypatch):
    key = bytes(range(32))
    monkeypatch.setenv("FACENOX_MACHINE_KEY", base64.b64encode(key).decode())
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_PROVIDER", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_DATA_DIR", None)
    record = cipher.get_machine_key_record(data_dir=tmp_path)
    assert record.provider == "environment"

    monkeypatch.delenv("FACENOX_MACHINE_KEY")
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_PROVIDER", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_DATA_DIR", None)
    with pytest.raises(cipher.MachineKeyUnavailableError, match="pinned"):
        cipher.get_machine_key_record(create_if_missing=False, data_dir=tmp_path)
    assert not (tmp_path / ".machine_key").exists()


def test_candidate_failure_leaves_adopted_generation_selected(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    legacy_db = _make_beta15_fixture(data_dir)
    legacy_hash = _hash(legacy_db)

    def fail_upgrade(_db_path: Path) -> None:
        raise RuntimeError("injected candidate failure")

    monkeypatch.setattr(migrate, "_upgrade_database", fail_upgrade)
    with pytest.raises(
        migrate.MigrationSafetyError, match="injected candidate failure"
    ):
        _run(data_dir)

    pointer = _pointer(data_dir)
    assert pointer.activation == "healthy"
    assert (
        _revision(generations.generation_database(data_dir, pointer.generation))
        == SOURCE_REVISION
    )
    assert _hash(legacy_db) == legacy_hash
    assert len(generations.healthy_generation_candidates(data_dir, AUTH_KEY)) == 1


def test_retained_column_mutation_rejects_candidate(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    source_db = _make_beta15_fixture(data_dir)
    original_upgrade = migrate._upgrade_database

    def corrupt_after_upgrade(db_path: Path) -> None:
        original_upgrade(db_path)
        with closing(sqlite3.connect(db_path)) as connection:
            connection.execute(
                "UPDATE attendance_groups SET name='silently-corrupted' WHERE id='group-1'"
            )
            connection.commit()

    monkeypatch.setattr(migrate, "_upgrade_database", corrupt_after_upgrade)

    with pytest.raises(migrate.MigrationSafetyError, match="changed data"):
        _run(data_dir)

    with closing(sqlite3.connect(source_db)) as connection:
        assert (
            connection.execute(
                "SELECT name FROM attendance_groups WHERE id='group-1'"
            ).fetchone()[0]
            == "Migration Test"
        )


def test_pending_generation_rolls_back_when_next_start_never_saw_health(
    tmp_path, monkeypatch
):
    data_dir = tmp_path / "data"
    _make_beta15_fixture(data_dir)
    first = _run(data_dir)
    failed_generation = first.generation
    rollback_generation = first.previous_generation

    def fail_retry(_db_path: Path) -> None:
        raise RuntimeError("stop after rollback")

    monkeypatch.setattr(migrate, "_upgrade_database", fail_retry)
    with pytest.raises(migrate.MigrationSafetyError, match="stop after rollback"):
        _run(data_dir)

    pointer = _pointer(data_dir)
    assert pointer.generation == rollback_generation
    assert pointer.activation == "healthy"
    assert pointer.generation != failed_generation
    assert (
        _revision(generations.generation_database(data_dir, pointer.generation))
        == SOURCE_REVISION
    )


def test_health_marker_commits_pending_generation_on_restart(tmp_path):
    data_dir = tmp_path / "data"
    _make_beta15_fixture(data_dir)
    first = _run(data_dir)
    pointer = _pointer(data_dir)
    generations.write_health_marker(
        data_dir, pointer.generation, pointer.sequence, AUTH_KEY
    )

    second = _run(data_dir)

    recovered = _pointer(data_dir)
    assert recovered.generation == first.generation
    assert recovered.activation == "healthy"
    assert second.migrated is False


def test_insufficient_disk_space_fails_before_adoption(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    db_path = _make_beta15_fixture(data_dir)
    before = _hash(db_path)
    monkeypatch.setattr(
        migrate.shutil,
        "disk_usage",
        lambda _path: SimpleNamespace(total=1, used=1, free=0),
    )

    with pytest.raises(
        migrate.MigrationSafetyError, match="Not enough free disk space"
    ):
        _run(data_dir)

    assert _hash(db_path) == before
    assert not generations.has_published_generations(data_dir)


def test_orphaned_batch_table_is_removed_only_in_new_generation(tmp_path):
    data_dir = tmp_path / "data"
    _make_beta15_fixture(data_dir)
    first = _run(data_dir)
    _mark_healthy(data_dir)
    active_db = Path(first.active_database)
    with closing(sqlite3.connect(active_db)) as connection:
        connection.execute(
            "CREATE TABLE _alembic_tmp_interrupted (id INTEGER PRIMARY KEY)"
        )
        connection.commit()

    second = _run(data_dir)

    assert second.generation != first.generation
    with closing(sqlite3.connect(Path(second.active_database))) as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM sqlite_master "
                "WHERE type='table' AND name='_alembic_tmp_interrupted'"
            ).fetchone()[0]
            == 0
        )
    with closing(sqlite3.connect(active_db)) as previous:
        assert (
            previous.execute(
                "SELECT COUNT(*) FROM sqlite_master "
                "WHERE type='table' AND name='_alembic_tmp_interrupted'"
            ).fetchone()[0]
            == 1
        )


def test_online_backup_includes_committed_wal_content(tmp_path):
    data_dir = tmp_path / "data"
    db_path = _make_beta15_fixture(data_dir)
    backup_path = tmp_path / "snapshot" / migrate.DB_FILENAME

    writer = sqlite3.connect(db_path)
    try:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute(
            "INSERT INTO attendance_groups "
            "(id,name,is_active,class_start_time,track_checkout,biometric_consent_certified) "
            "VALUES ('wal-only','Committed in WAL',1,'08:00',0,1)"
        )
        writer.commit()
        assert db_path.with_name(db_path.name + "-wal").stat().st_size > 0

        migrate._online_backup(db_path, backup_path)
        with closing(sqlite3.connect(backup_path)) as backup:
            assert (
                backup.execute(
                    "SELECT COUNT(*) FROM attendance_groups WHERE id='wal-only'"
                ).fetchone()[0]
                == 1
            )
    finally:
        writer.close()


def test_external_legacy_import_is_non_destructive_and_wal_safe(tmp_path, monkeypatch):
    legacy_dir = tmp_path / "legacy"
    legacy_db = _make_beta15_fixture(legacy_dir)
    legacy_face_db = legacy_dir / "face_database.db"
    with closing(sqlite3.connect(legacy_face_db)) as face_connection:
        face_connection.execute(
            "CREATE TABLE faces "
            "(person_id TEXT, embedding BLOB, embedding_dimension INTEGER)"
        )
        face_connection.execute(
            "INSERT INTO faces VALUES ('legacy-face', ?, 2)", (bytes(8),)
        )
        face_connection.commit()
    legacy_face_hash = _hash(legacy_face_db)
    target_dir = tmp_path / "new-data"

    writer = sqlite3.connect(legacy_db)
    try:
        writer.execute("PRAGMA journal_mode=WAL")
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute(
            "INSERT INTO attendance_groups "
            "(id,name,is_active,class_start_time,track_checkout,biometric_consent_certified) "
            "VALUES ('legacy-wal','Legacy WAL row',1,'08:00',0,1)"
        )
        writer.commit()
        legacy_hash = _hash(legacy_db)
        monkeypatch.setenv("FACENOX_LEGACY_DATA_DIR", str(legacy_dir))

        result = _run(target_dir)

        assert _revision(Path(result.active_database)) == HEAD_REVISION
        with closing(sqlite3.connect(Path(result.active_database))) as target:
            assert (
                target.execute(
                    "SELECT COUNT(*) FROM attendance_groups WHERE id='legacy-wal'"
                ).fetchone()[0]
                == 1
            )
        assert _hash(legacy_db) == legacy_hash
        assert legacy_db.exists()
        with closing(sqlite3.connect(target_dir / "face_database.db")) as staged_face:
            assert (
                staged_face.execute("SELECT person_id FROM faces").fetchone()[0]
                == "legacy-face"
            )
        assert _hash(legacy_face_db) == legacy_face_hash
    finally:
        writer.close()


def test_completed_external_face_import_is_not_restaged(tmp_path):
    from database.face import FaceDatabaseManager

    legacy_dir = tmp_path / "legacy"
    legacy_dir.mkdir()
    legacy_face_db = legacy_dir / "face_database.db"
    with closing(sqlite3.connect(legacy_face_db)) as connection:
        connection.execute(
            "CREATE TABLE faces "
            "(person_id TEXT, embedding BLOB, embedding_dimension INTEGER)"
        )
        connection.execute(
            "INSERT INTO faces VALUES ('legacy-face', ?, 2)", (bytes(8),)
        )
        connection.commit()

    data_dir = tmp_path / "data"
    migrate._stage_legacy_face_database(data_dir, legacy_dir)
    staged_face_db = data_dir / "face_database.db"
    manager = FaceDatabaseManager(
        str(staged_face_db), legacy_source_path=str(legacy_face_db)
    )
    manager._legacy_import_succeeded = True

    archived = manager.finalize_legacy_migration()

    assert len(archived) == 2
    assert all(path.exists() for path in archived)
    assert not staged_face_db.exists()
    assert not legacy_face_db.exists()

    migrate._stage_legacy_face_database(data_dir, legacy_dir)
    assert not staged_face_db.exists()


def test_invalid_legacy_face_database_fails_closed(tmp_path):
    from database.face import FaceDatabaseManager

    legacy_face_db = tmp_path / "face_database.db"
    with closing(sqlite3.connect(legacy_face_db)) as connection:
        connection.execute("CREATE TABLE unexpected (id INTEGER PRIMARY KEY)")
        connection.commit()

    manager = FaceDatabaseManager(str(legacy_face_db))

    with pytest.raises(RuntimeError, match="Legacy face migration failed"):
        asyncio.run(manager.migrate_legacy_data())

    assert legacy_face_db.exists()


def test_authenticated_pointer_recovers_from_highest_healthy_generation(tmp_path):
    data_dir = tmp_path / "data"
    _make_beta15_fixture(data_dir)
    result = _run(data_dir)
    healthy = _mark_healthy(data_dir)
    pointer_path = generations.pointer_path(data_dir)
    value = json.loads(pointer_path.read_text(encoding="utf-8"))
    value["generation"] = "gen-99999999-tampered"
    pointer_path.write_text(json.dumps(value), encoding="utf-8")

    recovered = _run(data_dir)

    assert recovered.migrated is False
    assert _pointer(data_dir).generation == healthy.generation == result.generation


def test_publish_before_pointer_crash_recovers_new_installation(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    original_write_pointer = generations.write_pointer

    def interrupt_pointer(*_args, **_kwargs):
        raise RuntimeError("simulated crash before pointer publication")

    monkeypatch.setattr(generations, "write_pointer", interrupt_pointer)
    with pytest.raises(migrate.MigrationSafetyError, match="simulated crash"):
        _run(data_dir)

    assert generations.has_published_generations(data_dir)
    assert not generations.pointer_path(data_dir).exists()

    monkeypatch.setattr(generations, "write_pointer", original_write_pointer)
    recovered = _run(data_dir)

    assert recovered.migrated is False
    assert _revision(Path(recovered.active_database)) == HEAD_REVISION
    assert _pointer(data_dir).activation == "pending"


def test_invalid_generation_manifest_never_falls_back_to_stale_legacy(tmp_path):
    data_dir = tmp_path / "data"
    result = _run(data_dir)
    _mark_healthy(data_dir)
    manifest_path = (
        generations.generation_directory(data_dir, result.generation)
        / generations.GENERATION_MANIFEST_FILENAME
    )
    value = json.loads(manifest_path.read_text(encoding="utf-8"))
    value["counts"] = {}
    manifest_path.write_text(json.dumps(value), encoding="utf-8")

    with pytest.raises(
        migrate.MigrationSafetyError, match="legacy fallback is disabled"
    ):
        _run(data_dir)


def test_migration_lock_rejects_a_second_owner(tmp_path):
    with generations.migration_lock(tmp_path, timeout=0.1):
        with pytest.raises(generations.GenerationStoreError, match="Another FaceNox"):
            with generations.migration_lock(tmp_path, timeout=0.1):
                pass


@pytest.mark.skipif(os.name == "nt", reason="POSIX permission contract")
def test_generation_artifacts_are_private_on_posix(tmp_path):
    data_dir = tmp_path / "data"
    result = _run(data_dir)
    generation_dir = generations.generation_directory(data_dir, result.generation)

    assert generation_dir.stat().st_mode & 0o777 == 0o700
    assert Path(result.active_database).stat().st_mode & 0o777 == 0o600
    assert generations.pointer_path(data_dir).stat().st_mode & 0o777 == 0o600
    assert (
        generation_dir / generations.GENERATION_MANIFEST_FILENAME
    ).stat().st_mode & 0o777 == 0o600
