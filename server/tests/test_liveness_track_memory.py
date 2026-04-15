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
    memory = TrackLivenessMemory(required_real_frames=2)

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


def test_track_liveness_memory_keeps_locked_real_despite_spoof_until_gap_reset():
    memory = TrackLivenessMemory(
        required_real_frames=2,
    )

    for frame_number in range(1, 3):
        stabilized = memory.stabilize(
            7, _liveness("real", True), frame_number=frame_number, namespace="cam"
        )

    assert stabilized["status"] == "real"
    assert stabilized["is_real"] is True

    first_spoof_frame = memory.stabilize(
        7, _liveness("spoof", False), frame_number=4, namespace="cam"
    )
    second_spoof_frame = memory.stabilize(
        7, _liveness("spoof", False), frame_number=5, namespace="cam"
    )

    assert first_spoof_frame["status"] == "real"
    assert first_spoof_frame["is_real"] is True
    assert second_spoof_frame["status"] == "real"
    assert second_spoof_frame["is_real"] is True


def test_track_liveness_memory_is_isolated_per_namespace():
    memory = TrackLivenessMemory(required_real_frames=2)

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


def test_track_liveness_memory_namespace_frame_progress_does_not_reset_other_namespaces():
    memory = TrackLivenessMemory(required_real_frames=1, reset_after_gap_frames=2)

    cam_a_first = memory.stabilize(
        1, _liveness("real", True), frame_number=1, namespace="cam-a"
    )
    assert cam_a_first["status"] == "real"

    for frame_number in range(2, 10):
        memory.stabilize(
            2, _liveness("real", True), frame_number=frame_number, namespace="cam-b"
        )

    cam_a_follow_up = memory.stabilize(
        1, _liveness("spoof", False), frame_number=2, namespace="cam-a"
    )

    # With namespace-scoped frame tracking, cam-a should not be aged/reset by cam-b traffic.
    assert cam_a_follow_up["status"] == "real"
    assert cam_a_follow_up["is_real"] is True


def test_track_liveness_memory_resets_stable_state_after_long_gap():
    memory = TrackLivenessMemory(
        required_real_frames=2,
        reset_after_gap_frames=2,
    )

    warmup_1 = memory.stabilize(
        10, _liveness("real", True), frame_number=1, namespace="cam"
    )
    warmup_2 = memory.stabilize(
        10, _liveness("real", True), frame_number=2, namespace="cam"
    )

    assert warmup_1["status"] == "candidate_real"
    assert warmup_2["status"] == "real"

    after_gap = memory.stabilize(
        10, _liveness("real", True), frame_number=8, namespace="cam"
    )
    reconfirmed = memory.stabilize(
        10, _liveness("real", True), frame_number=9, namespace="cam"
    )

    assert after_gap["status"] == "candidate_real"
    assert after_gap["is_real"] is False
    assert reconfirmed["status"] == "real"
    assert reconfirmed["is_real"] is True
