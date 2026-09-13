import logging
from typing import List, Optional
from fastapi import (
    APIRouter,
    HTTPException,
    Query,
    Depends,
    File,
    UploadFile,
    Form,
    Header,
)

from api.schemas import (
    AttendanceGroupCreate,
    AttendanceGroupUpdate,
    AttendanceGroupResponse,
    SuccessResponse,
)
from api.deps import get_repository
from database.repository import AttendanceRepository
from services.attendance_service import AttendanceService

logger = logging.getLogger(__name__)

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB

router = APIRouter(prefix="/groups", tags=["groups"])


@router.post("", response_model=AttendanceGroupResponse)
async def create_group(
    group_data: AttendanceGroupCreate,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Create a new attendance group"""
    try:
        if await repo.is_paired():
            raise HTTPException(
                status_code=403,
                detail="Groups are synced from Facenox Cloud. Use Facenox Cloud to manage groups.",
            )
        service = AttendanceService(repo)
        group_id = service.generate_id()

        db_group_data = {
            "id": group_id,
            "name": group_data.name,
            "settings": group_data.settings.model_dump() if group_data.settings else {},
        }

        created_group = await repo.create_group(db_group_data)
        await repo.session.commit()
        await repo.session.refresh(created_group)

        await repo.add_audit_log(
            action="GROUP_CREATED",
            target_type="group",
            target_id=group_id,
            details=f"Group '{group_data.name}' created",
        )

        return created_group

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating group: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/assign-org-id")
async def assign_organization_id(
    repo: AttendanceRepository = Depends(get_repository),
    x_facenox_organization: Optional[str] = Header(
        None, alias="X-Facenox-Organization"
    ),
):
    """Assign organization_id to all records with NULL org_id (called after pairing)."""
    if not x_facenox_organization:
        raise HTTPException(
            status_code=400, detail="X-Facenox-Organization header is required"
        )
    counts = await repo.assign_organization_id(x_facenox_organization)
    return counts


@router.get("", response_model=List[AttendanceGroupResponse])
async def get_groups(
    active_only: bool = Query(True, description="Return only active groups"),
    repo: AttendanceRepository = Depends(get_repository),
):
    """Get all attendance groups"""
    try:
        groups = await repo.get_groups(active_only=active_only)
        return groups

    except Exception as e:
        logger.error(f"Error getting groups: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{group_id}", response_model=AttendanceGroupResponse)
async def get_group(
    group_id: str, repo: AttendanceRepository = Depends(get_repository)
):
    """Get a specific attendance group"""
    try:
        group = await repo.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        return group

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting group {group_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.put("/{group_id}", response_model=AttendanceGroupResponse)
async def update_group(
    group_id: str,
    updates: AttendanceGroupUpdate,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Update an attendance group"""
    try:
        if await repo.is_paired():
            raise HTTPException(
                status_code=403,
                detail="Groups are synced from Facenox Cloud. Use Facenox Cloud to manage groups.",
            )
        existing_group = await repo.get_group(group_id)
        if not existing_group:
            raise HTTPException(status_code=404, detail="Group not found")

        update_data = {}
        for field, value in updates.model_dump(exclude_unset=True).items():
            if field == "settings" and value:
                if isinstance(value, dict):
                    update_data[field] = value
                else:
                    update_data[field] = value.model_dump()
            elif value is not None:
                update_data[field] = value

        if not update_data:
            return existing_group

        updated_group = await repo.update_group(group_id, update_data)
        if not updated_group:
            raise HTTPException(status_code=500, detail="Failed to update group")

        await repo.add_audit_log(
            action="GROUP_UPDATED",
            target_type="group",
            target_id=group_id,
            details=f"Fields updated: {', '.join(update_data.keys())}",
        )

        await repo.session.commit()
        await repo.session.refresh(updated_group)

        return updated_group

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating group {group_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/{group_id}", response_model=SuccessResponse)
async def delete_group(
    group_id: str, repo: AttendanceRepository = Depends(get_repository)
):
    """Delete (deactivate) an attendance group"""
    try:
        if await repo.is_paired():
            raise HTTPException(
                status_code=403,
                detail="Groups are synced from Facenox Cloud. Use Facenox Cloud to manage groups.",
            )
        success = await repo.delete_group(group_id)
        if not success:
            raise HTTPException(status_code=404, detail="Group not found")

        # Synchronize face recognizer in-memory cache immediately to prevent ghost recognitions
        from core.lifespan import face_recognizer

        if face_recognizer:
            await face_recognizer.refresh_cache(repo.organization_id)

        await repo.add_audit_log(
            action="GROUP_DELETED",
            target_type="group",
            target_id=group_id,
            details="Group deleted (soft delete)",
        )

        await repo.session.commit()

        return SuccessResponse(message=f"Group {group_id} deleted successfully")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting group {group_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{group_id}/persons", response_model=List[dict])
async def get_group_persons(
    group_id: str, repo: AttendanceRepository = Depends(get_repository)
):
    """Get all enrolled persons for a specific group"""
    try:
        from core.lifespan import face_recognizer

        group = await repo.get_group(group_id)
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        import asyncio

        # Parallelize relationship fetching and face data indexing
        members_task = repo.get_group_members(group_id)

        if face_recognizer:
            all_persons_task = face_recognizer.get_all_persons(repo.organization_id)
            members, all_persons = await asyncio.gather(members_task, all_persons_task)
        else:
            members = await members_task
            all_persons = []

        if not face_recognizer:
            return [
                {
                    "person_id": member.person_id,
                    "group_id": member.group_id,
                    "name": member.name,
                    "role": member.role,
                    "email": member.email,
                    "joined_at": member.joined_at,
                    "is_active": member.is_active,
                    "has_consent": member.has_consent,
                    "has_face_data": False,
                }
                for member in members
            ]

        persons_with_face_data = []

        for member in members:
            has_face_data = member.person_id in all_persons
            persons_with_face_data.append(
                {
                    "person_id": member.person_id,
                    "group_id": member.group_id,
                    "name": member.name,
                    "role": member.role,
                    "email": member.email,
                    "has_face_data": has_face_data,
                    "joined_at": member.joined_at,
                    "is_active": member.is_active,
                    "has_consent": member.has_consent,
                }
            )

        return persons_with_face_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting group persons: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{group_id}/persons/{person_id}/enroll-face")
async def enroll_member_for_group_person(
    group_id: str,
    person_id: str,
    image: UploadFile = File(...),
    metadata: str = Form(...),
    repo: AttendanceRepository = Depends(get_repository),
):
    """Enroll member for recognition in a group with anti-duplicate protection.
    Supports multipart/form-data for consistent, high-performance binary transfer.
    """
    try:
        from core.lifespan import face_recognizer
        import json
        import numpy as np
        import cv2

        # Decode metadata
        try:
            meta = json.loads(metadata)
            bbox = meta.get("bbox")
            landmarks_5 = meta.get("landmarks_5")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid metadata format: {e}")

        if not bbox or not landmarks_5:
            raise HTTPException(
                status_code=400,
                detail="Missing required face metadata (bbox or landmarks)",
            )

        # Read and decode image binary
        contents = await image.read()
        if len(contents) > MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"Image too large ({len(contents)} bytes). Max {MAX_IMAGE_SIZE} bytes.",
            )
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(
                status_code=400, detail="Failed to decode enrollment image"
            )

        service = AttendanceService(repo, face_recognizer=face_recognizer)
        try:
            return await service.enroll_member(
                group_id, person_id, img, bbox, landmarks_5
            )
        except PermissionError as e:
            raise HTTPException(status_code=403, detail=str(e))
        except ValueError as e:
            if "not found" in str(e).lower():
                raise HTTPException(status_code=404, detail=str(e))
            else:
                raise HTTPException(status_code=400, detail=str(e))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enrolling face for group person: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/{group_id}/persons/{person_id}/face-data")
async def remove_face_data_for_group_person(
    group_id: str,
    person_id: str,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Remove face data for a specific person in a group"""
    try:
        from core.lifespan import face_recognizer

        service = AttendanceService(repo, face_recognizer=face_recognizer)
        try:
            return await service.remove_face_data(group_id, person_id)
        except ValueError as e:
            if "not found" in str(e).lower():
                raise HTTPException(status_code=404, detail=str(e))
            else:
                raise HTTPException(status_code=400, detail=str(e))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing face data: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{group_id}/bulk-detect-faces")
async def bulk_detect_faces(
    group_id: str,
    images: List[UploadFile] = File(...),
    repo: AttendanceRepository = Depends(get_repository),
):
    """Detect faces in multiple uploaded images (Multipart)"""
    try:
        from core.lifespan import face_detector

        if not images:
            raise HTTPException(status_code=400, detail="No images provided")

        service = AttendanceService(repo, face_detector=face_detector)
        return await service.bulk_detect_faces_in_files(group_id, images)

    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        else:
            raise HTTPException(status_code=400, detail=str(e))


@router.post("/{group_id}/bulk-enroll-faces")
async def bulk_enroll_members(
    group_id: str,
    metadata: str = Form(...),
    images: List[UploadFile] = File(...),
    repo: AttendanceRepository = Depends(get_repository),
):
    """Enroll multiple faces in bulk (Multipart)"""
    try:
        from core.lifespan import face_recognizer
        import json

        try:
            regs = json.loads(metadata)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid metadata format: {e}")

        if not regs or not images:
            raise HTTPException(status_code=400, detail="Missing enrollments or images")

        service = AttendanceService(repo, face_recognizer=face_recognizer)
        return await service.bulk_enroll_with_files(group_id, regs, images)

    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        else:
            raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in bulk face enrollment: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
