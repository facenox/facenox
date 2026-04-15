import cv2
import numpy as np
from typing import List, Dict, Optional
from .session_utils import init_onnx_session
from .preprocess import (
    crop,
    extract_face_crops_from_detections,
)
from .postprocess import (
    validate_detection,
    run_batch_inference,
    assemble_liveness_results,
)
from .track_memory import TrackLivenessMemory


def probability_to_logit_threshold(p: float) -> float:
    p = max(1e-6, min(1 - 1e-6, p))
    return np.log(p / (1 - p))


class LivenessDetector:
    def __init__(
        self,
        model_path: str,
        model_img_size: int,
        confidence_threshold: float,
        bbox_inc: float,
    ):
        self.model_img_size = model_img_size
        self.bbox_inc = bbox_inc
        self.confidence_threshold = confidence_threshold
        self.logit_threshold = probability_to_logit_threshold(confidence_threshold)

        self.ort_session, self.input_name = self._init_session_(model_path)
        self.track_memory = TrackLivenessMemory()

        self.frame_counter = 0

    def _init_session_(self, onnx_model_path: str):
        return init_onnx_session(onnx_model_path)

    def increased_crop(
        self, img: np.ndarray, bbox: tuple, bbox_inc: float
    ) -> np.ndarray:
        return crop(img, bbox, bbox_inc)

    def detect_faces(
        self,
        image: np.ndarray,
        face_detections: List[Dict],
        tracking_namespace: Optional[str] = None,
    ) -> List[Dict]:
        if not face_detections:
            return []

        self.frame_counter += 1

        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        results = []
        valid_detections_for_cropping = []

        for detection in face_detections:
            is_valid, liveness_status = validate_detection(detection)

            if not is_valid:
                if liveness_status:
                    detection["liveness"] = liveness_status
                results.append(detection)
                continue

            valid_detections_for_cropping.append(detection)

        face_crops, valid_detections, skipped_results = (
            extract_face_crops_from_detections(
                rgb_image,
                valid_detections_for_cropping,
                self.bbox_inc,
                self.increased_crop,
            )
        )

        for skipped in skipped_results:
            if "liveness" not in skipped:
                skipped["liveness"] = {
                    "is_real": False,
                    "status": "error",
                    "logit_diff": 0.0,
                    "real_logit": 0.0,
                    "spoof_logit": 0.0,
                    "confidence": 0.0,
                }
        results.extend(skipped_results)

        if not face_crops:
            return results

        raw_logits = run_batch_inference(
            face_crops,
            self.ort_session,
            self.input_name,
            self.model_img_size,
        )

        results = assemble_liveness_results(
            valid_detections,
            raw_logits,
            self.logit_threshold,
            results,
        )

        for detection in results:
            track_id = detection.get("track_id")
            liveness = detection.get("liveness")
            if not isinstance(liveness, dict) or track_id is None:
                continue
            detection["liveness"] = self.track_memory.stabilize(
                track_id,
                liveness,
                self.frame_counter,
                namespace=tracking_namespace,
            )

        self.track_memory.cleanup_stale_tracks(namespace=tracking_namespace)

        return results

    def clear_namespace(self, namespace: Optional[str]):
        self.track_memory.clear_namespace(namespace)
