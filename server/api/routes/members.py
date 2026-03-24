import logging
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select

import core.lifespan
from api.schemas import (
    AttendanceMemberCreate,
    AttendanceMemberUpdate,
    AttendanceMemberResponse,
    BulkMemberCreate,
    BulkMemberResponse,
    SuccessResponse,
)
from api.deps import get_repository
from database.models import Face
from database.repository import AttendanceRepository
from services.attendance_service import AttendanceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/members", tags=["members"])


@router.get("", response_model=List[AttendanceMemberResponse])
async def get_members(repo: AttendanceRepository = Depends(get_repository)):
    """Get all attendance members"""
    try:
        members = await repo.get_members()
        return members
    except Exception as e:
        logger.error(f"Error getting members: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=AttendanceMemberResponse)
async def add_member(
    member_data: AttendanceMemberCreate,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Add a new attendance member with auto-generated person_id if not provided"""
    try:
        # Check if group exists
        group = await repo.get_group(member_data.group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        # Prepare member data
        db_member_data = member_data.model_dump()

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
            details=f"Member '{added_member.name}' added to group {added_member.group_id}",
        )

        return added_member

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
    """Add multiple members in bulk"""
    try:
        success_count = 0
        error_count = 0
        errors = []

        for member_data in bulk_data.members:
            try:
                # Check if group exists
                group = await repo.get_group(member_data.group_id)
                if not group:
                    errors.append(
                        {
                            "person_id": member_data.person_id,
                            "error": f"Group {member_data.group_id} not found",
                        }
                    )
                    error_count += 1
                    continue

                # Add member
                db_member_data = member_data.model_dump()
                member = await repo.add_member(db_member_data)

                if member:
                    success_count += 1
                    await repo.add_audit_log(
                        action="MEMBER_CREATED",
                        target_type="member",
                        target_id=member.person_id,
                        details=f"Bulk add: Member '{member.name}' added to group {member.group_id}",
                    )
                else:
                    errors.append(
                        {
                            "person_id": member_data.person_id,
                            "error": "Failed to add member to database",
                        }
                    )
                    error_count += 1

            except Exception as e:
                errors.append({"person_id": member_data.person_id, "error": str(e)})
                error_count += 1

        return BulkMemberResponse(
            success_count=success_count, error_count=error_count, errors=errors
        )

    except Exception as e:
        logger.error(f"Error in bulk member add: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{person_id}", response_model=AttendanceMemberResponse)
async def get_member(
    person_id: str, repo: AttendanceRepository = Depends(get_repository)
):
    """Get a specific attendance member"""
    try:
        member = await repo.get_member(person_id)
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        return member

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

        # Audit consent changes
        new_consent = update_data.get("has_consent")
        if new_consent is True and not existing_member.has_consent:
            await repo.add_audit_log(
                action="CONSENT_GRANTED",
                target_type="member",
                target_id=person_id,
                details=f"granted_by={update_data.get('consent_granted_by', 'admin')}",
            )
        elif new_consent is False and existing_member.has_consent:
            await repo.add_audit_log(
                action="CONSENT_REVOKED",
                target_type="member",
                target_id=person_id,
            )
            # DPA/GDPR: revoked consent means the biometric must be erased
            face_query = select(Face).where(Face.person_id == person_id)
            if repo.organization_id:
                face_query = face_query.where(
                    Face.organization_id == repo.organization_id
                )
            face_result = await repo.session.execute(face_query)
            face = face_result.scalars().first()
            if face:
                try:
                    if core.lifespan.face_recognizer:
                        await core.lifespan.face_recognizer.remove_person(
                            person_id, repo.organization_id
                        )
                    else:
                        await repo.session.delete(face)
                        await repo.session.commit()
                    logger.info(
                        f"Biometric data erased for {person_id} after consent revocation"
                    )
                except Exception as bio_err:
                    logger.error(
                        f"Failed to erase biometric for {person_id}: {bio_err}"
                    )

        # Log profile update (if anything other than consent was changed)
        non_audit_fields = [
            f
            for f in update_data.keys()
            if f not in ["has_consent", "consent_granted_by"]
        ]
        if non_audit_fields:
            await repo.add_audit_log(
                action="MEMBER_UPDATED",
                target_type="member",
                target_id=person_id,
                details=f"Fields updated: {', '.join(non_audit_fields)}",
            )

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
        success = await repo.remove_member(person_id)
        if not success:
            raise HTTPException(status_code=404, detail="Member not found")

        await repo.add_audit_log(
            action="MEMBER_DELETED",
            target_type="member",
            target_id=person_id,
        )

        return SuccessResponse(message=f"Member {person_id} removed successfully")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing member {person_id}: {e}")
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
