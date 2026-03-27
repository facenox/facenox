import asyncio
import logging
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

liveness_detector = None
face_recognizer = None
face_detector = None
face_detector_lock: Optional[asyncio.Lock] = None


def set_model_references(liveness, tracker, recognizer, detector=None):
    global liveness_detector, face_recognizer, face_detector, face_detector_lock
    liveness_detector = liveness
    face_recognizer = recognizer
    face_detector = detector
    if face_detector_lock is None:
        face_detector_lock = asyncio.Lock()


async def process_face_detection(
    image: np.ndarray,
    confidence_threshold: Optional[float] = None,
    nms_threshold: Optional[float] = None,
    min_face_size: Optional[int] = None,
    enable_liveness: bool = False,
) -> List[Dict]:
    if not face_detector:
        logger.warning("Face detector not available")
        return []

    try:
        lock = face_detector_lock or asyncio.Lock()
        async with lock:
            original_confidence_threshold = getattr(
                face_detector, "score_threshold", None
            )
            original_nms_threshold = getattr(face_detector, "nms_threshold", None)
            original_min_face_size = getattr(face_detector, "min_face_size", None)

            if confidence_threshold is not None:
                face_detector.set_confidence_threshold(confidence_threshold)
            if nms_threshold is not None:
                face_detector.set_nms_threshold(nms_threshold)
            if min_face_size is not None:
                face_detector.set_min_face_size(min_face_size)

            loop = asyncio.get_running_loop()

            def detector_call():
                return face_detector.detect_faces(image, enable_liveness)

            try:
                return await loop.run_in_executor(None, detector_call)
            finally:
                if original_confidence_threshold is not None:
                    face_detector.set_confidence_threshold(
                        original_confidence_threshold
                    )
                if original_nms_threshold is not None:
                    face_detector.set_nms_threshold(original_nms_threshold)
                if original_min_face_size is not None:
                    face_detector.set_min_face_size(original_min_face_size)

    except Exception as e:
        logger.error(f"Face detection failed: {e}", exc_info=True)
        return []


async def process_liveness_detection(
    faces: List[Dict], image: np.ndarray, enable: bool, smoothing_namespace: str = None
) -> List[Dict]:
    if not (enable and faces and liveness_detector):
        return faces

    try:
        loop = asyncio.get_running_loop()

        def detector_call():
            return liveness_detector.detect_faces(
                image, faces, smoothing_namespace=smoothing_namespace
            )

        try:
            faces_with_liveness = await loop.run_in_executor(None, detector_call)
        except TypeError as exc:
            if "smoothing_namespace" not in str(exc):
                raise

            def detector_call_without_namespace():
                return liveness_detector.detect_faces(image, faces)

            faces_with_liveness = await loop.run_in_executor(
                None, detector_call_without_namespace
            )

        return faces_with_liveness

    except Exception as e:
        logger.error(f"Liveness detection failed: {e}", exc_info=True)
        for face in faces:
            if "liveness" not in face:
                face["liveness"] = {
                    "is_real": False,
                    "status": "error",
                    "logit_diff": 0.0,
                    "real_logit": 0.0,
                    "spoof_logit": 0.0,
                    "confidence": 0.0,
                    "message": f"Liveness detection error: {str(e)}",
                }
            elif face["liveness"].get("status") not in ["real", "spoof"]:
                face["liveness"]["status"] = "error"
                face["liveness"]["message"] = f"Liveness detection error: {str(e)}"

    return faces


def process_face_tracking(
    faces: List[Dict],
    image: np.ndarray,
    frame_rate: int = None,
    client_id: str = None,
) -> List[Dict]:
    if not faces:
        return faces

    if not client_id:
        logger.warning(
            "process_face_tracking called without client_id - skipping tracking"
        )
        for face in faces:
            if "track_id" not in face:
                face["track_id"] = -1
        return faces

    from utils.websocket_manager import manager

    tracker = manager.get_face_tracker(client_id)

    if not tracker:
        logger.warning(f"No tracker found for client {client_id}")
        for face in faces:
            if "track_id" not in face:
                face["track_id"] = -1
        return faces

    try:
        tracked_faces = tracker.update(faces, frame_rate)
        return tracked_faces

    except Exception as e:
        logger.warning(f"Face tracking failed: {e}")
        for face in faces:
            if "track_id" not in face:
                face["track_id"] = -1
        return faces


async def process_liveness_for_face_operation(
    image: np.ndarray,
    bbox: list,
    enable_liveness_detection: bool,
    operation_name: str,
) -> tuple[bool, str | None, str]:
    from core.lifespan import liveness_detector

    if not (liveness_detector and enable_liveness_detection):
        return False, None, "SKIPPED"

    if not isinstance(bbox, list) or len(bbox) < 4:
        return True, f"{operation_name} blocked: invalid bbox format", "ERROR"

    temp_face = {
        "bbox": {
            "x": bbox[0],
            "y": bbox[1],
            "width": bbox[2],
            "height": bbox[3],
        },
        "confidence": 1.0,
        "track_id": -1,
    }

    loop = asyncio.get_running_loop()

    def liveness_call():
        return liveness_detector.detect_faces(image, [temp_face])

    liveness_results = await loop.run_in_executor(None, liveness_call)

    if liveness_results and len(liveness_results) > 0:
        liveness_data = liveness_results[0].get("liveness", {})
        is_real = liveness_data.get("is_real", False)
        status = liveness_data.get("status", "unknown")

        if not is_real or status == "spoof":
            return (
                True,
                f"{operation_name} blocked: spoofed face detected (status: {status})",
                "SPOOF",
            )

        if status == "error":
            return (
                True,
                f"{operation_name} blocked: face status {status}",
                status.upper(),
            )

    return False, None, "PASSED"
