import base64
import logging
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

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
    AttendanceGroup,
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attendance")


router.include_router(groups.router)
router.include_router(members.router)
router.include_router(records.router)
router.include_router(stats.router)
router.include_router(config.router)
router.include_router(maintenance.router)


@router.post("/export", response_model=ExportDataResponse)
async def export_attendance_data(
    since: Optional[str] = None,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Export attendance-related data without biometric templates, supporting delta sync via the 'since' parameter."""
    try:
        since_dt = None
        if since:
            try:
                from datetime import datetime

                since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            except ValueError:
                pass

        # Select all groups (even soft-deleted) to propagate deletions
        # Groups and members metadata are always exported in full to maintain directory consistency
        groups_query = select(AttendanceGroup)
        if repo.organization_id:
            groups_query = groups_query.where(
                AttendanceGroup.organization_id == repo.organization_id
            )
        groups_result = await repo.session.execute(groups_query)
        groups_orm = groups_result.scalars().all()

        settings_orm = await repo.get_settings()

        # Include ALL members (even soft-deleted)
        members_query = select(AttendanceMember).options(
            selectinload(AttendanceMember.group)
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
        if since_dt:
            records_query = records_query.where(
                AttendanceRecord.last_modified_at > since_dt
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
        if since_dt:
            sessions_query = sessions_query.where(
                AttendanceSession.last_modified_at > since_dt
            )
        sessions_result = await repo.session.execute(
            sessions_query.order_by(AttendanceSession.date.desc())
        )
        sessions_orm = sessions_result.scalars().all()

        serialized_members = []
        for m in members_orm:
            member_resp = AttendanceMemberResponse.model_validate(
                m, from_attributes=True
            )
            if m.is_deleted:
                member_resp.is_active = False
            serialized_members.append(member_resp)

        return ExportDataResponse(
            groups=[
                AttendanceGroupResponse.model_validate(g, from_attributes=True)
                for g in groups_orm
            ],
            group_rules=[
                AttendanceGroupRuleResponse.model_validate(r, from_attributes=True)
                for r in group_rules_orm
            ],
            members=serialized_members,
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


@router.post("/export-embeddings")
async def export_embeddings(
    repo: AttendanceRepository = Depends(get_repository),
):
    """Export decrypted face embeddings for sync (raw float32 bytes, base64-encoded)."""
    from core.lifespan import face_recognizer

    if not face_recognizer:
        return {"embeddings": []}

    embeddings = await face_recognizer.export_embeddings(repo.organization_id)

    result = []
    for person_id, embedding in embeddings.items():
        raw_bytes = embedding.astype(np.float32).tobytes()
        result.append(
            {
                "person_id": person_id,
                "embedding_bytes": base64.b64encode(raw_bytes).decode("ascii"),
                "embedding_dimension": len(embedding),
            }
        )
    return {"embeddings": result}


class ImportEmbeddingRequest(BaseModel):
    person_id: str
    embedding_bytes: str
    embedding_dimension: int = 512


@router.post("/import-embedding")
async def import_embedding(
    request: ImportEmbeddingRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Import a decrypted embedding into the local face recognizer."""
    from core.lifespan import face_recognizer

    if not face_recognizer:
        raise HTTPException(status_code=503, detail="Face recognizer not available")

    raw_bytes = base64.b64decode(request.embedding_bytes)
    embedding = np.frombuffer(raw_bytes, dtype=np.float32)

    if len(embedding) != request.embedding_dimension:
        raise HTTPException(
            status_code=400,
            detail=f"Expected {request.embedding_dimension}-dim embedding, got {len(embedding)}",
        )

    db_manager = face_recognizer._get_db_manager(repo.organization_id)
    if not db_manager:
        raise HTTPException(status_code=503, detail="Face database not available")

    success = await db_manager.add_person(
        person_id=request.person_id,
        embedding=embedding,
        image_hash=None,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to import embedding")

    await face_recognizer.refresh_cache(repo.organization_id)

    return {"success": True}


class ImportEmbeddingsBatchRequest(BaseModel):
    embeddings: List[ImportEmbeddingRequest]


@router.post("/import-embeddings-batch")
async def import_embeddings_batch(
    request: ImportEmbeddingsBatchRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """Import multiple decrypted face embeddings in a single atomic batch transaction."""
    from core.lifespan import face_recognizer

    if not face_recognizer:
        raise HTTPException(status_code=503, detail="Face recognizer not available")

    db_manager = face_recognizer._get_db_manager(repo.organization_id)
    if not db_manager:
        raise HTTPException(status_code=503, detail="Face database not available")

    success_count = 0
    failed_count = 0

    for item in request.embeddings:
        try:
            raw_bytes = base64.b64decode(item.embedding_bytes)
            embedding = np.frombuffer(raw_bytes, dtype=np.float32)

            if len(embedding) != item.embedding_dimension:
                failed_count += 1
                continue

            imported = await db_manager.add_person(
                person_id=item.person_id,
                embedding=embedding,
                image_hash=None,
            )
            if imported:
                success_count += 1
            else:
                failed_count += 1
        except Exception as err:
            logger.error(
                f"Failed to import embedding for person {item.person_id}: {err}"
            )
            failed_count += 1

    if success_count > 0:
        await face_recognizer.refresh_cache(repo.organization_id)

    return {
        "success": True,
        "imported_count": success_count,
        "failed_count": failed_count,
        "total": len(request.embeddings),
    }
