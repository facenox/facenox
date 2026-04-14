from core.models.tracker.tracker import FaceTracker


def _face(x: float = 0.0, y: float = 0.0) -> dict:
    return {
        "bbox": {
            "x": x,
            "y": y,
            "width": 100.0,
            "height": 100.0,
        },
        "confidence": 0.95,
        "landmarks_5": [[20, 25], [80, 25], [50, 50], [30, 80], [70, 80]],
    }


def test_face_tracker_activates_new_track_on_first_frame():
    tracker = FaceTracker()

    result = tracker.update([_face()], frame_rate=30)

    assert len(result) == 1
    assert result[0]["track_id"] > 0


def test_face_tracker_preserves_track_id_across_same_detection():
    tracker = FaceTracker()

    first = tracker.update([_face()], frame_rate=30)
    second = tracker.update([_face(x=2.0, y=1.0)], frame_rate=30)

    assert len(first) == 1
    assert len(second) == 1
    assert first[0]["track_id"] > 0
    assert second[0]["track_id"] == first[0]["track_id"]
