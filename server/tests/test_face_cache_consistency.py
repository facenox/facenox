import asyncio
from unittest.mock import AsyncMock

import numpy as np
import pytest

from core.models.face_recognizer.recognizer import FaceRecognizer
from database.face import FaceDatabaseManager
from database.repository import AttendanceRepository
from services.live_stream_service import LiveSessionConfig, LiveStreamService


@pytest.mark.parametrize("action", ["reenroll", "remove"])
async def test_face_change_waits_for_older_cache_read_and_refreshes_live_matrix(
    async_session_factory,
    monkeypatch,
    action,
):
    import core.lifespan
    import database.face as face_module
    import database.session as session_module

    monkeypatch.setattr(face_module, "AsyncSessionLocal", async_session_factory)
    monkeypatch.setattr(session_module, "AsyncSessionLocal", async_session_factory)
    recognizer = FaceRecognizer.__new__(FaceRecognizer)
    recognizer.legacy_sqlite_path = "unused.db"
    recognizer.db_manager = FaceDatabaseManager()
    recognizer._db_managers = {}
    recognizer._persons_cache = {}
    recognizer._cache_timestamp = {}
    recognizer._cache_ttl = 60.0
    recognizer._cache_locks = {}
    recognizer.similarity_threshold = 0.45
    monkeypatch.setattr(core.lifespan, "face_recognizer", recognizer)

    scope = "cache-org"
    old = np.zeros(512, np.float32)
    old[0] = 1
    new = np.zeros(512, np.float32)
    new[1] = 1
    manager = recognizer._get_db_manager(scope)
    assert await manager.add_person("p", old)
    async with async_session_factory() as session:
        repo = AttendanceRepository(session, scope)
        await repo.create_group({"id": "g", "name": "Group"})
        await repo.add_member({"person_id": "p", "group_id": "g", "name": "Member"})
        await session.commit()

    service = LiveStreamService(scope)
    config = LiveSessionConfig(organization_id=scope, active_group_id="g")
    LiveStreamService.register_config(config)
    snapshot_ready = asyncio.Event()
    release_old_read = asyncio.Event()
    write_committed = asyncio.Event()

    class DelayedSessionExit:
        """Delay completion of the old real SQL read, after its snapshot is read."""

        def __init__(self):
            self.session = async_session_factory()

        async def __aenter__(self):
            return await self.session.__aenter__()

        async def __aexit__(self, *args):
            result = await self.session.__aexit__(*args)
            if asyncio.current_task().get_name() == "old-cache-read":
                snapshot_ready.set()
                await release_old_read.wait()
            return result

    pending = mutation = None
    try:
        initial_context = await service.ensure_group_context(config)
        np.testing.assert_array_equal(initial_context.group_matrix[0], old)
        # Force the normal TTL reload path while keeping the live matrix warm.
        recognizer._cache_timestamp[scope] = 0
        monkeypatch.setattr(face_module, "AsyncSessionLocal", DelayedSessionExit)
        pending = asyncio.create_task(
            recognizer.export_embeddings(scope), name="old-cache-read"
        )
        await asyncio.wait_for(snapshot_ready.wait(), 5)

        method_name = "add_person" if action == "reenroll" else "remove_person"
        original_write = getattr(manager, method_name)

        async def commit_write(*args):
            result = await original_write(*args)
            assert result
            write_committed.set()
            return result

        monkeypatch.setattr(manager, method_name, commit_write)
        image = np.zeros((112, 112, 3), np.uint8)
        if action == "reenroll":
            recognizer._extract_embeddings = AsyncMock(return_value=[new])
            change = recognizer.enroll_person("p", image, [], scope)
        else:
            change = recognizer.remove_person("p", scope)
        mutation = asyncio.create_task(change)
        await asyncio.wait_for(write_committed.wait(), 5)
        # The write can commit concurrently, but success waits for cache coherence.
        assert not mutation.done()
        release_old_read.set()
        await asyncio.wait_for(pending, 5)
        result = await asyncio.wait_for(mutation, 5)
        assert result["success"], result

        context = await service.ensure_group_context(config)
        assert context is not initial_context
        if action == "reenroll":
            np.testing.assert_array_equal(await manager.get_person("p"), new)
            np.testing.assert_array_equal(recognizer._persons_cache[scope]["p"], new)
            np.testing.assert_array_equal(context.group_matrix[0], new)
        else:
            assert await manager.get_person("p") is None
            assert recognizer._persons_cache[scope] == {}
            assert context.group_matrix is None
            assert context.person_index_map == []

        recognizer._extract_embeddings = AsyncMock(return_value=[old])
        matches = await recognizer.recognize_faces(
            image,
            [{"landmarks_5": []}],
            ["p"],
            scope,
            prebuilt_matrix=context.group_matrix,
            person_index_map=context.person_index_map,
        )
        assert matches[0]["person_id"] is None
    finally:
        release_old_read.set()
        for task in (pending, mutation):
            if task is not None and not task.done():
                task.cancel()
        await asyncio.gather(
            *(task for task in (pending, mutation) if task is not None),
            return_exceptions=True,
        )
        LiveStreamService.unregister_config(config)
