import numpy as np
from typing import Dict, List, Tuple, Optional
from .preprocess import preprocess_batch


def validate_detection(detection: Dict) -> Tuple[bool, Optional[Dict]]:

    bbox = detection.get("bbox", {})
    if not isinstance(bbox, dict):
        return False, None

    w = float(bbox.get("width", 0))
    h = float(bbox.get("height", 0))

    if w <= 0 or h <= 0:
        return False, None

    return True, None


def run_batch_inference(
    face_crops: List[np.ndarray],
    ort_session,
    input_name: str,
    model_img_size: int,
) -> List[np.ndarray]:
    if not face_crops:
        return []

    if not ort_session:
        raise RuntimeError("ONNX session is not available")

    batch_input = preprocess_batch(face_crops, model_img_size)
    logits = ort_session.run([], {input_name: batch_input})[0]

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
    temporal_smoother=None,
    frame_number: int = 0,
) -> List[Dict]:
    if len(valid_detections) != len(raw_logits):
        raise ValueError(
            f"Length mismatch: {len(valid_detections)} detections but "
            f"{len(raw_logits)} predictions. This indicates a bug in the pipeline."
        )

    for detection, logits in zip(valid_detections, raw_logits):
        real_logit = float(logits[0])
        spoof_logit = float(logits[1])

        if temporal_smoother:
            track_id = detection.get("track_id")
            if track_id is not None and track_id > 0:
                real_logit, spoof_logit = temporal_smoother.smooth(
                    track_id, real_logit, spoof_logit, frame_number
                )

        logit_diff = real_logit - spoof_logit
        is_real = logit_diff >= logit_threshold
        confidence = abs(logit_diff)

        detection["liveness"] = {
            "is_real": bool(is_real),
            "status": "real" if is_real else "spoof",
            "logit_diff": float(logit_diff),
            "real_logit": float(real_logit),
            "spoof_logit": float(spoof_logit),
            "confidence": float(confidence),
        }

        results.append(detection)

    return results
