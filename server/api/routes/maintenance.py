import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select

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


@router.post("/unpair", response_model=SuccessResponse)
async def unpair_local_database(
    repo: AttendanceRepository = Depends(get_repository),
):
    """Reset database organization settings to unlock standalone offline operations."""
    try:
        from database.models import AttendanceSettings
        from sqlalchemy import update

        await repo.session.execute(
            update(AttendanceSettings).values(
                organization_id=None, data_retention_days=0
            )
        )
        await repo.session.commit()

        await repo.add_audit_log(
            action="DEVICE_MANUALLY_UNPAIRED",
            target_type="system",
            target_id="settings",
            details="Device disconnected locally. Organization scope removed from database settings.",
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


@router.post("/import-metadata", response_model=ImportMetadataResponse)
async def import_metadata(
    request: ImportMetadataRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """
    Import metadata (groups and members) pulled from the cloud dashboard.
    """
    try:
        groups_count = 0
        for group in request.groups:
            # Query without is_deleted filter to find soft-deleted groups too.
            # Using repo.get_group() would miss deleted rows, causing a
            # UNIQUE constraint violation on re-insert.
            stmt = select(AttendanceGroup).where(
                AttendanceGroup.id == group.id,
                AttendanceGroup.organization_id == repo.organization_id,
            )
            result = await repo.session.execute(stmt)
            existing_group = result.scalars().first()

            remote_id = group.remote_id or group.id
            group_settings = group.settings or {}
            if group.biometric_consent_certified is not None:
                group_settings["biometric_consent_certified"] = (
                    group.biometric_consent_certified
                )
            group_payload = {
                "id": group.id,
                "name": group.name,
                "is_active": group.is_active,
                "settings": group_settings,
                "remote_id": remote_id,
            }
            if group.created_at:
                group_payload["created_at"] = group.created_at
            if existing_group:
                was_deleted = existing_group.is_deleted
                is_active_val = group.is_active if group.is_active is not None else True
                existing_group.name = group.name
                existing_group.is_active = is_active_val
                existing_group.is_deleted = not is_active_val
                existing_group.remote_id = remote_id
                existing_group.organization_id = repo.organization_id
                settings = group.settings or {}
                if "late_threshold_minutes" in settings:
                    existing_group.late_threshold_minutes = settings[
                        "late_threshold_minutes"
                    ]
                if "late_threshold_enabled" in settings:
                    existing_group.late_threshold_enabled = settings[
                        "late_threshold_enabled"
                    ]
                if "class_start_time" in settings:
                    existing_group.class_start_time = settings["class_start_time"]
                if "track_checkout" in settings:
                    existing_group.track_checkout = settings["track_checkout"]
                if group.biometric_consent_certified is not None:
                    existing_group.biometric_consent_certified = (
                        group.biometric_consent_certified
                    )

                # Re-assert group rule when reviving to prevent stale
                # attendance config (thresholds, class start time, etc.)
                if was_deleted and is_active_val:
                    await repo.add_group_rule(
                        repo._group_rule_payload(
                            existing_group.id,
                            {
                                "late_threshold_minutes": existing_group.late_threshold_minutes,
                                "late_threshold_enabled": existing_group.late_threshold_enabled,
                                "class_start_time": existing_group.class_start_time,
                                "track_checkout": existing_group.track_checkout,
                            },
                        )
                    )
            else:
                await repo.create_group(group_payload)
            groups_count += 1

        members_count = 0
        revoked_consent_ids: list[str] = []
        for member in request.members:
            stmt = select(AttendanceMember).where(
                AttendanceMember.person_id == member.person_id,
                AttendanceMember.organization_id == repo.organization_id,
            )
            result = await repo.session.execute(stmt)
            existing_member = result.scalars().first()
            remote_id = member.remote_id or member.person_id
            is_active_val = member.is_active if member.is_active is not None else True

            if is_active_val is False:
                # Soft delete member locally and purge local biometric face data
                if existing_member:
                    await repo.remove_member(member.person_id)
                continue

            member_payload = {
                "person_id": member.person_id,
                "group_id": member.group_id,
                "name": member.name,
                "role": member.role,
                "email": member.email,
                "is_active": True,
                "has_consent": member.has_consent,
                "consent_granted_at": member.consent_granted_at,
                "consent_granted_by": member.consent_granted_by,
                "remote_id": remote_id,
            }
            if member.id:
                member_payload["id"] = member.id
            if member.joined_at:
                member_payload["joined_at"] = member.joined_at
            if existing_member:
                # Track consent revocations for biometric erasure
                if existing_member.has_consent and not member.has_consent:
                    revoked_consent_ids.append(member.person_id)
                existing_member.is_deleted = False
                existing_member.is_active = True
                await repo.update_member(member.person_id, member_payload)
            else:
                # Ensure local group exists for SQLite FK constraints
                # Query without is_deleted filter to catch soft-deleted rows
                grp_stmt = select(AttendanceGroup).where(
                    AttendanceGroup.id == member.group_id,
                    AttendanceGroup.organization_id == repo.organization_id,
                )
                grp_result = await repo.session.execute(grp_stmt)
                group_exists = grp_result.scalars().first()
                if not group_exists:
                    logger.warning(
                        f"Group {member.group_id} not found locally for member {member.name}. Auto-creating Group."
                    )
                    await repo.create_group(
                        {
                            "id": member.group_id,
                            "name": f"Group {member.group_id[:8]}",
                            "is_active": True,
                            "settings": {},
                        }
                    )
                elif group_exists.is_deleted:
                    group_exists.is_deleted = False
                    group_exists.is_active = True
                await repo.add_member(member_payload)
            members_count += 1

        # Prune groups/members that were deleted from the cloud dashboard
        pulled_group_ids = {g.id for g in request.groups}
        group_query = select(AttendanceGroup).where(
            AttendanceGroup.is_deleted.is_(False),
        )
        group_query = repo._apply_org_scope(group_query, AttendanceGroup)
        if pulled_group_ids:
            group_query = group_query.where(AttendanceGroup.id.notin_(pulled_group_ids))
        result = await repo.session.execute(group_query)
        for g in result.scalars().all():
            await repo.delete_group(g.id)

        pulled_member_ids = {m.person_id for m in request.members}
        member_query = select(AttendanceMember).where(
            AttendanceMember.is_deleted.is_(False),
        )
        member_query = repo._apply_org_scope(member_query, AttendanceMember)
        if pulled_member_ids:
            member_query = member_query.where(
                AttendanceMember.person_id.notin_(pulled_member_ids)
            )
        result = await repo.session.execute(member_query)
        for m in result.scalars().all():
            m.is_active = False
            m.is_deleted = True

        # Prune orphan face embeddings for members that no longer exist in the members list
        pruned_faces = 0
        if pulled_member_ids is not None:
            if pulled_member_ids:
                faces_to_prune = select(Face).where(
                    Face.person_id.notin_(pulled_member_ids),
                    Face.organization_id == repo.organization_id,
                )
            else:
                faces_to_prune = select(Face).where(
                    Face.organization_id == repo.organization_id,
                )
            face_result = await repo.session.execute(faces_to_prune)
            for face in face_result.scalars().all():
                await repo.session.delete(face)
                pruned_faces += 1

        await repo.session.commit()

        # Update in-memory face recognizer cache just in case any active member list shifted
        from core.lifespan import face_recognizer

        if face_recognizer:
            await face_recognizer.refresh_cache(repo.organization_id)

        # Erase biometrics for members whose consent was revoked (GDPR Art. 17)
        erased_faces = 0
        if revoked_consent_ids and face_recognizer:
            for pid in revoked_consent_ids:
                result = await face_recognizer.remove_person(pid, repo.organization_id)
                if result.get("success"):
                    erased_faces += 1
            if erased_faces:
                await face_recognizer.refresh_cache(repo.organization_id)

        await repo.add_audit_log(
            action="METADATA_PULL_IMPORTED",
            target_type="system",
            target_id="cloud_sync",
            details=f"Imported {groups_count} groups and {members_count} members from cloud dashboard metadata pull.",
        )

        return ImportMetadataResponse(
            success=True,
            groups_count=groups_count,
            members_count=members_count,
            pruned_faces=pruned_faces,
            erased_faces=erased_faces,
        )

    except Exception as e:
        logger.error(f"Error importing cloud metadata: {e}")
        await repo.session.rollback()
        raise HTTPException(
            status_code=500, detail=f"Import cloud metadata failed: {str(e)}"
        )
