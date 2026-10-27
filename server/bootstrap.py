import os

from config.paths import ACTIVE_DATABASE_ENV


def ensure_database_selected() -> None:
    if os.getenv(ACTIVE_DATABASE_ENV):
        return
    from database.migrate import run_migrations

    run_migrations()
