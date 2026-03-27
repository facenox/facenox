import logging
import time

from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form
import json

from api.deps import get_repository
from api.recognition_deps import get_face_recognizer
from database.repository import AttendanceRepository
from api.schemas import (
    FaceRecognitionResponse,
    PersonUpdateRequest,
    SimilarityThresholdRequest,
)
from hooks import process_liveness_for_face_operation
from hooks import process_face_detection
import numpy as np
import cv2

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/face/recognize", response_model=FaceRecognitionResponse)
async def recognize_face(
    image: UploadFile = File(...),
    metadata: str = Form(...),
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    """
    Recognize a face using face recognizer with liveness detection validation
    Supports multipart/form-data for high-performance binary transfer.
    """
    start_time = time.time()

    try:
        # Decode metadata JSON string
        try:
            meta = json.loads(metadata)
            bbox = meta.get("bbox")
            landmarks_5 = meta.get("landmarks_5")
            group_id = meta.get("group_id")
            enable_liveness_detection = meta.get("enable_liveness_detection", True)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid metadata format: {e}")

        if not bbox or not landmarks_5 or not group_id:
            raise HTTPException(
                status_code=400, detail="Missing required metadata fields"
            )

        # Read and decode image binary directly
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise ValueError("Failed to decode image from multipart data")

        detections = await process_face_detection(
            img, min_face_size=0, enable_liveness=False
        )
        if not detections:
            raise ValueError("No detectable face found in image")

        should_block, error_msg, liveness_status = (
            await process_liveness_for_face_operation(
                img, bbox, enable_liveness_detection, "Recognition"
            )
        )

        if should_block:
            processing_time = time.time() - start_time
            return FaceRecognitionResponse(
                success=False,
                person_id=None,
                similarity=0.0,
                processing_time=processing_time,
                error=error_msg,
            )

        allowed_person_ids = await repo.get_group_person_ids(group_id)
        result = await face_recognizer.recognize_face(
            img, landmarks_5, allowed_person_ids, repo.organization_id
        )

        success = result["success"]
        person_id = result.get("person_id")
        similarity = result.get("similarity", 0.0)
        error = result.get("error")

        # Privacy safeguard: Ensure identity matches are suppressed for non-consenting users
        if success and person_id:
            member = await repo.get_member(person_id)
            if not member or not member.has_consent:
                logger.warning(
                    f"Recognition attempted for user {person_id} without consent. Blocking identity leak."
                )
                success = (
                    True  # Signal Success to trigger UI features, but mask the identity
                )
                person_id = "PROTECTED_IDENTITY"
                error = "Biometric consent missing"

        processing_time = time.time() - start_time

        return FaceRecognitionResponse(
            success=success,
            person_id=person_id,
            similarity=similarity,
            processing_time=processing_time,
            error=error,
        )

    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"Face recognition error: {e}")
        return FaceRecognitionResponse(
            success=False,
            person_id=None,
            similarity=0.0,
            processing_time=processing_time,
            error=str(e),
        )


@router.delete("/face/person/{person_id}")
async def remove_person(
    person_id: str,
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    """
    Remove a person from the face database
    """
    try:

        result = await face_recognizer.remove_person(person_id, repo.organization_id)

        if result["success"]:
            await repo.add_audit_log(
                action="FACE_DATA_REMOVED",
                target_type="member",
                target_id=person_id,
                details="Individual face data removed",
            )
            return {
                "success": True,
                "message": f"Person {person_id} removed successfully",
                "total_persons": result.get("total_persons", 0),
            }
        else:
            raise HTTPException(
                status_code=404, detail=result.get("error", "Person not found")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Person removal error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove person: {e}")


@router.put("/face/person")
async def update_person(
    request: PersonUpdateRequest,
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    """
    Update a person's ID in the face database
    """
    try:

        if not request.old_person_id.strip() or not request.new_person_id.strip():
            raise HTTPException(
                status_code=400, detail="Both old and new person IDs must be provided"
            )

        if request.old_person_id.strip() == request.new_person_id.strip():
            raise HTTPException(
                status_code=400, detail="Old and new person IDs must be different"
            )

        rename_success = await repo.rename_person_id(
            request.old_person_id.strip(), request.new_person_id.strip()
        )
        if not rename_success:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Person '{request.old_person_id.strip()}' not found or "
                    f"'{request.new_person_id.strip()}' already exists"
                ),
            )

        result = await face_recognizer.update_person_id(
            request.old_person_id.strip(),
            request.new_person_id.strip(),
            repo.organization_id,
        )

        if result["success"]:
            return result
        return {
            "success": True,
            "message": (
                result.get("message")
                or f"Person '{request.old_person_id.strip()}' renamed successfully"
            ),
            "updated_records": result.get("updated_records", 1),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Person update error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update person: {e}")


@router.get("/face/persons")
async def get_all_persons(
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    """
    Get list of all registered persons
    """
    try:

        persons = await face_recognizer.get_all_persons(repo.organization_id)
        stats = await face_recognizer.get_stats(repo.organization_id)

        return {
            "success": True,
            "persons": persons,
            "total_count": len(persons),
            "stats": stats,
        }

    except Exception as e:
        logger.error(f"Get persons error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get persons: {e}")


@router.post("/face/threshold")
async def set_similarity_threshold(
    request: SimilarityThresholdRequest, face_recognizer=Depends(get_face_recognizer)
):
    """
    Set similarity threshold for face recognition
    """
    try:

        if not (0.0 <= request.threshold <= 1.0):
            raise HTTPException(
                status_code=400, detail="Threshold must be between 0.0 and 1.0"
            )

        face_recognizer.set_similarity_threshold(request.threshold)

        return {
            "success": True,
            "message": f"Similarity threshold updated to {request.threshold}",
            "threshold": request.threshold,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Threshold update error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update threshold: {e}")


@router.post("/face/cache/invalidate")
async def invalidate_face_cache(
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    try:

        if hasattr(face_recognizer, "invalidate_cache"):
            face_recognizer.invalidate_cache(repo.organization_id)

        return {"success": True, "message": "Face recognizer cache invalidated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cache invalidation error: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to invalidate face cache: {e}"
        )


@router.delete("/face/database")
async def clear_database(
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    """
    Clear all persons from the face database
    """
    try:

        result = await face_recognizer.clear_database(repo.organization_id)

        if result["success"]:
            await repo.add_audit_log(
                action="DATABASE_CLEARED",
                target_type="system",
                target_id="biometrics",
                details="Entire face database wiped",
            )
            return {
                "success": True,
                "message": "Face database cleared successfully",
                "total_persons": 0,
            }
        else:
            raise HTTPException(
                status_code=500, detail=result.get("error", "Failed to clear database")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Database clear error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear database: {e}")


@router.get("/face/stats")
async def get_face_stats(
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    """
    Get face recognition statistics and configuration
    """
    try:

        stats = await face_recognizer.get_stats(repo.organization_id)

        # Return stats directly in the format expected by the Settings component
        return stats

    except Exception as e:
        logger.error(f"Get stats error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {e}")
