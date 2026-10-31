from unittest.mock import AsyncMock, Mock

import numpy as np
import pytest

from core.models.face_recognizer.recognizer import FaceRecognizer


@pytest.fixture
def recognizer():
    recognizer = FaceRecognizer.__new__(FaceRecognizer)
    embedding = np.ones(512, dtype=np.float32) / np.sqrt(512)
    recognizer._extract_embeddings = AsyncMock(return_value=[embedding])
    recognizer._refresh_cache = AsyncMock()
    recognizer._get_db_manager = Mock(
        return_value=Mock(
            add_person=AsyncMock(return_value=True),
            get_stats=AsyncMock(return_value={"total_persons": 1}),
        )
    )
    return recognizer


async def enroll(recognizer):
    return await recognizer.enroll_person(
        "person-one", np.zeros((112, 112, 3), dtype=np.uint8), [], "org-one"
    )


async def test_failed_save_does_not_report_success_or_refresh_cache(recognizer):
    manager = recognizer._get_db_manager.return_value
    manager.add_person.return_value = False

    result = await enroll(recognizer)

    assert result["success"] is False
    assert result["database_saved"] is False
    assert result["error"] == "Failed to save face data. Please try enrolling again."
    manager.get_stats.assert_not_awaited()
    recognizer._refresh_cache.assert_not_awaited()


async def test_missing_database_manager_rejects_enrollment(recognizer):
    recognizer._get_db_manager.return_value = None

    result = await enroll(recognizer)

    assert result["success"] is False
    assert result["database_saved"] is False
    assert (
        result["error"]
        == "Face storage is unavailable. Please restart Facenox and try again."
    )
    recognizer._refresh_cache.assert_not_awaited()


async def test_successful_save_refreshes_the_organization_cache(recognizer):
    result = await enroll(recognizer)

    assert result == {
        "success": True,
        "person_id": "person-one",
        "database_saved": True,
        "total_persons": 1,
    }
    recognizer._get_db_manager.assert_called_once_with("org-one")
    recognizer._refresh_cache.assert_awaited_once_with("org-one")


async def test_embedding_failure_does_not_attempt_to_save(recognizer):
    recognizer._extract_embeddings.return_value = []

    result = await enroll(recognizer)

    assert result["success"] is False
    recognizer._get_db_manager.assert_not_called()
    recognizer._refresh_cache.assert_not_awaited()
