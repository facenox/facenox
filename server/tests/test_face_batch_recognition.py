import numpy as np
import pytest
from unittest.mock import AsyncMock
from core.models.face_recognizer.recognizer import FaceRecognizer


@pytest.mark.asyncio
async def test_batch_recognition_preserves_valid_faces_when_one_alignment_fails():
    recognizer = FaceRecognizer.__new__(FaceRecognizer)
    recognizer.similarity_threshold = 0.5
    recognizer._cache_locks = {}
    recognizer._persons_cache = {}
    recognizer._cache_timestamp = {}
    recognizer._cache_ttl = 60

    # Mock database
    person_emb = np.zeros(512, dtype=np.float32)
    person_emb[0] = 1.0
    db = {"person_alice": person_emb}
    recognizer._get_database = AsyncMock(return_value=db)

    # 3 faces: face 0 is valid, face 1 failed alignment (None), face 2 is valid
    extracted_embeddings = [person_emb, None, person_emb]
    recognizer._extract_embeddings = AsyncMock(return_value=extracted_embeddings)

    dummy_image = np.zeros((100, 100, 3), dtype=np.uint8)
    faces = [
        {"landmarks_5": [[10, 10], [20, 10], [15, 15], [12, 20], [18, 20]]},
        {"landmarks_5": None},
        {"landmarks_5": [[30, 30], [40, 30], [35, 35], [32, 40], [38, 40]]},
    ]

    results = await recognizer.recognize_faces(dummy_image, faces)

    assert len(results) == 3
    # Face 0 was recognized
    assert results[0]["success"] is True
    assert results[0]["person_id"] == "person_alice"
    assert results[0]["similarity"] > 0.99

    # Face 1 failed alignment, did NOT crash the batch
    assert results[1]["success"] is False
    assert results[1]["person_id"] is None
    assert results[1]["error"] == "Face alignment failed"

    # Face 2 was also recognized
    assert results[2]["success"] is True
    assert results[2]["person_id"] == "person_alice"
    assert results[2]["similarity"] > 0.99
