from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from api.deps import get_repository
from api.schemas import (
    AttendanceGroupResponse,
    AttendanceGroupRuleResponse,
    AttendanceMemberResponse,
    AttendanceRecordResponse,
    AttendanceSessionResponse,
    AttendanceSettingsResponse,
    ExportDataResponse,
)
from database.models import (
    AttendanceGroupRule,
    AttendanceMember,
    AttendanceRecord,
    AttendanceSession,
)
from database.repository import AttendanceRepository
from services.time_authority_service import get_time_authority

from api.routes import (
    groups,
    members,
    records,
    stats,
    config,
    maintenance,
)

router = APIRouter(prefix="/attendance")


router.include_router(groups.router)
router.include_router(members.router)
router.include_router(records.router)
router.include_router(stats.router)
router.include_router(config.router)
router.include_router(maintenance.router)


@router.post("/export", response_model=ExportDataResponse)
async def export_attendance_data(
    repo: AttendanceRepository = Depends(get_repository),
):
    """Export attendance-related data without biometric templates."""
    try:
        groups_orm = await repo.get_groups(active_only=False)
        settings_orm = await repo.get_settings()

        members_query = select(AttendanceMember).where(
            AttendanceMember.is_deleted.is_(False)
        )
        if repo.organization_id:
            members_query = members_query.where(
                AttendanceMember.organization_id == repo.organization_id
            )
        members_result = await repo.session.execute(members_query)
        members_orm = members_result.scalars().all()

        group_rules_query = select(AttendanceGroupRule)
        if repo.organization_id:
            group_rules_query = group_rules_query.where(
                AttendanceGroupRule.organization_id == repo.organization_id
            )
        group_rules_result = await repo.session.execute(
            group_rules_query.order_by(
                AttendanceGroupRule.group_id, AttendanceGroupRule.effective_from
            )
        )
        group_rules_orm = group_rules_result.scalars().all()

        records_query = select(AttendanceRecord)
        if repo.organization_id:
            records_query = records_query.where(
                AttendanceRecord.organization_id == repo.organization_id
            )
        records_result = await repo.session.execute(
            records_query.order_by(AttendanceRecord.timestamp.desc())
        )
        records_orm = records_result.scalars().all()

        sessions_query = select(AttendanceSession)
        if repo.organization_id:
            sessions_query = sessions_query.where(
                AttendanceSession.organization_id == repo.organization_id
            )
        sessions_result = await repo.session.execute(
            sessions_query.order_by(AttendanceSession.date.desc())
        )
        sessions_orm = sessions_result.scalars().all()

        return ExportDataResponse(
            groups=[
                AttendanceGroupResponse.model_validate(g, from_attributes=True)
                for g in groups_orm
            ],
            group_rules=[
                AttendanceGroupRuleResponse.model_validate(r, from_attributes=True)
                for r in group_rules_orm
            ],
            members=[
                AttendanceMemberResponse.model_validate(m, from_attributes=True)
                for m in members_orm
            ],
            records=[
                AttendanceRecordResponse.model_validate(r, from_attributes=True)
                for r in records_orm
            ],
            sessions=[
                AttendanceSessionResponse.model_validate(s, from_attributes=True)
                for s in sessions_orm
            ],
            settings=AttendanceSettingsResponse.model_validate(
                settings_orm, from_attributes=True
            ),
            exported_at=get_time_authority().current_time_local(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")


face_detector = None
face_recognizer = None
