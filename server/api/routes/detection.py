import logging
import time

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from api.schemas import DetectionResponse
from config.models import FACE_DETECTOR_CONFIG
from hooks import (
    process_face_detection,
    process_liveness_detection,
)
from utils import serialize_faces

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB

router = APIRouter()


@router.post("/detect", response_model=DetectionResponse)
async def detect_faces(
    image: UploadFile = File(...),
    model_type: str = Form("face_detector"),
    confidence_threshold: float = Form(FACE_DETECTOR_CONFIG["score_threshold"]),
    nms_threshold: float = Form(FACE_DETECTOR_CONFIG["nms_threshold"]),
    enable_liveness_detection: bool = Form(False),
):
    """
    Detect faces in a single binary image (Multipart)
    """
    start_time = time.time()

    try:
        # Early size check to prevent memory exhaustion DoS
        file_size = image.size if image.size is not None else 0
        if file_size == 0:
            try:
                image.file.seek(0, 2)
                file_size = image.file.tell()
                image.file.seek(0)
            except Exception:
                pass

        if file_size > MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"Image too large ({file_size} bytes). Max {MAX_IMAGE_SIZE} bytes.",
            )

        contents = await image.read()

        nparr = np.frombuffer(contents, np.uint8)
        image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image_bgr is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        if model_type == "face_detector":
            min_face_size = (
                0
                if not enable_liveness_detection
                else FACE_DETECTOR_CONFIG["min_face_size"]
            )

            faces = await process_face_detection(
                image_bgr,
                confidence_threshold=confidence_threshold,
                nms_threshold=nms_threshold,
                min_face_size=min_face_size,
                enable_liveness=enable_liveness_detection,
            )

            for face in faces:
                if "track_id" not in face:
                    face["track_id"] = -1

            faces = await process_liveness_detection(
                faces, image_bgr, enable_liveness_detection
            )

        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported model type: {model_type}"
            )

        processing_time = time.time() - start_time
        serialized_faces = serialize_faces(faces, "/detect endpoint")

        processing_time_ms = processing_time * 1000
        if processing_time_ms > 50:
            suggested_skip = 2
        elif processing_time_ms > 30:
            suggested_skip = 1
        else:
            suggested_skip = 0

        return DetectionResponse(
            success=True,
            faces=serialized_faces,
            processing_time=processing_time,
            model_used=model_type,
            suggested_skip=suggested_skip,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
