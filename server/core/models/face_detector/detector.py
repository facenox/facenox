import numpy as np
import logging as log
import cv2 as cv
from typing import List
from .session_utils import init_face_detector_session
from .postprocess import process_detection

logger = log.getLogger(__name__)


class FaceDetector:
    """Wrapper for OpenCV FaceDetectorYN with dynamic low-light preprocessing."""

    def __init__(
        self,
        model_path: str,
        input_size: tuple,
        conf_threshold: float,
        nms_threshold: float,
        top_k: int,
        min_face_size: int,
        edge_margin: int = 0,
    ):
        self.detector = None
        self.set_score_threshold(conf_threshold)
        self.set_nms_threshold(nms_threshold)
        self.set_top_k(top_k)
        self.set_min_face_size(min_face_size)
        self.set_edge_margin(edge_margin)

        self.detector = init_face_detector_session(
            model_path,
            input_size,
            conf_threshold,
            nms_threshold,
            top_k,
        )

    def detect_faces(
        self, image: np.ndarray, enable_liveness: bool = False
    ) -> List[dict]:
        """Detect faces. Uses bilateral/gamma preprocessing solely for detector path."""
        if not self.detector or image is None or image.size == 0:
            logger.warning("Invalid image provided to face detector")
            return []

        orig_height, orig_width = image.shape[:2]
        self.detector.setInputSize((orig_width, orig_height))

        # Estimate lux on center 70% ROI to ignore ceiling lamps/glare
        h, w = image.shape[:2]
        center_y1, center_y2 = int(h * 0.15), int(h * 0.85)
        center_x1, center_x2 = int(w * 0.15), int(w * 0.85)
        roi = image[center_y1:center_y2, center_x1:center_x2]

        if roi.size > 0:
            ycrcb_roi = cv.cvtColor(roi, cv.COLOR_BGR2YCrCb)
            mean_brightness = float(np.mean(ycrcb_roi[:, :, 0]))
        else:
            ycrcb_img = cv.cvtColor(image, cv.COLOR_BGR2YCrCb)
            mean_brightness = float(np.mean(ycrcb_img[:, :, 0]))

        if mean_brightness < 60.0:
            logger.debug(
                "Low-light detected in face ROI (mean luminance: %.1f). Applying dynamic Gamma correction to LAB L-channel.",
                mean_brightness,
            )
            gamma = max(0.4, min(1.0, mean_brightness / 60.0))
            inv_gamma = 1.0 / gamma

            table = np.array(
                [((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]
            ).astype("uint8")

            # LAB L-channel tuning avoids recognition-breaking color/feature shifts
            lab = cv.cvtColor(image, cv.COLOR_BGR2LAB)
            l_channel, a_channel, b_channel = cv.split(lab)
            gamma_corrected_l = cv.LUT(l_channel, table)
            enhanced_lab = cv.merge((gamma_corrected_l, a_channel, b_channel))
            detection_image = cv.cvtColor(enhanced_lab, cv.COLOR_LAB2BGR)

            # Continuous score threshold scaling prevents step-function detection drops
            original_threshold = self.conf_threshold
            dynamic_threshold = max(
                0.5, min(original_threshold, 0.5 + (mean_brightness - 30.0) / 100.0)
            )
            self.set_score_threshold(dynamic_threshold)
            try:
                faces = self.detector.detect(detection_image)[1]
            finally:
                self.set_score_threshold(original_threshold)
        else:
            faces = self.detector.detect(image)[1]

        if faces is None or len(faces) == 0:
            return []

        margin = self.edge_margin if enable_liveness else 0
        min_size = self.min_face_size if enable_liveness else 0

        detections = []
        for face in faces:
            landmarks_5 = face[4:14].reshape(5, 2)
            detection = process_detection(
                face,
                min_size,
                landmarks_5,
                orig_width,
                orig_height,
                margin,
            )
            if detection is not None:
                fx, fy, fw, fh = map(int, face[0:4])
                fx1 = max(0, fx)
                fy1 = max(0, fy)
                fx2 = min(orig_width, fx + fw)
                fy2 = min(orig_height, fy + fh)

                face_roi = image[fy1:fy2, fx1:fx2]
                if face_roi.size > 0:
                    ycrcb_face = cv.cvtColor(face_roi, cv.COLOR_BGR2YCrCb)
                    y_channel = ycrcb_face[:, :, 0]

                    # Crop to inner facial T-zone to ignore dark hair (top/sides) and collar shadows (bottom)
                    fh_roi, fw_roi = y_channel.shape[:2]
                    inner_y1 = int(fh_roi * 0.20)
                    inner_y2 = int(fh_roi * 0.85)
                    inner_x1 = int(fw_roi * 0.25)
                    inner_x2 = int(fw_roi * 0.75)
                    skin_roi = y_channel[inner_y1:inner_y2, inner_x1:inner_x2]

                    if skin_roi.size > 0:
                        face_brightness = float(np.mean(skin_roi))
                        face_variance = float(np.var(skin_roi))
                    else:
                        face_brightness = float(np.mean(y_channel))
                        face_variance = float(np.var(y_channel))
                else:
                    face_brightness = mean_brightness
                    face_variance = 0.0
                is_face_low_light = bool(
                    face_brightness < 65.0
                    or (face_brightness < 78.0 and face_variance > 120.0)
                )
                detection["low_light"] = is_face_low_light
                detections.append(detection)

        return detections

    def set_score_threshold(self, threshold):
        self.conf_threshold = threshold
        if self.detector:
            self.detector.setScoreThreshold(threshold)

    @property
    def score_threshold(self):
        return self.conf_threshold

    @property
    def confidence_threshold(self):
        return self.conf_threshold

    def set_nms_threshold(self, threshold):
        self.nms_threshold = threshold
        if self.detector:
            self.detector.setNMSThreshold(threshold)

    def set_top_k(self, top_k):
        self.top_k = top_k
        if self.detector:
            self.detector.setTopK(top_k)

    def set_confidence_threshold(self, threshold):
        self.set_score_threshold(threshold)

    def set_min_face_size(self, min_size: int):
        self.min_face_size = min_size

    def set_edge_margin(self, margin: int):
        self.edge_margin = margin
