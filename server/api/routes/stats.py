import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends

from api.schemas import (
    AttendanceStatsResponse,
    DatabaseStatsResponse,
)
from api.deps import get_repository
from database.repository import AttendanceRepository
from services.attendance_service import AttendanceService
from services.time_authority_service import get_time_authority
from time_utils import local_day_bounds, local_date_string

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["stats"])


@router.get("/groups/{group_id}/stats", response_model=AttendanceStatsResponse)
async def get_group_stats(
    group_id: str,
    date: Optional[str] = Query(
        None, description="YYYY-MM-DD format, defaults to today"
    ),
    repo: AttendanceRepository = Depends(get_repository),
):
    """
    Get attendance statistics for a group.

    Retrieves or dynamically computes daily attendance metrics for members of
    a specific group on the target date.

    If sessions do not exist in the database yet, or if they are legacy sessions
    missing active check-in times, this endpoint triggers an on-the-fly recomputation.
    Recomputation evaluates chronological raw logs against the historical,
    effective-dated group rules (e.g. tracking late check-in bounds or check-out times)
    to build precise and up-to-date attendance state before calculating group-wide statistics.
    """
    try:
        target_date = date or local_date_string(
            get_time_authority().current_time_local()
        )

        if group_id.lower() == "all":
            members = await repo.get_members(is_active=True)
            sessions = await repo.get_sessions(
                start_date=target_date, end_date=target_date
            )
            service = AttendanceService(repo)
            stats = service.calculate_group_stats(members, sessions)
            return AttendanceStatsResponse(**stats)

        group = await repo.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        # Parallelize data fetching to reduce latency
        import asyncio

        members_task = repo.get_group_members(group_id)
        rules_task = repo.get_group_rules(group_id)
        sessions_task = repo.get_sessions(
            group_id=group_id, start_date=target_date, end_date=target_date
        )

        members, rule_history, sessions = await asyncio.gather(
            members_task, rules_task, sessions_task
        )

        service = AttendanceService(repo)

        # Trigger self-healing computation in memory if stats are queried for a date with no session states,
        # or if existing records show inconsistent check-in details due to partial raw logs.
        needs_recompute = not sessions
        if sessions:
            for session in sessions:
                if session.status == "present" and session.check_in_time is None:
                    needs_recompute = True
                    break

        if needs_recompute:
            start_of_day, end_of_day = local_day_bounds(target_date)
            records = await repo.get_records(
                group_id=group_id, start_date=start_of_day, end_date=end_of_day
            )

            sessions = service.compute_sessions_from_records(
                records=records,
                members=members,
                late_threshold_minutes=group.late_threshold_minutes or 15,
                target_date=target_date,
                class_start_time=group.class_start_time,
                late_threshold_enabled=group.late_threshold_enabled or False,
                existing_sessions=sessions,
                track_checkout=getattr(group, "track_checkout", False),
                rule_history=rule_history,
            )

        stats = service.calculate_group_stats(members, sessions)

        return AttendanceStatsResponse(**stats)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting group stats for {group_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/stats", response_model=DatabaseStatsResponse)
async def get_database_stats(
    last_synced_at: Optional[str] = Query(
        None, description="ISO-8601 string of last sync time"
    ),
    repo: AttendanceRepository = Depends(get_repository),
):
    """
    Get database statistics.

    Retrieves high-level metadata from the underlying storage repository,
    such as total face records and structural layout information.
    """
    try:
        stats = await repo.get_stats()

        # Calculate unsynced counts if last_synced_at is provided
        unsynced_records = None
        unsynced_sessions = None
        if last_synced_at:
            try:
                from datetime import datetime
                from sqlalchemy import select, func
                from database.models import AttendanceRecord, AttendanceSession

                since_dt = datetime.fromisoformat(last_synced_at.replace("Z", "+00:00"))

                unsynced_records = await repo.session.scalar(
                    repo._apply_org_scope(
                        select(func.count())
                        .select_from(AttendanceRecord)
                        .where(AttendanceRecord.last_modified_at > since_dt),
                        AttendanceRecord,
                    )
                )

                unsynced_sessions = await repo.session.scalar(
                    repo._apply_org_scope(
                        select(func.count())
                        .select_from(AttendanceSession)
                        .where(AttendanceSession.last_modified_at > since_dt),
                        AttendanceSession,
                    )
                )
            except Exception as se:
                logger.warning(f"Failed to calculate unsynced stats: {se}")
        else:
            unsynced_records = stats.get("total_records", 0)
            unsynced_sessions = stats.get("total_sessions", 0)

        stats["unsynced_records_count"] = unsynced_records
        stats["unsynced_sessions_count"] = unsynced_sessions

        return DatabaseStatsResponse(**stats)

    except Exception as e:
        logger.error(f"Error getting database stats: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
