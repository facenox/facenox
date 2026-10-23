import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy import select, text

from api.schemas import (
    SuccessResponse,
    CleanupRequest,
    ImportMetadataRequest,
    ImportMetadataResponse,
)
from api.deps import get_repository
from database.repository import AttendanceRepository
from database.models import AttendanceGroup, AttendanceMember, Face

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["maintenance"])


@router.post("/cleanup", response_model=SuccessResponse)
async def cleanup_old_data(
    cleanup_data: CleanupRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Clean up old attendance data and truncate WAL file"""
    try:
        days = cleanup_data.days_to_keep or 30
        results = await repo.cleanup_old_data(days)

        # Truncate SQLite WAL file to reclaim disk space after large cleanup
        try:
            await repo.session.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
        except Exception as wal_err:
            logger.debug("WAL checkpoint non-fatal notice: %s", wal_err)

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
        if not face_result.get("success"):
            raise RuntimeError(
                "Local attendance was cleared, but face templates could not be removed. "
                "Review this computer before using it again."
            )

        await repo.add_audit_log(
            action="REMOTE_WIPE_EXECUTED",
            target_type="system",
            target_id="all_data",
            details=f"Remote wipe triggered. Records cleared: {results.get('records_deleted', 0)}. Biometrics cleared: {face_result.get('success', False)}",
        )

        return SuccessResponse(
            message="Remote wipe completed. Local attendance records and face templates were removed."
        )

    except Exception as e:
        logger.error(f"Error during remote wipe: {e}")
        raise HTTPException(status_code=500, detail=f"Wipe failed: {str(e)}")


@router.post("/unpair", response_model=SuccessResponse)
async def unpair_local_database(
    repo: AttendanceRepository = Depends(get_repository),
    x_facenox_organization: Optional[str] = Header(
        None, alias="X-Facenox-Organization"
    ),
):
    """Reset database organization settings to unlock standalone offline operations."""
    try:
        await repo.unassign_organization_id(
            org_id=x_facenox_organization or repo.organization_id
        )

        await repo.add_audit_log(
            action="DEVICE_MANUALLY_UNPAIRED",
            target_type="system",
            target_id="settings",
            details="Device disconnected locally. Organization scope removed from database settings and records transitioned to standalone offline scope.",
        )

        from core.lifespan import face_recognizer
        from utils.websocket_manager import manager

        if face_recognizer:
            try:
                await face_recognizer.refresh_cache(None)
            except Exception as err:
                logger.error(
                    f"Failed to refresh face_recognizer cache after unpair: {err}"
                )

        try:
            await manager.disconnect_all()
        except Exception as ws_err:
            logger.warning(
                f"Failed to disconnect active websockets on unpair: {ws_err}"
            )

        return SuccessResponse(message="Local database unpaired successfully.")

    except Exception as e:
        logger.error(f"Error during local unpairing: {e}")
        raise HTTPException(status_code=500, detail=f"Unpair failed: {str(e)}")


@router.post("/purge-history", response_model=SuccessResponse)
async def purge_attendance_history(
    repo: AttendanceRepository = Depends(get_repository),
):
    """
    Wipe all operational attendance transaction records and daily sessions.
    Preserves structural directories, members, and biometric faces.
    """
    try:
        results = await repo.clear_attendance_history()

        await repo.add_audit_log(
            action="ATTENDANCE_HISTORY_PURGED",
            target_type="system",
            target_id="history",
            details=f"All history logs manually purged. Records cleared: {results.get('records_deleted', 0)}. Sessions cleared: {results.get('sessions_deleted', 0)}.",
        )

        return SuccessResponse(
            message=f"Purged successfully. Records: {results.get('records_deleted', 0)}, Sessions: {results.get('sessions_deleted', 0)}."
        )

    except Exception as e:
        logger.error(f"Error during history purge: {e}")
        raise HTTPException(status_code=500, detail=f"Purge failed: {str(e)}")


async def _accept_remote(
    repo,
    row,
    revision: int,
    acknowledged: Optional[int],
    active: bool,
    accepted: Optional[int] = None,
) -> bool:
    if revision < row.sync_revision:
        return False
    if row.sync_dirty and active:
        if row.version != acknowledged:
            # An earlier local version was accepted; retain the newer edit but
            # advance its base only when this is exactly that acknowledged row.
            if accepted == revision:
                row.sync_revision = revision
            return False
        if acknowledged is not None and accepted != revision:
            import json

            fields = ("name", "group_id", "role", "email", "is_active", "settings")
            await repo.add_audit_log(
                action="SYNC_CONFLICT_RESOLVED",
                target_type="directory",
                target_id=getattr(row, "person_id", row.id),
                details=json.dumps(
                    {
                        "resolution": "Cloud revision retained",
                        "local": {
                            key: getattr(row, key)
                            for key in fields
                            if hasattr(row, key)
                        },
                    }
                ),
            )
    return True


@router.post("/import-metadata", response_model=ImportMetadataResponse)
async def import_metadata(
    request: ImportMetadataRequest, repo: AttendanceRepository = Depends(get_repository)
):
    """Apply explicit Cloud revisions. A page is never a complete directory snapshot."""
    repo.session.info["sync_import"] = True
    try:
        groups_count = members_count = pruned_faces = 0
        for group in request.groups:
            query = repo._apply_org_scope(
                select(AttendanceGroup).where(AttendanceGroup.id == group.id),
                AttendanceGroup,
            )
            existing = (await repo.session.execute(query)).scalar_one_or_none()
            if existing and not await _accept_remote(
                repo,
                existing,
                group.sync_revision,
                request.acknowledged_groups.get(group.id),
                group.is_active,
                request.accepted_groups.get(group.id),
            ):
                continue
            payload = {
                "name": group.name,
                "settings": group.settings or {},
                "is_active": group.is_active,
            }
            if existing:
                # The normal update path records effective-dated schedule changes,
                # including class_end_time. Temporarily revive for its scoped lookup.
                existing.is_deleted = False
                await repo.update_group(group.id, payload)
            else:
                existing = await repo.create_group(
                    {**payload, "id": group.id, "created_at": group.created_at}
                )
            existing.is_deleted = not group.is_active
            existing.is_active = group.is_active
            existing.remote_id = group.remote_id or group.id
            existing.sync_revision = group.sync_revision
            existing.sync_dirty = False
            groups_count += 1

        for member in request.members:
            query = repo._apply_org_scope(
                select(AttendanceMember).where(
                    AttendanceMember.person_id == member.person_id
                ),
                AttendanceMember,
            )
            existing = (await repo.session.execute(query)).scalar_one_or_none()
            if existing and not await _accept_remote(
                repo,
                existing,
                member.sync_revision,
                request.acknowledged_members.get(member.person_id),
                member.is_active,
                request.accepted_members.get(member.person_id),
            ):
                continue
            if not member.is_active:
                if existing:
                    await repo.remove_member(member.person_id)
                    existing.sync_revision = member.sync_revision
                    existing.sync_dirty = False
                continue
            group_query = repo._apply_org_scope(
                select(AttendanceGroup).where(AttendanceGroup.id == member.group_id),
                AttendanceGroup,
            )
            group = (await repo.session.execute(group_query)).scalar_one_or_none()
            if not group or not group.is_active or group.is_deleted:
                continue  # Never revive a deleted group to satisfy an active member.
            payload = {
                "person_id": member.person_id,
                "group_id": member.group_id,
                "name": member.name,
                "role": member.role,
                "email": member.email,
                "remote_id": member.remote_id or member.person_id,
            }
            if existing:
                existing.is_deleted = False
                existing.is_active = True
                await repo.update_member(member.person_id, payload)
            else:
                existing = await repo.add_member(
                    {**payload, "joined_at": member.joined_at}
                )
            existing.sync_revision = member.sync_revision
            existing.sync_dirty = False
            members_count += 1

        # Explicit removals cover transfers away from this site. Absence on a page
        # carries no meaning. Legacy full-snapshot pruning must be opt-in.
        group_ids = set(request.removed_group_ids)
        member_ids = set(request.removed_member_ids)
        if request.prune_missing:
            groups_query = repo._apply_org_scope(
                select(AttendanceGroup).where(AttendanceGroup.remote_id.isnot(None)),
                AttendanceGroup,
            )
            members_query = repo._apply_org_scope(
                select(AttendanceMember).where(AttendanceMember.remote_id.isnot(None)),
                AttendanceMember,
            )
            if request.groups:
                group_ids.update(
                    g.id
                    for g in (await repo.session.execute(groups_query)).scalars()
                    if g.id not in {x.id for x in request.groups}
                )
            if request.members:
                member_ids.update(
                    m.person_id
                    for m in (await repo.session.execute(members_query)).scalars()
                    if m.person_id not in {x.person_id for x in request.members}
                )
        for gid in group_ids:
            group = await repo.get_group(gid)
            if group and group.remote_id:
                members = await repo.get_group_members(gid)
                member_ids.update(m.person_id for m in members)
                await repo.delete_group(gid)
                group.sync_dirty = False
        # Group tombstones also suppress pending member mutations/enrollments.
        deleted_groups = {g.id for g in request.groups if not g.is_active} | group_ids
        if deleted_groups:
            q = repo._apply_org_scope(
                select(AttendanceMember).where(
                    AttendanceMember.group_id.in_(deleted_groups)
                ),
                AttendanceMember,
            )
            member_ids.update(
                m.person_id for m in (await repo.session.execute(q)).scalars()
            )
        for pid in member_ids:
            q = repo._apply_org_scope(
                select(AttendanceMember).where(AttendanceMember.person_id == pid),
                AttendanceMember,
            )
            member = (await repo.session.execute(q)).scalar_one_or_none()
            if member and member.remote_id:
                await repo.remove_member(pid)
                member.sync_dirty = False
        # Member removal has erased local bytes. Do not echo downloaded deletions.
        deleted_members = {
            m.person_id for m in request.members if not m.is_active
        } | member_ids
        if deleted_members:
            q = repo._apply_org_scope(
                select(Face).where(Face.person_id.in_(deleted_members)), Face
            )
            for face in (await repo.session.execute(q)).scalars():
                face.embedding = b""
                face.hash = None
                face.is_deleted = True
                face.sync_dirty = False
                pruned_faces += 1
        await repo.session.commit()
        from core.lifespan import face_recognizer

        if face_recognizer:
            await face_recognizer.refresh_cache(repo.organization_id)
        return ImportMetadataResponse(
            success=True,
            groups_count=groups_count,
            members_count=members_count,
            pruned_faces=pruned_faces,
        )
    except Exception:
        await repo.session.rollback()
        raise
    finally:
        repo.session.info.pop("sync_import", None)
