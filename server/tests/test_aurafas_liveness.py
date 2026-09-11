import cv2
import numpy as np

from config.models import LIVENESS_DETECTOR_CONFIG
from core.models.liveness_detector.detector import LivenessDetector
from core.models.liveness_detector.preprocess import (
    compute_fft,
    crop_face,
    crop_context_face,
    check_glare_and_illumination,
    preprocess_batch,
)
from core.models.liveness_detector.session_utils import init_onnx_session


def test_aurafas_model_file_exists():
    model_path = LIVENESS_DETECTOR_CONFIG["model_path"]
    assert model_path.exists(), f"Model file not found at {model_path}"
    assert model_path.stat().st_size > 4_000_000, (
        "Model file size should be ~4.9MB (AuraFAS ONNX)"
    )


def test_aurafas_onnx_session_init():
    model_path = str(LIVENESS_DETECTOR_CONFIG["model_path"])
    session, input_name = init_onnx_session(model_path)
    assert session is not None, "Failed to initialize ONNX session with AuraFAS model"

    input_names = [i.name for i in session.get_inputs()]
    assert "input_tight" in input_names, "Missing 'input_tight' in model inputs"
    assert "input_fft" in input_names, "Missing 'input_fft' in model inputs"
    assert "input_ctx" in input_names, "Missing 'input_ctx' in model inputs"


def test_aurafas_preprocessing_shapes():
    dummy_img = np.random.randint(0, 256, (480, 640, 3), dtype=np.uint8)
    bbox = (200, 150, 100, 120)

    tight = crop_face(dummy_img, bbox, target_size=256)
    assert tight.shape == (256, 256, 3), f"Expected (256, 256, 3), got {tight.shape}"

    ctx = crop_context_face(dummy_img, bbox, scale=2.0, target_size=256)
    assert ctx.shape == (256, 256, 3), f"Expected (256, 256, 3), got {ctx.shape}"

    gray_tight = cv2.cvtColor(tight, cv2.COLOR_RGB2GRAY)
    fft_feat = compute_fft(gray_tight)
    assert fft_feat.shape == (16, 16), f"Expected (16, 16), got {fft_feat.shape}"

    batch = preprocess_batch(
        [{"tight": tight, "fft": fft_feat, "ctx": ctx}], model_img_size=256
    )
    assert batch["input_tight"].shape == (1, 3, 256, 256)
    assert batch["input_fft"].shape == (1, 1, 16, 16)
    assert batch["input_ctx"].shape == (1, 3, 256, 256)


def test_aurafas_glare_and_illumination_guard():
    # Normal image: should pass
    normal_gray = np.full((100, 100), 120, dtype=np.uint8)
    ok, reason = check_glare_and_illumination(normal_gray)
    assert ok is True
    assert reason == "ok"

    # Too dark face (< 20.0): should be caught
    dark_gray = np.full((100, 100), 10, dtype=np.uint8)
    ok, reason = check_glare_and_illumination(dark_gray)
    assert ok is False
    assert reason == "too_dark"

    # Screen glare / specular reflection (hotspot > 250 over 10% of face): should be caught
    glare_gray = np.full((100, 100), 120, dtype=np.uint8)
    glare_gray[:20, :50] = 255  # 10% specular hotspot
    ok, reason = check_glare_and_illumination(glare_gray)
    assert ok is False
    assert reason == "glare"


def test_aurafas_detector_end_to_end_inference():
    detector = LivenessDetector(
        model_path=str(LIVENESS_DETECTOR_CONFIG["model_path"]),
        pass_margin=LIVENESS_DETECTOR_CONFIG["pass_margin"],
        spoof_margin=LIVENESS_DETECTOR_CONFIG["spoof_margin"],
        required_real_frames=LIVENESS_DETECTOR_CONFIG["required_real_frames"],
    )

    dummy_frame = np.random.randint(50, 200, (480, 640, 3), dtype=np.uint8)
    detections = [
        {
            "bbox": {"x": 220, "y": 140, "width": 120, "height": 140},
            "confidence": 0.95,
            "track_id": 1,
        }
    ]

    results = detector.detect_faces(
        dummy_frame, detections, tracking_namespace="test_cam"
    )
    assert len(results) == 1
    res = results[0]
    assert "liveness" in res

    liveness = res["liveness"]
    assert "is_real" in liveness
    assert "status" in liveness
    assert "logit_diff" in liveness
    assert "real_logit" in liveness
    assert "spoof_logit" in liveness
    assert "confidence" in liveness
    assert isinstance(liveness["logit_diff"], float)


def test_active_challenge_blocks_still_phone_photo():
    """Verifies that holding a still phone with a real photo NEVER passes attendance."""
    from core.models.liveness_detector.active_controller import ActiveLivenessController

    ctrl = ActiveLivenessController()
    landmarks_still = np.array(
        [
            [20.0, 30.0],  # right eye
            [80.0, 30.0],  # left eye
            [50.0, 55.0],  # nose
            [28.0, 88.0],  # mouth right
            [72.0, 88.0],  # mouth left
        ],
        dtype=np.float32,
    )

    passive_pass = {
        "is_real": True,
        "status": "real",
        "logit_diff": 3.5,
        "real_logit": 3.0,
        "spoof_logit": -0.5,
        "confidence": 3.5,
    }

    # Frame 1: Challenge initiates -> status must be candidate_real and is_real MUST be False
    res1 = ctrl.evaluate(landmarks_still, passive_pass, now_time=100.0)
    assert res1["is_real"] is False
    assert res1["status"] == "candidate_real"

    # Frame 2-5: Still holding the photo still (no head turn) -> MUST stay candidate_real / blocked
    for t in [100.1, 100.2, 100.5, 101.0]:
        res = ctrl.evaluate(landmarks_still, passive_pass, now_time=t)
        assert res["is_real"] is False
        assert res["status"] == "candidate_real"
        assert "Slowly turn head" in res.get("message", "")


def test_active_challenge_rejects_tilted_phone_screen():
    """Verifies that tilting a flat phone screen is mathematically caught and rejected as planar spoof."""
    from core.models.liveness_detector.active_controller import ActiveLivenessController

    ctrl = ActiveLivenessController()
    landmarks_base = np.array(
        [[20.0, 30.0], [80.0, 30.0], [50.0, 55.0], [28.0, 88.0], [72.0, 88.0]],
        dtype=np.float32,
    )

    passive_pass = {
        "is_real": True,
        "status": "real",
        "logit_diff": 3.5,
        "real_logit": 3.0,
        "spoof_logit": -0.5,
        "confidence": 3.5,
    }
    ctrl.evaluate(landmarks_base, passive_pass, now_time=100.0)

    # Simulate 2D rigid planar homography (screen tilt around Y axis without 3D depth)
    # Applying an exact 2D projective transformation where H-residual is 0
    # Perspective transformation simulating a 30-degree phone screen tilt to the right
    src_pts = np.array([[0, 0], [100, 0], [100, 120], [0, 120]], dtype=np.float32)
    dst_pts = np.array([[25, 5], [95, 25], [95, 95], [25, 115]], dtype=np.float32)
    H_rot = cv2.getPerspectiveTransform(src_pts, dst_pts)

    base_h = np.hstack([landmarks_base, np.ones((5, 1), dtype=np.float32)])
    proj = (H_rot @ base_h.T).T
    pts_tilted = proj[:, :2] / proj[:, 2:3]

    res_tilt = ctrl.evaluate(pts_tilted, passive_pass, now_time=100.2)
    assert res_tilt["is_real"] is False
    assert res_tilt["status"] == "spoof"
    assert "Verification Failed" in res_tilt.get("message", "")


def test_active_challenge_passes_real_3d_human_head_turn():
    """Verifies that a real human turning their 3D head passes with volumetric parallax."""
    from core.models.liveness_detector.active_controller import ActiveLivenessController

    ctrl = ActiveLivenessController()
    landmarks_base = np.array(
        [[20.0, 30.0], [80.0, 30.0], [50.0, 55.0], [28.0, 88.0], [72.0, 88.0]],
        dtype=np.float32,
    )

    passive_pass = {
        "is_real": True,
        "status": "real",
        "logit_diff": 3.5,
        "real_logit": 3.0,
        "spoof_logit": -0.5,
        "confidence": 3.5,
    }
    ctrl.evaluate(landmarks_base, passive_pass, now_time=100.0)

    # Real human head turn: nose moves significantly across eye axis with non-planar volumetric parallax
    landmarks_turn = np.array(
        [
            [22.0, 30.0],  # right eye contracted
            [72.0, 30.0],  # left eye
            [
                68.0,
                56.0,
            ],  # nose shifted heavily right due to 3D depth protrusion (parallax)
            [32.0, 88.0],
            [66.0, 88.0],
        ],
        dtype=np.float32,
    )

    # Frame 1 of turn: latching (1/3)
    res_turn1 = ctrl.evaluate(landmarks_turn, passive_pass, now_time=100.2)
    assert res_turn1["is_real"] is False
    # Frame 2 of turn: latching (2/3)
    res_turn2 = ctrl.evaluate(landmarks_turn, passive_pass, now_time=100.3)
    assert res_turn2["is_real"] is False
    # Frame 3 of turn: confirmed 3D parallax! (3/3 matches demo.py)
    res_turn3 = ctrl.evaluate(landmarks_turn, passive_pass, now_time=100.4)

    assert res_turn3["is_real"] is True
    assert res_turn3["status"] == "real"
    assert "Liveness Verified" in res_turn3.get("message", "")


def test_pose_symmetry_guard_triggers_look_at_camera():
    """Verifies that tilted head or steep yaw/pitch triggers look_at_camera guidance."""
    from core.models.face_detector.postprocess import process_detection

    dummy_face = np.array(
        [100, 100, 150, 150, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.95], dtype=np.float32
    )

    # 1. Normal upright face
    normal_landmarks = np.array(
        [
            [130.0, 140.0],  # re
            [170.0, 140.0],  # le
            [150.0, 160.0],  # nose
            [135.0, 190.0],  # rcm
            [165.0, 190.0],  # lcm
        ],
        dtype=np.float32,
    )

    det_normal = process_detection(
        dummy_face,
        min_face_size=80,
        landmarks_5=normal_landmarks,
        img_width=640,
        img_height=480,
    )
    assert det_normal is not None
    assert "liveness" not in det_normal

    # 2. Severe roll tilt (> 35 degrees)
    # Rotate landmarks 45 degrees
    tilted_landmarks = np.array(
        [
            [130.0, 120.0],  # re
            [160.0, 160.0],  # le (dy = 40, dx = 30 -> ~53 deg)
            [150.0, 160.0],  # nose
            [125.0, 170.0],  # rcm
            [155.0, 200.0],  # lcm
        ],
        dtype=np.float32,
    )

    det_tilted = process_detection(
        dummy_face,
        min_face_size=80,
        landmarks_5=tilted_landmarks,
        img_width=640,
        img_height=480,
    )
    assert det_tilted is not None
    assert "liveness" in det_tilted
    assert det_tilted["liveness"]["status"] == "look_at_camera"
    assert det_tilted["liveness"]["is_real"] is None


def test_active_controller_passive_gate_and_spoof_abort():
    from core.models.liveness_detector.active_controller import (
        ActiveLivenessController,
        ActiveChallengeState,
    )

    ctrl = ActiveLivenessController(required_passive_frames=3)
    dummy_pts = np.array(
        [[10, 10], [30, 10], [20, 20], [15, 30], [25, 30]], dtype=np.float32
    )

    # Frame 1: Real (confirm_count becomes 1) -> Still scanning, does not start challenge
    liv1 = {"status": "real", "is_real": False, "logit_diff": 2.5}
    res1 = ctrl.evaluate(dummy_pts, liv1, now_time=100.0)
    assert ctrl.state == ActiveChallengeState.PASSIVE
    assert ctrl.passive_confirm_count == 1
    assert res1["message"] == "Scanning face..."

    # Frame 2: Spoof attack glitch (phone screen specular/negative margin)
    # -> Resets confirm_count to 0, prevents phone video from triggering active prompt!
    liv2 = {
        "status": "spoof",
        "is_real": False,
        "logit_diff": -1.5,
        "is_confirmed_spoof": True,
    }
    ctrl.evaluate(dummy_pts, liv2, now_time=100.1)
    assert ctrl.state == ActiveChallengeState.PASSIVE
    assert ctrl.passive_confirm_count == 0

    # Real face sustains 3 frames -> Enters CHALLENGING
    ctrl.evaluate(dummy_pts, {"status": "real", "logit_diff": 3.0}, now_time=101.0)
    ctrl.evaluate(dummy_pts, {"status": "real", "logit_diff": 3.0}, now_time=101.1)
    res_chal = ctrl.evaluate(
        dummy_pts, {"status": "real", "logit_diff": 3.0}, now_time=101.2
    )
    assert ctrl.state == ActiveChallengeState.CHALLENGING
    assert res_chal["message"] == "Slowly turn head"

    # While in CHALLENGING, if a spoof occurs (negative margin) -> Instant abort!
    res_abort = ctrl.evaluate(
        dummy_pts,
        {"status": "spoof", "logit_diff": -2.0, "is_confirmed_spoof": True},
        now_time=101.3,
    )
    assert ctrl.state == ActiveChallengeState.PASSIVE
    assert res_abort["status"] == "spoof"
    assert res_abort["message"] == "Verification Failed"
