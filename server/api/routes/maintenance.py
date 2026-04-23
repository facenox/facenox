import logging
from fastapi import APIRouter, HTTPException, Depends

from api.schemas import (
    SuccessResponse,
    CleanupRequest,
)
from api.deps import get_repository
from database.repository import AttendanceRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["maintenance"])


@router.post("/cleanup", response_model=SuccessResponse)
async def cleanup_old_data(
    cleanup_data: CleanupRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Clean up old attendance data"""
    try:
        days = cleanup_data.days_to_keep or 30
        results = await repo.cleanup_old_data(days)

        await repo.add_audit_log(
            action="DATA_CLEANUP_RUN",
            target_type="system",
            target_id="attendance_records",
            details=f"Cleanup for data older than {days} days. Deleted {results['records_deleted']} records and {results['sessions_deleted']} sessions.",
        )

        return SuccessResponse(
            message=f"Cleanup successful: {results['records_deleted']} records and {results['sessions_deleted']} sessions deleted."
        )

    except Exception as e:
        logger.error(f"Error cleaning up old data: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/wipe", response_model=SuccessResponse)
async def remote_wipe_data(
    repo: AttendanceRepository = Depends(get_repository),
):
    """
    Comprehensive remote wipe:
    1. Clear all attendance records, sessions, and events.
    2. Clear all biometric face templates.
    """
    try:
        # 1. Clear attendance records from DB
        # We'll use a new method in repository to clear all
        results = await repo.clear_all_attendance_data()

        # 2. Clear face database via face_recognizer
        # We'll import get_face_recognizer to call it here
        from api.recognition_deps import get_face_recognizer

        face_recognizer = await get_face_recognizer()
        face_result = await face_recognizer.clear_database(repo.organization_id)

        await repo.add_audit_log(
            action="REMOTE_WIPE_EXECUTED",
            target_type="system",
            target_id="all_data",
            details=f"Remote wipe triggered. Records cleared: {results.get('records_deleted', 0)}. Biometrics cleared: {face_result.get('success', False)}",
        )

        return SuccessResponse(
            message="Remote wipe completed successfully. All local data erased."
        )

    except Exception as e:
        logger.error(f"Error during remote wipe: {e}")
        raise HTTPException(status_code=500, detail=f"Wipe failed: {str(e)}")
