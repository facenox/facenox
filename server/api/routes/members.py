import logging
import inspect
from sqlalchemy.exc import IntegrityError
from typing import List, Optional, Set
from fastapi import APIRouter, HTTPException, Depends

from api.schemas import (
    AttendanceMemberCreateRequest,
    AttendanceMemberUpdate,
    AttendanceMemberResponse,
    BulkMemberCreate,
    BulkMemberDeleteRequest,
    BulkMemberResponse,
    SuccessResponse,
)
from api.deps import get_repository
from database.repository import AttendanceRepository
from services.attendance_service import AttendanceService
from member_creation import (
    member_creation_id,
    matches_member_creation,
    CREATION_CONFLICT,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["members"])


async def _get_enrolled_persons_set(
    face_recognizer, organization_id: Optional[str]
) -> Set[str]:
    if not face_recognizer or not hasattr(face_recognizer, "get_all_persons"):
        return set()
    try:
        res = face_recognizer.get_all_persons(organization_id)
        if inspect.isawaitable(res):
            all_persons = await res
        elif isinstance(res, (list, set, tuple)):
            all_persons = res
        else:
            all_persons = []
        return set(all_persons)
    except Exception as e:
        logger.debug(f"Could not retrieve enrolled persons set: {e}")
        return set()


@router.get("", response_model=List[AttendanceMemberResponse])
async def get_members(repo: AttendanceRepository = Depends(get_repository)):
    """Get all attendance members with face data status"""
    try:
        from core.lifespan import face_recognizer

        members = await repo.get_members()
        all_persons_set = await _get_enrolled_persons_set(
            face_recognizer, repo.organization_id
        )

        return [
            {
                "id": member.id,
                "person_id": member.person_id,
                "group_id": member.group_id,
                "name": member.name,
                "role": member.role,
                "email": member.email,
                "joined_at": member.joined_at,
                "is_active": member.is_active,
                "has_face_data": member.person_id in all_persons_set,
                "remote_id": member.remote_id,
            }
            for member in members
        ]
    except Exception as e:
        logger.error(f"Error getting members: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=AttendanceMemberResponse)
async def add_member(
    member_data: AttendanceMemberCreateRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Add a new attendance member with auto-generated person_id if not provided"""
    request_member_id = member_creation_id(
        repo.organization_id, member_data.creation_id
    )

    def replay_member(existing):
        if not matches_member_creation(existing, member_data.model_dump()):
            raise HTTPException(
                status_code=409,
                detail=CREATION_CONFLICT,
            )
        return existing

    try:
        # Check if group exists
        group = await repo.get_group(member_data.group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        # Prepare member data
        db_member_data = member_data.model_dump(exclude={"creation_id"})
        if request_member_id:
            # The existing primary key makes replay durable without a new table.
            existing = await repo.get_member_by_id(request_member_id)
            if existing:
                return replay_member(existing)
            db_member_data["id"] = request_member_id

        if not member_data.person_id:
            service = AttendanceService(repo)
            generated_person_id = await service.generate_person_id(
                name=member_data.name, group_id=member_data.group_id
            )
            db_member_data["person_id"] = generated_person_id
        else:
            existing_member = await repo.get_member(member_data.person_id)
            if existing_member:
                raise HTTPException(
                    status_code=400,
                    detail=f"Person ID '{member_data.person_id}' already exists.",
                )

        added_member = await repo.add_member(db_member_data)

        await repo.add_audit_log(
            action="MEMBER_CREATED",
            target_type="member",
            target_id=(
                added_member.person_id
                if hasattr(added_member, "person_id")
                else db_member_data.get("person_id")
            ),
            details=f"Member '{added_member.name}' added to group {group.name}",
        )

        await repo.session.commit()
        await repo.session.refresh(added_member)

        from services.live_stream_service import LiveStreamService

        LiveStreamService.invalidate_all(repo.organization_id)

        return added_member

    except IntegrityError:
        await repo.session.rollback()
        if request_member_id:
            existing = await repo.get_member_by_id(request_member_id)
            if existing:
                return replay_member(existing)
        raise HTTPException(
            status_code=409,
            detail="Member could not be saved because of a conflicting update. Refresh and try again.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding member: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/bulk", response_model=BulkMemberResponse)
async def add_members_bulk(
    bulk_data: BulkMemberCreate,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Add multiple members in bulk using a single database transaction"""
    try:
        # Check if groups exist
        group_ids = list(set(m.group_id for m in bulk_data.members))
        groups_by_id = {}
        for gid in group_ids:
            group = await repo.get_group(gid)
            if not group:
                raise HTTPException(status_code=404, detail=f"Group {gid} not found")
            groups_by_id[gid] = group

        async def persist_batch():
            # Rebuild dictionaries after rollback; the repository assigns missing IDs.
            bulk_results = await repo.add_members_bulk(
                [m.model_dump() for m in bulk_data.members]
            )
            errors = []
            successful_members = []
            outcomes = []
            changed = False
            for request, res in zip(bulk_data.members, bulk_results):
                success = bool(res.get("success", False))
                error = (
                    None
                    if success
                    else res.get("error", "Failed to add member to database")
                )
                outcomes.append(
                    {
                        "creation_id": request.creation_id,
                        "person_id": res.get("person_id"),
                        "success": success,
                        "error": error,
                    }
                )
                if success:
                    member = res["member"]
                    if not res.get("replayed"):
                        changed = True
                        await repo.add_audit_log(
                            action="MEMBER_CREATED",
                            target_type="member",
                            target_id=member.person_id,
                            details=f"Bulk add: Member '{member.name}' added to group {groups_by_id[member.group_id].name}",
                        )
                    successful_members.append(member)
                else:
                    errors.append(
                        {"person_id": res.get("person_id") or "unknown", "error": error}
                    )
            await repo.session.commit()
            if changed:
                from services.live_stream_service import LiveStreamService

                LiveStreamService.invalidate_all(repo.organization_id)
            refreshed = set()
            for member in successful_members:
                if member.id not in refreshed:
                    await repo.session.refresh(member)
                    refreshed.add(member.id)
            return BulkMemberResponse(
                success_count=len(successful_members),
                error_count=len(errors),
                errors=errors,
                members=successful_members,
                results=outcomes,
            )

        try:
            return await persist_batch()
        except IntegrityError:
            # A concurrent request may have committed some overlapping creation tokens.
            await repo.session.rollback()
            return await persist_batch()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk member add: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{person_id}", response_model=AttendanceMemberResponse)
async def get_member(
    person_id: str, repo: AttendanceRepository = Depends(get_repository)
):
    """Get a specific attendance member"""
    try:
        from core.lifespan import face_recognizer

        member = await repo.get_member(person_id)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        all_persons_set = await _get_enrolled_persons_set(
            face_recognizer, repo.organization_id
        )
        has_face_data = person_id in all_persons_set

        return {
            "id": member.id,
            "person_id": member.person_id,
            "group_id": member.group_id,
            "name": member.name,
            "role": member.role,
            "email": member.email,
            "joined_at": member.joined_at,
            "is_active": member.is_active,
            "has_face_data": has_face_data,
            "remote_id": member.remote_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting member {person_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.put("/{person_id}", response_model=AttendanceMemberResponse)
async def update_member(
    person_id: str,
    updates: AttendanceMemberUpdate,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Update an attendance member"""
    try:
        # Check if member exists
        existing_member = await repo.get_member(person_id)
        if not existing_member:
            raise HTTPException(status_code=404, detail="Member not found")

        # Prepare updates
        update_data = updates.model_dump(exclude_unset=True)

        if not update_data:
            return existing_member

        # If group_id is being updated, check if new group exists
        if "group_id" in update_data:
            group = await repo.get_group(update_data["group_id"])
            if not group:
                raise HTTPException(status_code=404, detail="New group not found")

        updated_member = await repo.update_member(person_id, update_data)
        if not updated_member:
            raise HTTPException(status_code=500, detail="Failed to update member")

        # Log profile update
        if update_data:
            await repo.add_audit_log(
                action="MEMBER_UPDATED",
                target_type="member",
                target_id=person_id,
                details=f"Fields updated: {', '.join(update_data.keys())}",
            )

        await repo.session.commit()
        await repo.session.refresh(updated_member)

        from services.live_stream_service import LiveStreamService

        LiveStreamService.invalidate_all(repo.organization_id)

        return updated_member

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating member {person_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/{person_id}", response_model=SuccessResponse)
async def remove_member(
    person_id: str, repo: AttendanceRepository = Depends(get_repository)
):
    """Remove (deactivate) an attendance member"""
    try:
        member = await repo.get_member(person_id)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        success = await repo.remove_member(person_id)
        if not success:
            raise HTTPException(status_code=404, detail="Member not found")

        await repo.add_audit_log(
            action="MEMBER_DELETED",
            target_type="member",
            target_id=person_id,
            details=f"Member '{member.name}' removed",
        )

        await repo.session.commit()

        # Synchronize face recognizer in-memory cache strictly after commit so the new session sees the deletion
        from core.lifespan import face_recognizer

        if face_recognizer:
            await face_recognizer.refresh_cache(repo.organization_id)

        return SuccessResponse(message=f"Member {person_id} removed successfully")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing member {person_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/bulk-delete", response_model=BulkMemberResponse)
async def remove_members_bulk(
    bulk_data: BulkMemberDeleteRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Remove multiple members in bulk using a single transaction"""
    try:
        bulk_results = await repo.remove_members_bulk(bulk_data.person_ids)

        success_count = 0
        error_count = 0
        errors = []

        for res in bulk_results:
            if res.get("success", False):
                success_count += 1
                await repo.add_audit_log(
                    action="MEMBER_DELETED",
                    target_type="member",
                    target_id=res["person_id"],
                    details="Bulk delete",
                )
            else:
                error_count += 1
                errors.append(
                    {
                        "person_id": res.get("person_id", "unknown"),
                        "error": res.get("error", "Failed to delete member"),
                    }
                )

        await repo.session.commit()

        if success_count > 0:
            from core.lifespan import face_recognizer

            if face_recognizer:
                await face_recognizer.refresh_cache(repo.organization_id)

        return BulkMemberResponse(
            success_count=success_count,
            error_count=error_count,
            errors=errors,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk member delete: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/group/{group_id}", response_model=List[AttendanceMemberResponse])
async def get_group_members(
    group_id: str, repo: AttendanceRepository = Depends(get_repository)
):
    """Get all members of a specific group"""
    try:
        # Check if group exists
        group = await repo.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        members = await repo.get_group_members(group_id)
        return members

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting group members for {group_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
