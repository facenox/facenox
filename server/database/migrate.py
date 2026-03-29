import logging
from alembic.config import Config
from alembic import command
from alembic.script import ScriptDirectory

from config.paths import ALEMBIC_CONFIG_PATH, DATA_DIR, MIGRATIONS_DIR

logger = logging.getLogger(__name__)


def run_migrations():
    """Run alembic upgrade head programmatically."""
    logger.info("Checking for database migrations in %s...", DATA_DIR / "attendance.db")

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

    try:
        command.upgrade(alembic_cfg, "head")
        logger.info("Database migration check complete (head).")
    except Exception:
        logger.exception("Failed to run database migrations.")
        raise
