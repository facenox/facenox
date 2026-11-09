import time
import logging
import cv2
import numpy as np
from typing import Dict, Any, List, Tuple, Callable

from config.models import FACE_DETECTOR_CONFIG
from hooks import (
    process_face_detection,
    process_face_tracking,
    process_liveness_detection,
)
from utils import serialize_faces

logger = logging.getLogger(__name__)


class FrameDecodeError(Exception):
    """Raised when frame bytes cannot be converted into an image by OpenCV."""

    pass


class DetectionPipeline:
    """
    DetectionPipeline handles the processing stages for camera stream frames.

    This encapsulates OpenCV decoding, AI model inference (detection, tracking, liveness),
    and attendance recognition triggers into an isolated pipeline.
    """

    def __init__(self, live_stream_service: Any):
        """
        Initialize the pipeline with the required stream service.

        Why: Decoupling this logic from routing allows testing image processing pipelines
        separately from FastAPI's websocket protocol handlers.
        """
        self.live_stream_service = live_stream_service

    async def process_frame(
        self,
        frame_bytes: bytes,
        client_id: str,
        live_session_config: Any,
        fps_provider: Callable[[str], float],
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Execute frame decoding and AI pipeline evaluation.

        Returns:
            Tuple containing:
              - response_data: Serialized face detection metrics.
              - attendance_messages: List of attendance trigger notifications.
        """
        start_time = time.time()

        # 1. Image decoding
        nparr = np.frombuffer(frame_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise FrameDecodeError("Failed to decode frame bytes to image.")

        # 2. Face detection
        min_face_size = FACE_DETECTOR_CONFIG["min_face_size"]
        faces = await process_face_detection(
            image,
            confidence_threshold=FACE_DETECTOR_CONFIG["score_threshold"],
            nms_threshold=FACE_DETECTOR_CONFIG["nms_threshold"],
            min_face_size=min_face_size,
            enable_liveness=live_session_config.enable_liveness_detection,
        )

        # 3. Face tracking
        current_fps = fps_provider(client_id)
        faces = process_face_tracking(faces, image, current_fps, client_id)

        # 4. Liveness detection
        faces = await process_liveness_detection(
            faces,
            image,
            live_session_config.enable_liveness_detection,
            tracking_namespace=client_id,
        )

        # 5. Attendance verification/recognition
        attendance_messages = await self.live_stream_service.process_live_recognition(
            image, faces, live_session_config, client_id
        )

        # 6. Serialization
        serialized_faces = serialize_faces(faces, "websocket")
        processing_time = time.time() - start_time
        current_timestamp = time.time()

        # 7. Adaptive Frame Skipping math
        if processing_time * 1000 > 50:
            suggested_skip = 2
        elif processing_time * 1000 > 30:
            suggested_skip = 1
        else:
            suggested_skip = 0

        response_data = {
            "type": "detection_response",
            "faces": serialized_faces,
            "model_used": "face_detector",
            "processing_time": processing_time,
            "timestamp": current_timestamp,
            "frame_timestamp": start_time,
            "suggested_skip": suggested_skip,
            "success": True,
        }

        return response_data, attendance_messages
