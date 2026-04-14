import numpy as np

from core.models.face_detector.postprocess import process_detection


def _build_face_array(
    x: int, y: int, width: int, height: int, confidence: float
) -> np.ndarray:
    face = np.zeros(15, dtype=np.float32)
    face[:4] = [x, y, width, height]
    face[14] = confidence
    return face


def test_process_detection_marks_center_face_when_edge_margin_is_violated():
    detection = process_detection(
        _build_face_array(2, 4, 90, 90, 0.97),
        min_face_size=60,
        landmarks_5=np.zeros((5, 2), dtype=np.float32),
        img_width=320,
        img_height=240,
        edge_margin=8,
    )

    assert detection is not None
    assert detection["liveness"]["status"] == "center_face"
    assert detection["liveness"]["is_real"] is None


def test_process_detection_marks_move_closer_for_small_faces():
    detection = process_detection(
        _build_face_array(40, 30, 42, 44, 0.95),
        min_face_size=60,
        landmarks_5=np.zeros((5, 2), dtype=np.float32),
        img_width=320,
        img_height=240,
        edge_margin=0,
    )

    assert detection is not None
    assert detection["liveness"]["status"] == "move_closer"
    assert detection["liveness"]["is_real"] is None
