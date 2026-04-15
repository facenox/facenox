from core.models.liveness_detector.track_memory import TrackLivenessMemory


def _liveness(status: str, is_real: bool) -> dict:
    return {
        "status": status,
        "is_real": is_real,
        "confidence": 1.0,
        "logit_diff": 1.0 if is_real else -1.0,
        "real_logit": 1.0 if is_real else -1.0,
        "spoof_logit": -1.0 if is_real else 1.0,
    }


def test_track_liveness_memory_requires_recent_real_evidence_before_passing():
    memory = TrackLivenessMemory(required_real_frames=2, history_size=5)

    first = memory.stabilize(
        1, _liveness("real", True), frame_number=1, namespace="cam"
    )
    second = memory.stabilize(
        1, _liveness("real", True), frame_number=2, namespace="cam"
    )

    assert first["status"] == "candidate_real"
    assert first["is_real"] is False
    assert second["status"] == "real"
    assert second["is_real"] is True


def test_track_liveness_memory_drops_back_to_spoof_on_a_fresh_spoof_frame():
    memory = TrackLivenessMemory(required_real_frames=2, history_size=5)

    for frame_number in range(1, 3):
        stabilized = memory.stabilize(
            7, _liveness("real", True), frame_number=frame_number, namespace="cam"
        )

    assert stabilized["status"] == "real"
    assert stabilized["is_real"] is True

    spoof_frame = memory.stabilize(
        7, _liveness("spoof", False), frame_number=4, namespace="cam"
    )

    assert spoof_frame["status"] == "spoof"
    assert spoof_frame["is_real"] is False


def test_track_liveness_memory_is_isolated_per_namespace():
    memory = TrackLivenessMemory(required_real_frames=2, history_size=5)

    for frame_number in range(1, 3):
        cam_a_result = memory.stabilize(
            3, _liveness("real", True), frame_number=frame_number, namespace="cam-a"
        )

    cam_b_first = memory.stabilize(
        3, _liveness("real", True), frame_number=4, namespace="cam-b"
    )

    assert cam_a_result["status"] == "real"
    assert cam_a_result["is_real"] is True
    assert cam_b_first["status"] == "candidate_real"
    assert cam_b_first["is_real"] is False
