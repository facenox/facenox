import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


async def _create_schema(engine) -> None:
    from database.models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _clear_websocket_state() -> None:
    from utils.websocket_manager import manager, notification_manager

    manager.active_connections.clear()
    manager.connection_metadata.clear()
    manager.streaming_tasks.clear()
    manager.fps_tracking.clear()
    manager.face_trackers.clear()
    notification_manager.active_connections.clear()
    notification_manager.connection_metadata.clear()
    notification_manager.streaming_tasks.clear()
    notification_manager.fps_tracking.clear()
    notification_manager.face_trackers.clear()


@pytest.fixture
def async_session_factory(tmp_path):
    db_path = tmp_path / "attendance-test.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    asyncio.run(_create_schema(engine))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield session_factory
    finally:
        asyncio.run(engine.dispose())


@pytest.fixture
def test_client(tmp_path, monkeypatch):
    from api.deps import get_db
    import database.session as database_session
    from main import app

    db_path = tmp_path / "attendance-api.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    asyncio.run(_create_schema(engine))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def no_op_lifespan(_app):
        yield

    monkeypatch.setattr(database_session, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(app.router, "lifespan_context", no_op_lifespan)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client, session_factory
    finally:
        app.dependency_overrides.clear()
        app.router.lifespan_context = original_lifespan
        _clear_websocket_state()
        asyncio.run(engine.dispose())


@pytest.fixture
def set_api_token(monkeypatch):
    def _setter(token: str) -> str:
        old = os.environ.get("FACENOX_API_TOKEN")
        monkeypatch.setenv("FACENOX_API_TOKEN", token)
        return old or ""

    return _setter
