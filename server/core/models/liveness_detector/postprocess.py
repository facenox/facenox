import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from .preprocess import preprocess_batch

GUIDANCE_STATUSES = {
    "move_closer",
    "center_face",
    "glare",
    "too_dark",
    "look_at_camera",
}


def validate_detection(detection: Dict) -> Tuple[bool, Optional[Dict]]:
    liveness = detection.get("liveness")
    if isinstance(liveness, dict):
        status = liveness.get("status")
        if status in GUIDANCE_STATUSES:
            normalized_liveness = dict(liveness)
            normalized_liveness.setdefault("is_real", None)
            normalized_liveness.setdefault("confidence", 0.0)
            detection["liveness"] = normalized_liveness
            return False, normalized_liveness

    bbox = detection.get("bbox", {})
    if not isinstance(bbox, dict):
        return False, None

    w = float(bbox.get("width", 0))
    h = float(bbox.get("height", 0))

    if w <= 0 or h <= 0:
        return False, None

    return True, None


def run_batch_inference(
    face_crops: List[Any],
    ort_session,
    input_name: str,
    model_img_size: int = 256,
) -> List[np.ndarray]:
    """Executes model inference."""
    if not face_crops:
        return []

    if not ort_session:
        raise RuntimeError("ONNX session is not available")

    feeds = preprocess_batch(face_crops, model_img_size)
    logits = ort_session.run(None, feeds)[0]

    if logits.shape != (len(face_crops), 2):
        raise ValueError(
            f"Model output shape mismatch: expected ({len(face_crops)}, 2), "
            f"got {logits.shape}"
        )

    return [logits[i] for i in range(len(face_crops))]


def assemble_liveness_results(
    valid_detections: List[Dict],
    raw_logits: List[np.ndarray],
    logit_threshold: float,
    results: List[Dict],
    spoof_margin: float = 0.0,
) -> List[Dict]:
    if len(valid_detections) != len(raw_logits):
        raise ValueError("Length mismatch between valid detections and model logits")

    for detection, logits in zip(valid_detections, raw_logits):
        real_logit = float(logits[0])
        spoof_logit = float(logits[1])

        logit_diff = real_logit - spoof_logit
        is_real = logit_diff >= logit_threshold
        is_confirmed_spoof = logit_diff < spoof_margin
        confidence = abs(logit_diff)
        prob_real = float(1.0 / (1.0 + np.exp(-np.clip(logit_diff, -20.0, 20.0))))

        detection["liveness"] = {
            "is_real": bool(is_real),
            "status": "real" if is_real else "spoof",
            "logit_diff": float(logit_diff),
            "real_logit": float(real_logit),
            "spoof_logit": float(spoof_logit),
            "confidence": float(confidence),
            "prob_real": float(prob_real),
            "is_confirmed_spoof": bool(is_confirmed_spoof),
        }

        results.append(detection)

    return results
