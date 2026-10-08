import logging
import sqlite3
import time
from alembic.config import Config
from alembic import command
from alembic.script import ScriptDirectory

from config.paths import ALEMBIC_CONFIG_PATH, DATA_DIR, MIGRATIONS_DIR

logger = logging.getLogger(__name__)


def verify_and_repair_database():
    """Verify database integrity. If corrupted, archive the malformed database file
    to trigger a fresh database creation and subsequent synchronization.
    """
    db_path = DATA_DIR / "attendance.db"
    if not db_path.exists():
        return

    logger.info("Checking database integrity for %s...", db_path)
    try:
        # Run integrity check synchronously using standard sqlite3
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        cursor.execute(
            "PRAGMA integrity_check(1);"
        )  # Check the first error page for speed
        result = cursor.fetchone()
        conn.close()

        if result and result[0] != "ok":
            raise sqlite3.DatabaseError(f"Integrity check failed: {result[0]}")

        logger.info("Database integrity verified successfully.")
    except (sqlite3.DatabaseError, sqlite3.OperationalError) as e:
        logger.error(
            f"[DB_CORRUPTION] Corrupted database detected! Error: {e}",
            exc_info=True,
        )

        # Archive corrupted database file and its sidecar files (WAL, SHM, journal) to prevent
        # the new database connection from trying to parse mismatched/orphaned journal files.
        timestamp = int(time.time())
        db_files = [
            (db_path, DATA_DIR / f"attendance.db.corrupt_{timestamp}"),
            (
                db_path.with_name(db_path.name + "-wal"),
                DATA_DIR / f"attendance.db-wal.corrupt_{timestamp}",
            ),
            (
                db_path.with_name(db_path.name + "-shm"),
                DATA_DIR / f"attendance.db-shm.corrupt_{timestamp}",
            ),
            (
                db_path.with_name(db_path.name + "-journal"),
                DATA_DIR / f"attendance.db-journal.corrupt_{timestamp}",
            ),
        ]

        for src, dest in db_files:
            if src.exists():
                try:
                    src.rename(dest)
                    logger.warning(
                        f"[DB_CORRUPTION] Successfully archived {src.name} to {dest.name}"
                    )
                except Exception as rename_err:
                    logger.error(
                        f"[DB_CORRUPTION] Failed to archive {src.name}: {rename_err}. Deleting file."
                    )
                    try:
                        src.unlink(missing_ok=True)
                    except Exception as unlink_err:
                        logger.critical(
                            f"[DB_CORRUPTION] Fatal: Unable to remove {src.name}: {unlink_err}"
                        )


def check_and_stamp_baseline(db_path, alembic_cfg):
    """Check the database schema to detect which Alembic migration revision
    it matches, and stamp the database with that revision if the alembic_version
    table is missing or empty. This prevents duplicate table/column creation errors.
    """
    if not db_path.exists():
        return

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # Check if attendance_groups table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_groups';"
        )
        has_groups_table = cursor.fetchone() is not None

        if not has_groups_table:
            conn.close()
            return

        # Check if alembic_version table exists and has a row
        has_version = False
        try:
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version';"
            )
            if cursor.fetchone() is not None:
                cursor.execute("SELECT version_num FROM alembic_version;")
                if cursor.fetchone() is not None:
                    has_version = True
        except sqlite3.OperationalError:
            pass

        if has_version:
            conn.close()
            return

        # Detect the appropriate revision based on schema characteristics
        # Get columns of attendance_groups
        cursor.execute("PRAGMA table_info(attendance_groups);")
        group_cols = [row[1] for row in cursor.fetchall()]

        # Get columns of attendance_records
        cursor.execute("PRAGMA table_info(attendance_records);")
        record_cols = [row[1] for row in cursor.fetchall()]

        # Check if attendance_group_rules table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='attendance_group_rules';"
        )
        has_rules_table = cursor.fetchone() is not None

        conn.close()

        target_revision = "9d9c0b4c6a01"  # Default to baseline schema

        if "description" not in group_cols:
            # Column 'description' was dropped in 2c0e0f2c3bf3
            if "is_voided" in record_cols:
                # Post-merge schemas: stamp at the merge node or later.
                # The drop-consent migration (f2b3c4d5e6f7) is the current head;
                # stamping at c9d8e7f6a5b4 lets Alembic run forward from there.
                target_revision = "c9d8e7f6a5b4"
            elif has_rules_table:
                target_revision = (
                    "c9d8e7f6a5b4"  # Merge node for rules and face settings
                )
            else:
                target_revision = "2c0e0f2c3bf3"

        logger.warning(
            f"Database tables detected but no Alembic version found. "
            f"Detected current schema matches revision '{target_revision}'. Stamping..."
        )
        command.stamp(alembic_cfg, target_revision)
        logger.info(f"Database successfully stamped to '{target_revision}'.")

    except Exception as e:
        logger.error("Failed to check or stamp baseline version: %s", e, exc_info=True)


def cleanup_orphaned_alembic_tables():
    """Clean up leftover temp tables from failed/interrupted migrations.

    Alembic uses batch copy-and-move strategy for SQLite migrations, which leaves
    orphaned '_alembic_tmp_*' tables on abrupt termination, blocking subsequent boots.
    """
    db_path = DATA_DIR / "attendance.db"
    if not db_path.exists():
        return

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # Identify temporary tables to avoid sqlite3.OperationalError: table already exists.
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_alembic_tmp_%';"
        )
        temp_tables = [row[0] for row in cursor.fetchall()]

        if temp_tables:
            logger.warning(
                "Orphaned Alembic temporary tables detected: %s. Cleaning up...",
                temp_tables,
            )
            for table in temp_tables:
                cursor.execute(f"DROP TABLE IF EXISTS {table};")
            conn.commit()
            logger.info("Successfully removed all orphaned temporary tables.")

        conn.close()
    except Exception as e:
        logger.error(
            "Failed to clean up orphaned Alembic temporary tables: %s", e, exc_info=True
        )


def run_migrations():
    """Run alembic upgrade head programmatically."""
    # First, verify database integrity and perform self-healing if corrupted
    verify_and_repair_database()

    # Clean up any leftover temporary tables to prevent migration lockups
    cleanup_orphaned_alembic_tables()

    db_path = DATA_DIR / "attendance.db"
    logger.info("Checking for database migrations in %s...", db_path)

    alembic_cfg = Config(str(ALEMBIC_CONFIG_PATH))

    # Ensure script_location points to the correct absolute path.
    # This is critical for frozen environments.
    alembic_cfg.set_main_option("script_location", str(MIGRATIONS_DIR))

    script_dir = ScriptDirectory.from_config(alembic_cfg)
    heads = script_dir.get_heads()
    if len(heads) > 1:
        raise RuntimeError(
            f"Multiple Alembic heads detected: {', '.join(heads)}. "
            "Create a merge revision before starting the backend."
        )

    # Perform self-healing check if migrations are in an inconsistent/partially created state
    check_and_stamp_baseline(db_path, alembic_cfg)

    try:
        command.upgrade(alembic_cfg, "head")
        logger.info("Database migration check complete (head).")
    except Exception:
        logger.exception("Failed to run database migrations.")
        raise
