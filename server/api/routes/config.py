import csv
import io
import logging
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from api.schemas import (
    AttendanceSettingsUpdate,
    AttendanceSettingsResponse,
    AttendanceTimeHealthResponse,
)
from api.deps import get_repository
from database.repository import AttendanceRepository
from services.time_authority_service import get_time_authority

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AttendanceSettingsResponse)
async def get_settings(repo: AttendanceRepository = Depends(get_repository)):
    """Get attendance settings"""
    try:
        settings = await repo.get_settings()
        return settings

    except Exception as e:
        logger.error(f"Error getting settings: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/time-health", response_model=AttendanceTimeHealthResponse)
async def get_time_health():
    """Return backend time authority health and drift diagnostics."""
    try:
        return await get_time_authority().get_time_health(force_refresh=True)
    except Exception as e:
        logger.error(f"Error getting time health: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.put("", response_model=AttendanceSettingsResponse)
async def update_settings(
    updates: AttendanceSettingsUpdate,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Update attendance settings"""
    try:
        update_data = {}
        for field, value in updates.model_dump(exclude_unset=True).items():
            if value is not None:
                update_data[field] = value

        if not update_data:
            settings = await repo.get_settings()
            return settings

        success = await repo.update_settings(update_data)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update settings")

        updated_settings = await repo.get_settings()
        return updated_settings

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/audit-log")
async def export_audit_log(repo: AttendanceRepository = Depends(get_repository)):
    """Export audit log as CSV for compliance review."""
    try:
        logs = await repo.get_audit_logs()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["timestamp", "action", "target_type", "target_id", "details"])
        for log in logs:
            writer.writerow(
                [
                    log.timestamp.isoformat() if log.timestamp else "",
                    log.action or "",
                    log.target_type or "",
                    log.target_id or "",
                    log.details or "",
                ]
            )
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
        )
    except Exception as e:
        logger.error(f"Error exporting audit log: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
