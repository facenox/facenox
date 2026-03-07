import logging
import time

from fastapi import APIRouter, HTTPException, Depends

from api.deps import get_repository
from api.recognition_deps import get_face_recognizer
from database.repository import AttendanceRepository
from api.schemas import (
    FaceRecognitionRequest,
    FaceRecognitionResponse,
    FaceRegistrationRequest,
    FaceRegistrationResponse,
    PersonUpdateRequest,
    SimilarityThresholdRequest,
)
from hooks import process_liveness_for_face_operation
from utils.image_utils import decode_base64_image

if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/face/recognize", response_model=FaceRecognitionResponse)
async def recognize_face(
    request: FaceRecognitionRequest,
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    """
    Recognize a face using face recognizer with liveness detection validation
    """
    start_time = time.time()

    try:

        image = decode_base64_image(request.image)

        should_block, error_msg = process_liveness_for_face_operation(
            image, request.bbox, request.enable_liveness_detection, "Recognition"
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

        landmarks_5 = request.landmarks_5

        allowed_person_ids = await repo.get_group_person_ids(request.group_id)
        result = await face_recognizer.recognize_face(
            image, landmarks_5, allowed_person_ids
        )

        processing_time = time.time() - start_time

        return FaceRecognitionResponse(
            success=result["success"],
            person_id=result.get("person_id"),
            similarity=result.get("similarity", 0.0),
            processing_time=processing_time,
            error=result.get("error"),
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


@router.post("/face/register", response_model=FaceRegistrationResponse)
async def register_person(
    request: FaceRegistrationRequest,
    repo: AttendanceRepository = Depends(get_repository),
    face_recognizer=Depends(get_face_recognizer),
):
    """
    Register a new person in the face database with liveness detection validation
    """
    start_time = time.time()

    try:

        member = await repo.get_member(request.person_id)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        if member.group_id != request.group_id:
            raise HTTPException(
                status_code=400,
                detail="Member does not belong to the provided group",
            )

        if not member.has_consent:
            raise HTTPException(
                status_code=403,
                detail="Biometric consent is required before face registration.",
            )

        image = decode_base64_image(request.image)

        # Check liveness detection
        should_block, error_msg = process_liveness_for_face_operation(
            image, request.bbox, request.enable_liveness_detection, "Registration"
        )
        if should_block:
            processing_time = time.time() - start_time
            return FaceRegistrationResponse(
                success=False,
                person_id=request.person_id,
                total_persons=0,
                processing_time=processing_time,
                error=error_msg,
            )

        # Landmarks are required for alignment in this pipeline.
        landmarks_5 = request.landmarks_5

        result = await face_recognizer.register_person(
            request.person_id, image, landmarks_5
        )

        processing_time = time.time() - start_time

        return FaceRegistrationResponse(
            success=result["success"],
            person_id=request.person_id,
            total_persons=result.get("total_persons", 0),
            processing_time=processing_time,
            error=result.get("error"),
        )

    except HTTPException:
        raise
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"Person registration error: {e}")
        return FaceRegistrationResponse(
            success=False,
            person_id=request.person_id,
            total_persons=0,
            processing_time=processing_time,
            error=str(e),
        )


@router.delete("/face/person/{person_id}")
async def remove_person(person_id: str, face_recognizer=Depends(get_face_recognizer)):
    """
    Remove a person from the face database
    """
    try:

        result = await face_recognizer.remove_person(person_id)

        if result["success"]:
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
    request: PersonUpdateRequest, face_recognizer=Depends(get_face_recognizer)
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

        result = await face_recognizer.update_person_id(
            request.old_person_id.strip(), request.new_person_id.strip()
        )

        if result["success"]:
            return result
        else:
            raise HTTPException(
                status_code=404, detail=result.get("error", "Update failed")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Person update error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update person: {e}")


@router.get("/face/persons")
async def get_all_persons(face_recognizer=Depends(get_face_recognizer)):
    """
    Get list of all registered persons
    """
    try:

        persons = await face_recognizer.get_all_persons()
        stats = await face_recognizer.get_stats()

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
async def invalidate_face_cache(face_recognizer=Depends(get_face_recognizer)):
    try:

        if hasattr(face_recognizer, "_invalidate_cache"):
            face_recognizer._invalidate_cache()

        return {"success": True, "message": "Face recognizer cache invalidated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cache invalidation error: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to invalidate face cache: {e}"
        )


@router.delete("/face/database")
async def clear_database(face_recognizer=Depends(get_face_recognizer)):
    """
    Clear all persons from the face database
    """
    try:

        result = await face_recognizer.clear_database()

        if result["success"]:
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
async def get_face_stats(face_recognizer=Depends(get_face_recognizer)):
    """
    Get face recognition statistics and configuration
    """
    try:

        stats = await face_recognizer.get_stats()

        # Return stats directly in the format expected by the Settings component
        return stats

    except Exception as e:
        logger.error(f"Get stats error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {e}")
