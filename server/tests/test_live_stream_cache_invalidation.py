import pytest
import numpy as np
from unittest.mock import AsyncMock, patch

from services.live_stream_service import (
    LiveStreamService,
    LiveGroupContext,
)


@pytest.mark.asyncio
async def test_live_stream_service_cache_invalidation_flow():
    # 1. Create service and session config
    service = LiveStreamService(organization_id="test_org")
    config = await service.load_initial_config()

    assert config in LiveStreamService._active_configs
    assert config.organization_id == "test_org"
    initial_version = LiveStreamService.get_db_version("test_org")

    # Mock _fetch_group_context to return simulated context
    mock_context_v1 = LiveGroupContext(
        group_id="group_1",
        group_exists=True,
        allowed_person_ids={"person_1"},
        group_matrix=np.ones((1, 512), dtype=np.float32),
        person_index_map=["person_1"],
    )

    mock_context_v2 = LiveGroupContext(
        group_id="group_1",
        group_exists=True,
        allowed_person_ids={"person_1", "person_2"},
        group_matrix=np.ones((2, 512), dtype=np.float32),
        person_index_map=["person_1", "person_2"],
    )

    with patch.object(
        service, "_fetch_group_context", new_callable=AsyncMock
    ) as mock_fetch:
        mock_fetch.return_value = mock_context_v1

        config.active_group_id = "group_1"
        ctx1 = await service.ensure_group_context(config)

        assert ctx1.allowed_person_ids == {"person_1"}
        assert len(ctx1.person_index_map) == 1
        assert not config.is_dirty
        assert mock_fetch.call_count == 1

        # Calling ensure_group_context again without invalidation should bypass fetch
        ctx_cached = await service.ensure_group_context(config)
        assert ctx_cached.allowed_person_ids == {"person_1"}
        assert mock_fetch.call_count == 1

        # Now simulate a face enrollment in the organization
        mock_fetch.return_value = mock_context_v2
        LiveStreamService.invalidate_all("test_org")

        assert config.is_dirty is True
        assert LiveStreamService.get_db_version("test_org") > initial_version

        # On the next frame / call, ensure_group_context MUST detect dirty/stale version and re-fetch!
        ctx2 = await service.ensure_group_context(config)
        assert ctx2.allowed_person_ids == {"person_1", "person_2"}
        assert len(ctx2.person_index_map) == 2
        assert mock_fetch.call_count == 2
        assert not config.is_dirty

    # Clean up
    LiveStreamService.unregister_config(config)
    assert config not in LiveStreamService._active_configs
