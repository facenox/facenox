"""Crash-safe, generation-based SQLite migrations."""

from __future__ import annotations

import hashlib
import logging
import os
import shutil
import sqlite3
import time
import uuid
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from config.paths import (
    ALEMBIC_CONFIG_PATH,
    DATA_DIR,
    LEGACY_DATA_ENV,
    MIGRATIONS_DIR,
    set_active_database_path,
)
from database import generation_store as generations

logger = logging.getLogger(__name__)

DB_FILENAME = "attendance.db"
KEY_FILENAMES = (".machine_key.dpapi", ".machine_key", ".machine_key.json")
MINIMUM_MIGRATION_HEADROOM = 64 * 1024 * 1024
CRITICAL_DATA_TABLES = (
    "attendance_groups",
    "attendance_settings",
    "attendance_members",
    "attendance_records",
    "attendance_sessions",
    "attendance_group_rules",
    "faces",
    "audit_logs",
)
REQUIRED_TRIGGERS = {
    "attendance_records_utc_insert",
    "attendance_records_utc_update",
    "attendance_sessions_utc_insert",
    "attendance_sessions_utc_update",
}
ALLOWED_DROPPED_DATA_COLUMNS = {
    "attendance_groups": {"biometric_consent_certified"},
    "attendance_members": {"has_consent", "consent_granted_at", "consent_granted_by"},
}

Decryptor = Callable[[bytes], bytes]


class MigrationSafetyError(RuntimeError):
    """Raised when migration cannot continue without risking user data."""


@dataclass(frozen=True)
class DatabaseReport:
    revisions: tuple[str, ...]
    counts: dict[str, int]
    faces_checked: int
    content_columns: dict[str, tuple[str, ...]]
    content_hashes: dict[str, str]


@dataclass(frozen=True)
class MigrationResult:
    migrated: bool
    source_revisions: tuple[str, ...]
    target_revisions: tuple[str, ...]
    recovery_directory: str | None = None
    generation: str | None = None
    previous_generation: str | None = None
    active_database: str | None = None


def _database_url(db_path: Path) -> str:
    return f"sqlite:///{db_path.resolve().as_posix()}"


def _alembic_config(db_path: Path) -> Config:
    config = Config(str(ALEMBIC_CONFIG_PATH))
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", _database_url(db_path))
    return config


def _script_directory(db_path: Path) -> ScriptDirectory:
    return ScriptDirectory.from_config(_alembic_config(db_path))


def _connect_read_only(db_path: Path) -> sqlite3.Connection:
    uri = f"{db_path.resolve().as_uri()}?mode=ro"
    return sqlite3.connect(uri, uri=True, timeout=30)


def _user_tables(connection: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def _read_revisions(
    connection: sqlite3.Connection, tables: set[str]
) -> tuple[str, ...]:
    if "alembic_version" not in tables:
        return ()
    return tuple(
        sorted(
            row[0]
            for row in connection.execute("SELECT version_num FROM alembic_version")
        )
    )


def _check_integrity(connection: sqlite3.Connection) -> None:
    integrity = [row[0] for row in connection.execute("PRAGMA integrity_check")]
    if integrity != ["ok"]:
        raise MigrationSafetyError(
            "Database integrity check failed: " + "; ".join(integrity[:5])
        )

    connection.execute("PRAGMA foreign_keys=ON")
    violations = list(connection.execute("PRAGMA foreign_key_check"))
    if violations:
        raise MigrationSafetyError(
            f"Database has {len(violations)} foreign-key violation(s): {violations[:3]}"
        )


def _assert_known_revisions(
    revisions: tuple[str, ...], script_directory: ScriptDirectory
) -> None:
    for revision in revisions:
        try:
            script_directory.get_revision(revision)
        except Exception as exc:
            raise MigrationSafetyError(
                f"Database revision '{revision}' is not present in this build. "
                "The database was not changed."
            ) from exc


def _table_counts(connection: sqlite3.Connection, tables: set[str]) -> dict[str, int]:
    return {
        table: int(connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
        for table in CRITICAL_DATA_TABLES
        if table in tables
    }


def _digest_value(digest: object, value: object) -> None:
    if value is None:
        encoded = b"N"
    elif isinstance(value, bytes):
        encoded = b"B" + value
    elif isinstance(value, int):
        encoded = b"I" + str(value).encode("ascii")
    elif isinstance(value, float):
        encoded = b"F" + value.hex().encode("ascii")
    else:
        encoded = b"T" + str(value).encode("utf-8")
    digest.update(len(encoded).to_bytes(8, "big"))
    digest.update(encoded)


def _table_content_hash(
    connection: sqlite3.Connection, table: str, columns: tuple[str, ...]
) -> str:
    digest = hashlib.sha256()
    for column in columns:
        _digest_value(digest, column)
    table_info = list(connection.execute(f'PRAGMA table_info("{table}")'))
    primary_key = tuple(
        row[1] for row in sorted(table_info, key=lambda row: row[5]) if row[5]
    )
    order_columns = primary_key or columns
    selected = ", ".join(f'"{column}"' for column in columns)
    order_by = ", ".join(f'"{column}"' for column in order_columns)
    for row in connection.execute(
        f'SELECT {selected} FROM "{table}" ORDER BY {order_by}'
    ):
        digest.update(b"R")
        for value in row:
            _digest_value(digest, value)
    return digest.hexdigest()


def _table_content_hashes(
    connection: sqlite3.Connection, tables: set[str]
) -> tuple[dict[str, tuple[str, ...]], dict[str, str]]:
    content_columns: dict[str, tuple[str, ...]] = {}
    content_hashes: dict[str, str] = {}
    for table in CRITICAL_DATA_TABLES:
        if table not in tables:
            continue
        columns = tuple(
            row[1] for row in connection.execute(f'PRAGMA table_info("{table}")')
        )
        content_columns[table] = columns
        content_hashes[table] = _table_content_hash(connection, table, columns)
    return content_columns, content_hashes


def _check_face_embeddings(
    connection: sqlite3.Connection,
    tables: set[str],
    decryptor: Decryptor,
) -> int:
    if "faces" not in tables:
        return 0

    face_columns = {row[1] for row in connection.execute('PRAGMA table_info("faces")')}
    required = {"person_id", "embedding", "embedding_dimension"}
    if not required.issubset(face_columns):
        raise MigrationSafetyError(
            "Faces table is missing required columns: "
            + ", ".join(sorted(required - face_columns))
        )

    where = "WHERE is_deleted = 0" if "is_deleted" in face_columns else ""
    checked = 0
    for person_id, encrypted, dimension in connection.execute(
        "SELECT person_id, embedding, embedding_dimension FROM faces " + where
    ):
        try:
            plaintext = decryptor(bytes(encrypted))
        except Exception as exc:
            raise MigrationSafetyError(
                "Biometric encryption key validation failed for enrolled face "
                f"'{person_id}'. The database was not changed."
            ) from exc

        expected_bytes = int(dimension) * 4
        if len(plaintext) != expected_bytes:
            raise MigrationSafetyError(
                f"Face '{person_id}' decrypted to {len(plaintext)} bytes; "
                f"expected {expected_bytes}. The database was not changed."
            )
        checked += 1
    return checked


def _preflight_database(
    db_path: Path,
    script_directory: ScriptDirectory,
    decryptor: Decryptor,
    *,
    allow_empty: bool = False,
) -> DatabaseReport:
    if not db_path.exists() or db_path.stat().st_size == 0:
        if allow_empty:
            return DatabaseReport((), {}, 0, {}, {})
        raise MigrationSafetyError(f"Database does not exist or is empty: {db_path}")

    try:
        with closing(_connect_read_only(db_path)) as connection:
            _check_integrity(connection)
            tables = _user_tables(connection)
            revisions = _read_revisions(connection, tables)
            domain_tables = tables - {"alembic_version"}
            if domain_tables and not revisions:
                raise MigrationSafetyError(
                    "Database contains application tables but has no Alembic revision. "
                    "Automatic schema guessing is disabled because it can corrupt a valid "
                    "database. Restore a verified snapshot or use the recovery tools."
                )
            if len(revisions) != len(set(revisions)):
                raise MigrationSafetyError(
                    "Database contains duplicate Alembic revisions."
                )
            _assert_known_revisions(revisions, script_directory)
            counts = _table_counts(connection, tables)
            content_columns, content_hashes = _table_content_hashes(connection, tables)
            faces_checked = _check_face_embeddings(connection, tables, decryptor)
            return DatabaseReport(
                revisions,
                counts,
                faces_checked,
                content_columns,
                content_hashes,
            )
    except MigrationSafetyError:
        raise
    except sqlite3.Error as exc:
        raise MigrationSafetyError(
            f"SQLite could not safely read '{db_path.name}': {exc}. "
            "The database was not changed."
        ) from exc


def _assert_model_schema(db_path: Path) -> None:
    from database.models import Base

    with closing(_connect_read_only(db_path)) as connection:
        tables = _user_tables(connection)
        missing_tables = sorted(set(Base.metadata.tables) - tables)
        if missing_tables:
            raise MigrationSafetyError(
                "Migrated database is missing model tables: "
                + ", ".join(missing_tables)
            )

        mismatches: list[str] = []
        for table_name, table in Base.metadata.tables.items():
            table_info = list(connection.execute(f'PRAGMA table_info("{table_name}")'))
            actual_columns = {row[1] for row in table_info}
            missing_columns = sorted(set(table.columns.keys()) - actual_columns)
            if missing_columns:
                mismatches.append(f"{table_name}: {', '.join(missing_columns)}")
            expected_primary_key = [column.name for column in table.primary_key.columns]
            actual_primary_key = [
                row[1] for row in sorted(table_info, key=lambda row: row[5]) if row[5]
            ]
            if actual_primary_key != expected_primary_key:
                mismatches.append(
                    f"{table_name}: primary key {actual_primary_key}, "
                    f"expected {expected_primary_key}"
                )
            actual_indexes = {
                row[1]
                for row in connection.execute(f'PRAGMA index_list("{table_name}")')
                if not row[1].startswith("sqlite_autoindex")
            }
            expected_indexes = {index.name for index in table.indexes if index.name}
            missing_indexes = sorted(expected_indexes - actual_indexes)
            if missing_indexes:
                mismatches.append(
                    f"{table_name}: missing indexes {', '.join(missing_indexes)}"
                )

        actual_triggers = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='trigger'"
            )
        }
        missing_triggers = sorted(REQUIRED_TRIGGERS - actual_triggers)
        if missing_triggers:
            mismatches.append("missing triggers: " + ", ".join(missing_triggers))
        if mismatches:
            raise MigrationSafetyError(
                "Migrated database does not match the application model: "
                + "; ".join(mismatches)
            )


def _assert_no_orphaned_batch_tables(db_path: Path) -> None:
    orphaned = _orphaned_batch_tables(db_path)
    if orphaned:
        raise MigrationSafetyError(
            "Migrated candidate contains orphaned Alembic tables: "
            + ", ".join(orphaned)
        )


def _orphaned_batch_tables(db_path: Path) -> list[str]:
    with closing(_connect_read_only(db_path)) as connection:
        return [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name LIKE '_alembic_tmp_%'"
            )
        ]


def _validate_candidate(
    db_path: Path,
    script_directory: ScriptDirectory,
    expected_heads: tuple[str, ...],
    source_report: DatabaseReport,
    decryptor: Decryptor,
    *,
    require_canonical_schema: bool = True,
) -> DatabaseReport:
    report = _preflight_database(db_path, script_directory, decryptor)
    if report.revisions != expected_heads:
        raise MigrationSafetyError(
            f"Candidate revision mismatch: expected {expected_heads}, "
            f"found {report.revisions}."
        )
    lost_rows = {
        table: (count, report.counts.get(table))
        for table, count in source_report.counts.items()
        if report.counts.get(table) != count
    }
    if lost_rows:
        raise MigrationSafetyError(
            f"Candidate row-count validation failed: {lost_rows}"
        )
    changed_content = {
        table: (expected_hash, report.content_hashes.get(table))
        for table, expected_hash in source_report.content_hashes.items()
        if report.content_columns.get(table) == source_report.content_columns.get(table)
        and report.content_hashes.get(table) != expected_hash
    }
    if changed_content:
        raise MigrationSafetyError(
            "Candidate content validation failed for unchanged schemas: "
            + ", ".join(sorted(changed_content))
        )
    _assert_no_orphaned_batch_tables(db_path)
    _assert_model_schema(db_path)
    if require_canonical_schema:
        _assert_canonical_head_schema(db_path)
    return report


def _canonical_table_sql(sql: str) -> str:
    """Normalize harmless table-constraint ordering without hiding column order."""

    normalized = " ".join(sql.split())
    opening = normalized.find("(")
    closing = normalized.rfind(")")
    if opening < 0 or closing <= opening:
        return normalized

    body = normalized[opening + 1 : closing]
    clauses: list[str] = []
    start = 0
    depth = 0
    quote: str | None = None
    index = 0
    while index < len(body):
        character = body[index]
        if quote is not None:
            if quote == "]" and character == "]":
                quote = None
            elif quote != "]" and character == quote:
                if index + 1 < len(body) and body[index + 1] == quote:
                    index += 1
                else:
                    quote = None
        elif character in {'"', "'", "`"}:
            quote = character
        elif character == "[":
            quote = "]"
        elif character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
        elif character == "," and depth == 0:
            clauses.append(body[start:index].strip())
            start = index + 1
        index += 1
    clauses.append(body[start:].strip())

    table_constraints: list[str] = []
    column_definitions: list[str] = []
    constraint_prefixes = (
        "CONSTRAINT ",
        "PRIMARY KEY",
        "UNIQUE",
        "CHECK",
        "FOREIGN KEY",
    )
    for clause in clauses:
        if clause.upper().startswith(constraint_prefixes):
            table_constraints.append(clause)
        else:
            column_definitions.append(clause)
    canonical_body = ", ".join(column_definitions + sorted(table_constraints))
    return f"{normalized[: opening + 1]}{canonical_body}{normalized[closing:]}"


def _schema_fingerprint(db_path: Path) -> str:
    digest = hashlib.sha256()
    with closing(_connect_read_only(db_path)) as connection:
        rows = connection.execute(
            "SELECT type,name,tbl_name,sql FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
        )
        for object_type, name, table_name, sql in rows:
            normalized_sql = " ".join((sql or "").split())
            if object_type == "table" and sql:
                normalized_sql = _canonical_table_sql(sql)
            for value in (object_type, name, table_name, normalized_sql):
                _digest_value(digest, value)
            if object_type == "table":
                escaped_name = name.replace('"', '""')
                for column in connection.execute(
                    f'PRAGMA table_xinfo("{escaped_name}")'
                ):
                    _digest_value(digest, tuple(column))
    return digest.hexdigest()


def _assert_canonical_head_schema(db_path: Path) -> None:
    reference = db_path.with_name(f".schema-reference-{uuid.uuid4().hex}.db")
    try:
        reference.touch(exist_ok=False)
        _upgrade_database(reference)
        expected = _schema_fingerprint(reference)
        actual = _schema_fingerprint(db_path)
        if actual != expected:
            raise MigrationSafetyError(
                "Migrated database schema differs from a clean database at the same head."
            )
    finally:
        reference.unlink(missing_ok=True)


def _cleanup_candidate_batch_tables(db_path: Path) -> None:
    """Clean interrupted Alembic artifacts on a disposable candidate only."""
    with closing(sqlite3.connect(db_path, timeout=30)) as connection:
        orphaned = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name LIKE '_alembic_tmp_%'"
            )
        ]
        for table in orphaned:
            escaped = table.replace('"', '""')
            connection.execute(f'DROP TABLE "{escaped}"')
        connection.commit()


def _upgrade_database(db_path: Path) -> None:
    command.upgrade(_alembic_config(db_path), "head")


def _upgrade_database_to_revision(db_path: Path, revision: str) -> None:
    """Upgrade a database to a revision."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    command.upgrade(_alembic_config(db_path), revision)


def _fsync_file(path: Path) -> None:
    # Windows requires a writable file handle for FlushFileBuffers/os.fsync.
    with path.open("r+b") as stream:
        os.fsync(stream.fileno())


def _online_backup(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise MigrationSafetyError(f"Refusing to overwrite snapshot: {destination}")
    try:
        with closing(_connect_read_only(source)) as source_connection:
            with closing(
                sqlite3.connect(destination, timeout=30)
            ) as destination_connection:
                destination_connection.execute("PRAGMA synchronous=FULL")
                source_connection.backup(destination_connection, pages=256, sleep=0.01)
                destination_connection.commit()
        _fsync_file(destination)
        with closing(_connect_read_only(destination)) as verification:
            _check_integrity(verification)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def _assert_migration_disk_space(db_path: Path, data_dir: Path) -> None:
    source_bytes = db_path.stat().st_size
    for suffix in ("-wal", "-shm", "-journal"):
        sidecar = db_path.with_name(db_path.name + suffix)
        if sidecar.exists():
            source_bytes += sidecar.stat().st_size
    # Recovery snapshot + candidate + Alembic's largest batch-copy table.
    required = max(MINIMUM_MIGRATION_HEADROOM, source_bytes * 3)
    available = shutil.disk_usage(data_dir).free
    if available < required:
        raise MigrationSafetyError(
            "Not enough free disk space for a recoverable migration. "
            f"Required at least {required} bytes; available {available} bytes. "
            "The database was not changed."
        )


def _copy_machine_key_files(source_dir: Path, destination_dir: Path) -> None:
    destination_dir.mkdir(parents=True, exist_ok=True)
    for filename in KEY_FILENAMES:
        source = source_dir / filename
        if source.exists():
            destination = destination_dir / filename
            _copy_file_atomic(source, destination)


def _copy_file_atomic(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    try:
        with source.open("rb") as input_stream, temporary.open("xb") as output_stream:
            shutil.copyfileobj(input_stream, output_stream)
            output_stream.flush()
            os.fsync(output_stream.fileno())
        shutil.copystat(source, temporary)
        os.replace(temporary, destination)
        generations.secure_file(destination)
        generations.fsync_directory(destination.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _assert_preserved_content(
    source_db: Path | None,
    target_db: Path,
    source_report: DatabaseReport,
) -> None:
    if source_db is None:
        return
    changed: list[str] = []
    with (
        closing(_connect_read_only(source_db)) as source,
        closing(_connect_read_only(target_db)) as target,
    ):
        tables = _user_tables(target)
        for table, columns in source_report.content_columns.items():
            if table not in tables:
                changed.append(f"{table} (missing table)")
                continue
            target_columns = {
                row[1] for row in target.execute(f'PRAGMA table_info("{table}")')
            }
            dropped_columns = set(columns) - target_columns
            allowed_drops = ALLOWED_DROPPED_DATA_COLUMNS.get(table, set())
            unexpected_drops = dropped_columns - allowed_drops
            if unexpected_drops:
                changed.append(
                    f"{table} (unexpectedly dropped: {', '.join(sorted(unexpected_drops))})"
                )
                continue
            preserved_columns = tuple(
                column for column in columns if column not in dropped_columns
            )
            source_hash = _table_content_hash(source, table, preserved_columns)
            target_hash = _table_content_hash(target, table, preserved_columns)
            if target_hash != source_hash:
                changed.append(table)
    if changed:
        raise MigrationSafetyError(
            "Migration changed data in columns without an explicit transformation "
            "contract: " + ", ".join(changed)
        )


def _database_has_encrypted_faces(db_path: Path) -> bool:
    if not db_path.exists() or db_path.stat().st_size == 0:
        return False
    try:
        with closing(_connect_read_only(db_path)) as connection:
            tables = _user_tables(connection)
            if "faces" not in tables:
                return False
            columns = {
                row[1] for row in connection.execute('PRAGMA table_info("faces")')
            }
            where = "WHERE is_deleted = 0" if "is_deleted" in columns else ""
            return (
                connection.execute(
                    f"SELECT EXISTS(SELECT 1 FROM faces {where} LIMIT 1)"
                ).fetchone()[0]
                == 1
            )
    except sqlite3.Error:
        return True


def _legacy_source(data_dir: Path) -> tuple[Path | None, Path | None]:
    local = data_dir / DB_FILENAME
    if local.exists() and local.stat().st_size:
        return local, data_dir
    legacy_value = os.getenv(LEGACY_DATA_ENV)
    if legacy_value:
        legacy_dir = Path(legacy_value).resolve()
        legacy = legacy_dir / DB_FILENAME
        if legacy_dir != data_dir.resolve():
            if legacy.exists() and legacy.stat().st_size:
                return legacy, legacy_dir
            return None, legacy_dir
    return None, None


def _stage_legacy_key_material(data_dir: Path, legacy_dir: Path | None) -> None:
    if legacy_dir is None or legacy_dir.resolve() == data_dir.resolve():
        return
    data_dir.mkdir(parents=True, exist_ok=True)
    for filename in KEY_FILENAMES:
        source = legacy_dir / filename
        destination = data_dir / filename
        if source.is_file() and not destination.exists():
            _copy_file_atomic(source, destination)
    generations.fsync_directory(data_dir)


def _stage_legacy_face_database(data_dir: Path, legacy_dir: Path | None) -> None:
    if legacy_dir is None or legacy_dir.resolve() == data_dir.resolve():
        return
    source = legacy_dir / "face_database.db"
    destination = data_dir / "face_database.db"
    if source.is_file() and not destination.exists():
        _online_backup(source, destination)
        generations.secure_file(destination)


def _recover_machine_key_bundle(data_dir: Path) -> bool:
    """Restore root key metadata from a valid generation bundle."""

    from core.cipher import MachineKeyUnavailableError, get_machine_key_record

    root = generations.generations_root(data_dir)
    if not root.exists():
        return False
    candidates = sorted(
        (
            path
            for path in root.iterdir()
            if path.is_dir() and path.name.startswith("gen-")
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for candidate in candidates:
        try:
            record = get_machine_key_record(create_if_missing=False, data_dir=candidate)
            manifest = generations.read_generation_manifest(
                data_dir, candidate.name, record.key
            )
            if manifest.get("key_id") != record.key_id:
                continue
        except (
            MachineKeyUnavailableError,
            generations.GenerationStoreError,
            OSError,
            RuntimeError,
            ValueError,
        ):
            continue

        # Write authenticated metadata last for crash recovery.
        for filename in KEY_FILENAMES:
            if filename == ".machine_key.json":
                continue
            source = candidate / filename
            if source.is_file():
                _copy_file_atomic(source, data_dir / filename)
        metadata = candidate / ".machine_key.json"
        if metadata.is_file():
            _copy_file_atomic(metadata, data_dir / metadata.name)
        logger.warning(
            "Recovered machine-key material from generation %s.", candidate.name
        )
        return True
    return False


def _migration_crypto(
    data_dir: Path,
    source_db: Path | None,
    decryptor: Decryptor | None,
    authentication_key: bytes | None,
) -> tuple[Decryptor, bytes, str, str]:
    if authentication_key is not None:
        auth_key = authentication_key
        active_decryptor = decryptor or (lambda blob: blob)
        return (
            active_decryptor,
            auth_key,
            hashlib.sha256(auth_key).hexdigest(),
            "injected-test-key",
        )
    if decryptor is not None:
        auth_key = hashlib.sha256(
            b"facenox-generation-test\x00" + str(data_dir).encode("utf-8")
        ).digest()
        return (
            decryptor,
            auth_key,
            hashlib.sha256(auth_key).hexdigest(),
            "injected-test-key",
        )

    from core.cipher import (
        MachineKeyUnavailableError,
        decrypt_local_data,
        get_machine_key_record,
    )

    existing_store = generations.has_published_generations(data_dir)
    create_if_missing = not existing_store and not (
        source_db is not None and _database_has_encrypted_faces(source_db)
    )
    try:
        record = get_machine_key_record(
            create_if_missing=create_if_missing,
            data_dir=data_dir,
        )
    except MachineKeyUnavailableError:
        if not existing_store or not _recover_machine_key_bundle(data_dir):
            raise
        record = get_machine_key_record(create_if_missing=False, data_dir=data_dir)
    return (
        lambda blob: decrypt_local_data(blob, key=record.key, data_dir=data_dir),
        record.key,
        record.key_id,
        record.provider,
    )


def _copy_generation_key_material(data_dir: Path, generation_dir: Path) -> None:
    _copy_machine_key_files(data_dir, generation_dir)
    for filename in KEY_FILENAMES:
        generations.secure_file(generation_dir / filename)


def _generation_manifest_value(
    *,
    generation: str,
    sequence: int,
    source_generation: str | None,
    source_path: Path | None,
    report: DatabaseReport,
    db_path: Path,
    key_id: str,
    key_provider: str,
    kind: str,
) -> dict[str, object]:
    return {
        "generation": generation,
        "sequence": sequence,
        "kind": kind,
        "created_at_unix": time.time(),
        "source_generation": source_generation,
        "source_path": str(source_path) if source_path else None,
        "revisions": list(report.revisions),
        "counts": report.counts,
        "content_hashes": report.content_hashes,
        "faces_checked": report.faces_checked,
        "database_sha256_at_creation": _sha256(db_path),
        "schema_sha256": _schema_fingerprint(db_path),
        "key_id": key_id,
        "key_provider": key_provider,
    }


def _validate_generation(
    data_dir: Path,
    generation: str,
    script_directory: ScriptDirectory,
    decryptor: Decryptor,
    auth_key: bytes,
    key_id: str,
    *,
    verify_creation_hash: bool = False,
) -> tuple[DatabaseReport, dict[str, object]]:
    try:
        manifest = generations.read_generation_manifest(data_dir, generation, auth_key)
    except generations.GenerationStoreError as exc:
        raise MigrationSafetyError(str(exc)) from exc
    if manifest.get("key_id") != key_id:
        raise MigrationSafetyError(
            f"Generation '{generation}' belongs to a different biometric key."
        )
    db_path = generations.generation_database(data_dir, generation)
    report = _preflight_database(db_path, script_directory, decryptor)
    revisions = manifest.get("revisions")
    if not isinstance(revisions, list) or tuple(sorted(revisions)) != report.revisions:
        raise MigrationSafetyError(
            f"Generation '{generation}' revision does not match its manifest."
        )
    if verify_creation_hash and manifest.get("database_sha256_at_creation") != _sha256(
        db_path
    ):
        raise MigrationSafetyError(
            f"Generation '{generation}' changed before its first healthy startup."
        )
    return report, manifest


def _recover_or_read_pointer(
    data_dir: Path,
    script_directory: ScriptDirectory,
    decryptor: Decryptor,
    auth_key: bytes,
    key_id: str,
) -> generations.GenerationPointer | None:
    try:
        pointer = generations.read_pointer(data_dir, auth_key)
    except generations.GenerationStoreError:
        logger.exception("Generation pointer is invalid; scanning healthy generations.")
        pointer = None

    if pointer is not None:
        try:
            _validate_generation(
                data_dir,
                pointer.generation,
                script_directory,
                decryptor,
                auth_key,
                key_id,
            )
            return pointer
        except MigrationSafetyError:
            logger.exception(
                "Selected generation '%s' is invalid; scanning recovery generations.",
                pointer.generation,
            )

    for sequence, generation in generations.healthy_generation_candidates(
        data_dir, auth_key
    ):
        try:
            _, manifest = _validate_generation(
                data_dir,
                generation,
                script_directory,
                decryptor,
                auth_key,
                key_id,
            )
        except MigrationSafetyError:
            continue
        previous = manifest.get("source_generation")
        recovered = generations.GenerationPointer(
            generation,
            previous if isinstance(previous, str) else None,
            sequence,
            "healthy",
        )
        generations.write_pointer(data_dir, recovered, auth_key)
        logger.error("Recovered generation pointer to %s.", generation)
        return recovered
    return None


def _recover_unactivated_first_generation(
    data_dir: Path,
    script_directory: ScriptDirectory,
    decryptor: Decryptor,
    auth_key: bytes,
    key_id: str,
) -> generations.GenerationPointer | None:
    """Close the publish-before-pointer crash window for a new installation."""

    for sequence, generation in generations.published_generation_candidates(
        data_dir, auth_key
    ):
        try:
            _, manifest = _validate_generation(
                data_dir,
                generation,
                script_directory,
                decryptor,
                auth_key,
                key_id,
                verify_creation_hash=True,
            )
        except MigrationSafetyError:
            continue
        if manifest.get("source_generation") is not None:
            continue
        kind = manifest.get("kind")
        if kind not in {"legacy-adoption", "new-database"}:
            continue
        activation = "healthy" if kind == "legacy-adoption" else "pending"
        recovered = generations.GenerationPointer(
            generation, None, sequence, activation
        )
        if activation == "healthy":
            generations.write_health_marker(data_dir, generation, sequence, auth_key)
        generations.write_pointer(data_dir, recovered, auth_key)
        logger.error(
            "Recovered generation %s after publication was interrupted before "
            "pointer activation.",
            generation,
        )
        return recovered
    return None


def _publish_database_generation(
    *,
    data_dir: Path,
    source_db: Path | None,
    source_report: DatabaseReport,
    source_generation: str | None,
    sequence: int,
    script_directory: ScriptDirectory,
    decryptor: Decryptor,
    auth_key: bytes,
    key_id: str,
    key_provider: str,
    expected_revisions: tuple[str, ...],
    upgrade: bool,
    kind: str,
) -> tuple[str, DatabaseReport]:
    pending = generations.create_pending_generation(data_dir)
    pending_db = pending / DB_FILENAME
    generation = generations.new_generation_name(sequence)
    try:
        if source_db is None:
            pending_db.touch(exist_ok=False)
        else:
            _online_backup(source_db, pending_db)
        generations.secure_file(pending_db)
        _copy_generation_key_material(data_dir, pending)

        if upgrade:
            _cleanup_candidate_batch_tables(pending_db)
            _upgrade_database(pending_db)
            report = _validate_candidate(
                pending_db,
                script_directory,
                expected_revisions,
                source_report,
                decryptor,
            )
            _assert_preserved_content(source_db, pending_db, source_report)
        else:
            report = _preflight_database(pending_db, script_directory, decryptor)
            if report.revisions != expected_revisions:
                raise MigrationSafetyError(
                    f"Adopted generation revision mismatch: {report.revisions}"
                )
            _assert_preserved_content(source_db, pending_db, source_report)

        generations.fsync_file(pending_db)
        generations.write_generation_manifest(
            pending,
            _generation_manifest_value(
                generation=generation,
                sequence=sequence,
                source_generation=source_generation,
                source_path=source_db,
                report=report,
                db_path=pending_db,
                key_id=key_id,
                key_provider=key_provider,
                kind=kind,
            ),
            auth_key,
        )
        generations.publish_generation(pending, data_dir, generation)
        return generation, report
    except Exception:
        if pending.exists():
            generations.remove_generation_tree(pending, data_dir)
        raise


def _rollback_unhealthy_pointer(
    data_dir: Path,
    pointer: generations.GenerationPointer,
    script_directory: ScriptDirectory,
    decryptor: Decryptor,
    auth_key: bytes,
    key_id: str,
) -> generations.GenerationPointer:
    if pointer.activation != "pending":
        return pointer
    if generations.has_health_marker(data_dir, pointer.generation, auth_key):
        healthy = generations.GenerationPointer(
            pointer.generation,
            pointer.previous_generation,
            pointer.sequence,
            "healthy",
        )
        generations.write_pointer(data_dir, healthy, auth_key)
        return healthy
    if pointer.previous_generation is None:
        return pointer

    _, previous_manifest = _validate_generation(
        data_dir,
        pointer.previous_generation,
        script_directory,
        decryptor,
        auth_key,
        key_id,
    )
    previous_previous = previous_manifest.get("source_generation")
    rolled_back = generations.GenerationPointer(
        pointer.previous_generation,
        previous_previous if isinstance(previous_previous, str) else None,
        pointer.sequence - 1,
        "healthy",
    )
    generations.write_pointer(data_dir, rolled_back, auth_key)
    logger.error(
        "Rolled back generation %s because it never reached healthy startup; active=%s",
        pointer.generation,
        rolled_back.generation,
    )
    return rolled_back


def run_migrations(
    data_dir: Path | None = None,
    *,
    decryptor: Decryptor | None = None,
    authentication_key: bytes | None = None,
) -> MigrationResult:
    """Select or build the active database generation."""

    active_data_dir = (data_dir or DATA_DIR).resolve()
    active_data_dir.mkdir(parents=True, exist_ok=True)
    try:
        # Serialize first-run key creation.
        with generations.migration_lock(active_data_dir):
            source_db, source_dir = _legacy_source(active_data_dir)
            _stage_legacy_key_material(active_data_dir, source_dir)
            _stage_legacy_face_database(active_data_dir, source_dir)
            active_decryptor, auth_key, key_id, key_provider = _migration_crypto(
                active_data_dir, source_db, decryptor, authentication_key
            )
    except MigrationSafetyError:
        raise
    except generations.GenerationStoreError as exc:
        raise MigrationSafetyError(str(exc)) from exc
    except Exception as exc:
        raise MigrationSafetyError(
            f"Machine-key preparation failed safely: {type(exc).__name__}: {exc}"
        ) from exc

    script_directory = _script_directory(active_data_dir / DB_FILENAME)
    expected_heads = tuple(sorted(script_directory.get_heads()))
    if len(expected_heads) != 1:
        raise MigrationSafetyError(
            "Expected exactly one Alembic head, found: " + ", ".join(expected_heads)
        )

    try:
        lock_context = generations.migration_lock(active_data_dir)
        with lock_context:
            generations.cleanup_pending_generations(active_data_dir)
            pointer = _recover_or_read_pointer(
                active_data_dir,
                script_directory,
                active_decryptor,
                auth_key,
                key_id,
            )
            if pointer is None and generations.has_published_generations(
                active_data_dir
            ):
                pointer = _recover_unactivated_first_generation(
                    active_data_dir,
                    script_directory,
                    active_decryptor,
                    auth_key,
                    key_id,
                )
            if pointer is None and generations.has_published_generations(
                active_data_dir
            ):
                raise MigrationSafetyError(
                    "Published database generations exist, but none has a valid "
                    "authenticated health record. Automatic legacy fallback is "
                    "disabled to prevent silent data rollback."
                )
            if pointer is not None:
                pointer = _rollback_unhealthy_pointer(
                    active_data_dir,
                    pointer,
                    script_directory,
                    active_decryptor,
                    auth_key,
                    key_id,
                )

            storage_changed = False
            if pointer is None and source_db is not None:
                source_report = _preflight_database(
                    source_db, script_directory, active_decryptor
                )
                _assert_migration_disk_space(source_db, active_data_dir)
                adopted_generation, _ = _publish_database_generation(
                    data_dir=active_data_dir,
                    source_db=source_db,
                    source_report=source_report,
                    source_generation=None,
                    sequence=1,
                    script_directory=script_directory,
                    decryptor=active_decryptor,
                    auth_key=auth_key,
                    key_id=key_id,
                    key_provider=key_provider,
                    expected_revisions=source_report.revisions,
                    upgrade=False,
                    kind="legacy-adoption",
                )
                generations.write_health_marker(
                    active_data_dir, adopted_generation, 1, auth_key
                )
                pointer = generations.GenerationPointer(
                    adopted_generation, None, 1, "healthy"
                )
                generations.write_pointer(active_data_dir, pointer, auth_key)
                storage_changed = True

            if pointer is not None:
                source_db = generations.generation_database(
                    active_data_dir, pointer.generation
                )
                source_report, _ = _validate_generation(
                    active_data_dir,
                    pointer.generation,
                    script_directory,
                    active_decryptor,
                    auth_key,
                    key_id,
                )
                orphaned = _orphaned_batch_tables(source_db)
                if source_report.revisions == expected_heads and not orphaned:
                    _assert_model_schema(source_db)
                    set_active_database_path(source_db)
                    return MigrationResult(
                        storage_changed,
                        source_report.revisions,
                        expected_heads,
                        str(
                            generations.generation_directory(
                                active_data_dir, pointer.previous_generation
                            )
                        )
                        if pointer.previous_generation
                        else None,
                        pointer.generation,
                        pointer.previous_generation,
                        str(source_db),
                    )
                sequence = pointer.sequence + 1
                previous_generation = pointer.generation
            else:
                source_db = None
                source_report = DatabaseReport((), {}, 0, {}, {})
                sequence = 1
                previous_generation = None

            if source_db is not None:
                _assert_migration_disk_space(source_db, active_data_dir)
            new_generation, final_report = _publish_database_generation(
                data_dir=active_data_dir,
                source_db=source_db,
                source_report=source_report,
                source_generation=previous_generation,
                sequence=sequence,
                script_directory=script_directory,
                decryptor=active_decryptor,
                auth_key=auth_key,
                key_id=key_id,
                key_provider=key_provider,
                expected_revisions=expected_heads,
                upgrade=True,
                kind="schema-migration" if source_db else "new-database",
            )
            new_pointer = generations.GenerationPointer(
                new_generation,
                previous_generation,
                sequence,
                "pending",
            )
            generations.write_pointer(active_data_dir, new_pointer, auth_key)
            published_db = generations.generation_database(
                active_data_dir, new_generation
            )
            _validate_generation(
                active_data_dir,
                new_generation,
                script_directory,
                active_decryptor,
                auth_key,
                key_id,
                verify_creation_hash=True,
            )
            set_active_database_path(published_db)
            return MigrationResult(
                True,
                source_report.revisions,
                final_report.revisions,
                str(
                    generations.generation_directory(
                        active_data_dir, previous_generation
                    )
                )
                if previous_generation
                else None,
                new_generation,
                previous_generation,
                str(published_db),
            )
    except MigrationSafetyError:
        raise
    except generations.GenerationStoreError as exc:
        raise MigrationSafetyError(str(exc)) from exc
    except Exception as exc:
        raise MigrationSafetyError(
            "Generation migration failed before activation; the selected generation "
            f"was not replaced. Cause: {type(exc).__name__}: {exc}"
        ) from exc


def mark_active_generation_healthy(data_dir: Path | None = None) -> None:
    """Commit a pending pointer after the backend successfully opens the DB."""

    from core.cipher import decrypt_local_data, get_machine_key_record

    active_data_dir = (data_dir or DATA_DIR).resolve()
    record = get_machine_key_record(create_if_missing=False, data_dir=active_data_dir)

    def decryptor(blob: bytes) -> bytes:
        return decrypt_local_data(blob, key=record.key, data_dir=active_data_dir)

    script_directory = _script_directory(active_data_dir / DB_FILENAME)
    expected_heads = tuple(sorted(script_directory.get_heads()))
    with generations.migration_lock(active_data_dir):
        pointer = generations.read_pointer(active_data_dir, record.key)
        if pointer is None or pointer.activation == "healthy":
            return
        report, _ = _validate_generation(
            active_data_dir,
            pointer.generation,
            script_directory,
            decryptor,
            record.key,
            record.key_id,
        )
        if report.revisions != expected_heads:
            raise MigrationSafetyError(
                f"Cannot mark non-head generation healthy: {report.revisions}"
            )
        generations.write_health_marker(
            active_data_dir, pointer.generation, pointer.sequence, record.key
        )
        healthy = generations.GenerationPointer(
            pointer.generation,
            pointer.previous_generation,
            pointer.sequence,
            "healthy",
        )
        generations.write_pointer(active_data_dir, healthy, record.key)
        generations.prune_generations(active_data_dir, healthy)
