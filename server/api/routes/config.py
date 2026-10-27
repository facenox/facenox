import csv
import io
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse

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
        await repo.session.commit()
        await repo.session.refresh(settings)
        return settings

    except Exception as e:
        logger.error(f"Error getting settings: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/time-health", response_model=AttendanceTimeHealthResponse)
async def get_time_health(verify_online: bool = False):
    """Return backend time authority health and drift diagnostics."""
    try:
        return await get_time_authority().get_time_health(verify_online=verify_online)
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
        settings = await repo.get_settings()
        update_data = {}
        for field, value in updates.model_dump(exclude_unset=True).items():
            if value is not None and getattr(settings, field, None) != value:
                update_data[field] = value

        if not update_data:
            settings = await repo.get_settings()
            return settings

        success = await repo.update_settings(update_data)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update settings")

        updated_settings = await repo.get_settings()

        await repo.add_audit_log(
            action="SETTINGS_UPDATED",
            target_type="system",
            target_id="settings",
            details=f"Fields updated: {', '.join(update_data.keys())}",
        )

        await repo.session.commit()
        await repo.session.refresh(updated_settings)

        from services.live_stream_service import LiveStreamService

        LiveStreamService.invalidate_all(repo.organization_id)

        return updated_settings

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/audit-log")
async def export_audit_log(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    format: Optional[str] = None,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Export audit log as CSV for compliance review."""
    try:
        start_dt = None
        if start_date:
            try:
                # Handle possible 'Z' suffix or other standard ISO strings
                clean_start = start_date.replace("Z", "+00:00")
                start_dt = datetime.fromisoformat(clean_start)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid start_date format. Must be ISO format.",
                )

        end_dt = None
        if end_date:
            try:
                clean_end = end_date.replace("Z", "+00:00")
                end_dt = datetime.fromisoformat(clean_end)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid end_date format. Must be ISO format.",
                )

        logs = await repo.get_audit_logs(start_date=start_dt, end_date=end_dt)
        if format == "json":
            return JSONResponse(
                [
                    {
                        "timestamp": (
                            log.timestamp.isoformat() if log.timestamp else None
                        ),
                        "action": log.action,
                        "target_type": log.target_type,
                        "target_id": log.target_id,
                        "details": log.details,
                    }
                    for log in logs[:100]
                ]
            )

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Timestamp", "Action", "Target Type", "Target ID", "Details"])
        for log in logs:
            action_raw = log.action or ""
            action_clean = action_raw.replace("_", " ").title() if action_raw else ""
            if action_raw == "ATTENDANCE_HISTORY_PURGED":
                action_clean = "Attendance History Purged"

            target_type_clean = (log.target_type or "").title()

            writer.writerow(
                [
                    log.timestamp.isoformat() if log.timestamp else "",
                    action_clean,
                    target_type_clean,
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
