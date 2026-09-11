import cv2
import numpy as np
from collections import defaultdict
from typing import List, Dict, Optional
from .session_utils import init_onnx_session
from .preprocess import extract_face_crops_from_detections
from .postprocess import (
    validate_detection,
    run_batch_inference,
    assemble_liveness_results,
)
from .track_memory import TrackLivenessMemory
from .active_controller import ActiveLivenessController


class LivenessDetector:
    def __init__(
        self,
        model_path: str,
        pass_margin: float = 0.40,
        spoof_margin: float = 0.00,
        required_real_frames: int = 3,
        model_img_size: int = 256,
        bbox_inc: float = 1.0,
        enforce_active_challenge: bool = True,
    ):
        self.model_img_size = model_img_size
        self.bbox_inc = bbox_inc
        self.pass_margin = float(pass_margin)
        self.spoof_margin = float(spoof_margin)
        self.logit_threshold = self.pass_margin
        self.enforce_active_challenge = enforce_active_challenge

        self.required_real_frames = required_real_frames
        self.ort_session, self.input_name = self._init_session_(model_path)
        self.track_memory = TrackLivenessMemory(
            required_real_frames=required_real_frames
        )
        self.active_controllers: Dict[tuple, ActiveLivenessController] = defaultdict(
            lambda: ActiveLivenessController(required_passive_frames=1)
        )

        self.frame_counter = 0

    def _init_session_(self, onnx_model_path: str):
        return init_onnx_session(onnx_model_path)

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
            spoof_margin=self.spoof_margin,
        )

        for detection in results:
            track_id = detection.get("track_id")
            liveness = detection.get("liveness")
            if not isinstance(liveness, dict) or track_id is None:
                continue

            passive_is_spoof = (
                bool(liveness.get("is_confirmed_spoof"))
                and float(liveness.get("logit_diff", 0.0)) < -1.5
            )

            if self.enforce_active_challenge and track_id > 0:
                if (
                    self.track_memory.is_stable_real(
                        track_id, namespace=tracking_namespace
                    )
                    and not passive_is_spoof
                ):
                    liveness["is_real"] = True
                    liveness["status"] = "real"
                    liveness["active_verified"] = True
                    liveness["message"] = "Liveness Verified"
                else:
                    controller_key = (tracking_namespace or "__global__", track_id)
                    controller = self.active_controllers[controller_key]
                    landmarks = detection.get("landmarks_5")
                    landmarks_arr = (
                        np.array(landmarks, dtype=np.float32) if landmarks else None
                    )
                    liveness = controller.evaluate(landmarks_arr, liveness)

            was_stable_real = self.track_memory.is_stable_real(
                track_id, namespace=tracking_namespace
            )

            stabilized_liveness = self.track_memory.stabilize(
                track_id,
                liveness,
                self.frame_counter,
                namespace=tracking_namespace,
                person_id=detection.get("recognition", {}).get("person_id"),
            )
            detection["liveness"] = stabilized_liveness

            if was_stable_real and not self.track_memory.is_stable_real(
                track_id, namespace=tracking_namespace
            ):
                controller_key = (tracking_namespace or "__global__", track_id)
                if controller_key in self.active_controllers:
                    self.active_controllers[controller_key].reset()

        pruned_tracks = self.track_memory.cleanup_stale_tracks(
            namespace=tracking_namespace
        )
        for track_key in pruned_tracks:
            self.active_controllers.pop(track_key, None)

        return results

    def clear_namespace(self, namespace: Optional[str]):
        self.track_memory.clear_namespace(namespace)
        ns_key = namespace or "__global__"
        keys_to_remove = [k for k in self.active_controllers if k[0] == ns_key]
        for k in keys_to_remove:
            del self.active_controllers[k]

    def update_face_identity(
        self,
        track_id: int,
        person_id: str,
        current_liveness: Dict,
        namespace: Optional[str] = None,
    ) -> Dict:
        """Updates identity tracking state."""
        return self.track_memory.stabilize(
            track_id,
            current_liveness,
            self.frame_counter,
            namespace=namespace,
            person_id=person_id,
        )
