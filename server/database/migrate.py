import logging
from alembic.config import Config
from alembic import command
from config.paths import ALEMBIC_CONFIG_PATH, MIGRATIONS_DIR

logger = logging.getLogger(__name__)


def run_migrations():
    """Run alembic upgrade head programmatically."""
    try:
        logger.info("Checking for database migrations...")

        alembic_cfg = Config(str(ALEMBIC_CONFIG_PATH))

        # Ensure script_location points to the correct absolute path
        # This is critical for frozen environments
        alembic_cfg.set_main_option("script_location", str(MIGRATIONS_DIR))

        command.upgrade(alembic_cfg, "head")

        logger.info("Database migration check complete (head).")
    except Exception as e:
        logger.error(f"Failed to run database migrations: {e}")
        # We don't necessarily want to crash the whole app if migrations fail,
        # but it depends on if the DB is in a usable state.
        # For a desktop app, we'll log it and proceed.
