import logging
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Depends

from api.schemas import (
    AttendanceRecordCreate,
    AttendanceRecordResponse,
    AttendanceRecordVoidRequest,
    AttendanceSessionResponse,
    AttendanceEventCreate,
    AttendanceEventResponse,
)
from api.deps import get_repository
from database.repository import AttendanceRepository
from services.attendance_service import AttendanceService
from services.time_authority_service import get_time_authority
from time_utils import local_day_bounds, local_date_string, to_storage_local

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["records"])


@router.post("/records", response_model=AttendanceRecordResponse)
async def add_record(
    record_data: AttendanceRecordCreate,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Add a new attendance record"""
    try:
        # Check if member exists
        member = await repo.get_member(record_data.person_id)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        # Prepare record data
        service = AttendanceService(repo)
        record_id = service.generate_id()
        timestamp = (
            to_storage_local(record_data.timestamp)
            if record_data.timestamp
            else to_storage_local(get_time_authority().current_time_local())
        )

        db_record_data = {
            "id": record_id,
            "person_id": record_data.person_id,
            "group_id": member.group_id,
            "timestamp": timestamp,
            "confidence": record_data.confidence,
            "location": record_data.location,
            "notes": record_data.notes,
            "is_manual": record_data.is_manual,
            "created_by": (
                record_data.created_by
                or ("desktop_admin" if record_data.is_manual else None)
            ),
        }

        created_record = await repo.add_record(db_record_data)
        session_date = local_date_string(record_data.timestamp or timestamp)
        await service.recompute_sessions_for_date(
            member.group_id, session_date, person_id=record_data.person_id
        )
        if record_data.is_manual:
            await repo.add_audit_log(
                action="MANUAL_ATTENDANCE_RECORDED",
                target_type="attendance_record",
                target_id=created_record.id,
                details=(
                    f"person_id={created_record.person_id}, "
                    f"group_id={created_record.group_id}, "
                    f"timestamp={created_record.timestamp.isoformat()}, "
                    f"created_by={created_record.created_by or 'desktop_admin'}"
                ),
            )
        return created_record

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding record: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/records", response_model=List[AttendanceRecordResponse])
async def get_records(
    group_id: Optional[str] = Query(None),
    person_id: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: Optional[int] = Query(100, ge=1, le=1000),
    include_voided: bool = Query(False),
    repo: AttendanceRepository = Depends(get_repository),
):
    """Get attendance records with optional filters"""
    try:
        records = await repo.get_records(
            group_id=group_id,
            person_id=person_id,
            start_date=to_storage_local(start_date) if start_date else None,
            end_date=to_storage_local(end_date) if end_date else None,
            limit=limit,
            include_voided=include_voided,
        )
        return records

    except Exception as e:
        logger.error(f"Error getting records: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/records/{record_id}/void", response_model=AttendanceRecordResponse)
async def void_record(
    record_id: str,
    payload: AttendanceRecordVoidRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Void an attendance record and rebuild the affected session."""
    try:
        record = await repo.get_record(record_id, include_voided=True)
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        if record.is_voided:
            raise HTTPException(status_code=400, detail="Record is already voided")

        voided_record = await repo.void_record(
            record_id,
            voided_by=payload.voided_by or "desktop_admin",
            void_reason=payload.reason.strip(),
        )
        if not voided_record:
            raise HTTPException(status_code=404, detail="Record not found")

        service = AttendanceService(repo)
        await service.recompute_sessions_for_date(
            voided_record.group_id,
            local_date_string(voided_record.timestamp),
            person_id=voided_record.person_id,
        )
        await repo.add_audit_log(
            action="ATTENDANCE_RECORD_VOIDED",
            target_type="attendance_record",
            target_id=voided_record.id,
            details=(
                f"person_id={voided_record.person_id}, "
                f"group_id={voided_record.group_id}, "
                f"is_manual={voided_record.is_manual}, "
                f"voided_by={voided_record.voided_by or 'desktop_admin'}, "
                f"reason={payload.reason.strip()}"
            ),
        )
        return voided_record

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error voiding record {record_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/sessions", response_model=List[AttendanceSessionResponse])
async def get_sessions(
    group_id: Optional[str] = Query(None),
    person_id: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD format"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD format"),
    repo: AttendanceRepository = Depends(get_repository),
):
    """Get attendance sessions, computing from records if needed"""
    try:
        # Get existing sessions from database
        sessions = await repo.get_sessions(
            group_id=group_id,
            person_id=person_id,
            start_date=start_date,
            end_date=end_date,
        )

        # Recompute sessions from records
        if group_id and start_date:
            group = await repo.get_group(group_id)
            if not group:
                raise HTTPException(status_code=404, detail="Group not found")

            rule_history = await repo.get_group_rules(group_id)

            members = await repo.get_group_members(group_id)
            end_date_to_use = end_date or start_date
            start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
            end_datetime = datetime.strptime(end_date_to_use, "%Y-%m-%d")

            computed_sessions = []
            current_date = start_datetime
            while current_date <= end_datetime:
                date_str = current_date.strftime("%Y-%m-%d")
                day_start, day_end = local_day_bounds(date_str)

                records = await repo.get_records(
                    group_id=group_id, start_date=day_start, end_date=day_end
                )

                existing_day_sessions = [s for s in sessions if s.date == date_str]

                service = AttendanceService(repo)
                day_sessions = service.compute_sessions_from_records(
                    records=records,
                    members=members,
                    late_threshold_minutes=group.late_threshold_minutes or 15,
                    target_date=date_str,
                    class_start_time=group.class_start_time,
                    late_threshold_enabled=group.late_threshold_enabled or False,
                    existing_sessions=existing_day_sessions,
                    track_checkout=getattr(group, "track_checkout", False),
                    rule_history=rule_history,
                )

                for session in day_sessions:
                    await repo.upsert_session(session)

                computed_sessions.extend(day_sessions)
                current_date += timedelta(days=1)

            sessions = computed_sessions

        return sessions

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/sessions/{person_id}/{date}", response_model=AttendanceSessionResponse)
async def get_session(
    person_id: str,
    date: str,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Get a specific attendance session"""
    try:
        session = await repo.get_session(person_id, date)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        return session

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session for {person_id} on {date}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/events", response_model=AttendanceEventResponse)
async def process_attendance_event(
    event_data: AttendanceEventCreate,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Process an attendance event"""
    try:
        from core.lifespan import face_detector, face_recognizer
        from utils.websocket_manager import notification_manager as ws_manager

        # Check if member exists
        member = await repo.get_member(event_data.person_id)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        # Get current settings to check confidence threshold and cooldown
        settings = await repo.get_settings()

        service = AttendanceService(
            repo,
            face_detector=face_detector,
            face_recognizer=face_recognizer,
            ws_manager=ws_manager,
        )

        return await service.process_event(event_data, member, settings)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing attendance event: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
