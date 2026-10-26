from logging.config import fileConfig

from sqlalchemy import pool, engine_from_config

from alembic import context

import sys

# Add server directory to path using config
from config.paths import BASE_DIR

sys.path.append(str(BASE_DIR))


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def get_target_metadata():
    from database.models import Base

    return Base.metadata


def get_db_url():
    configured_url = config.get_main_option("sqlalchemy.url")
    if configured_url and not configured_url.startswith("driver://"):
        return configured_url

    from database.session import DATABASE_URL

    return DATABASE_URL


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_db_url()
    if url.startswith("sqlite+aiosqlite://"):
        url = url.replace("sqlite+aiosqlite://", "sqlite://")
    context.configure(
        url=url,
        target_metadata=get_target_metadata(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    url = get_db_url()
    if url.startswith("sqlite+aiosqlite://"):
        url = url.replace("sqlite+aiosqlite://", "sqlite://")

    # Update config with correct database URL
    current_config = config.get_section(config.config_ini_section, {})
    current_config["sqlalchemy.url"] = url

    connectable = engine_from_config(
        current_config,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=get_target_metadata(),
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
