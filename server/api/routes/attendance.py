import base64
import logging
from typing import List, Optional

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
    Face,
    AttendanceGroup,
    AttendanceGroupRule,
    AttendanceMember,
    AttendanceRecord,
    AttendanceSession,
)
from database.repository import AttendanceRepository, FaceRepository
from time_utils import to_storage_local
from core.cipher import encrypt_local_data, decrypt_local_data
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
        # Capture before reading any table so edits made during export are retried.
        export_boundary = get_time_authority().current_time_local()
        since_dt = None
        since_utc = None
        if since:
            try:
                from datetime import datetime, timezone, timedelta

                cursor_time = datetime.fromisoformat(since.replace("Z", "+00:00"))
                if cursor_time.tzinfo is None:
                    raise ValueError("Sync cursor requires an explicit offset.")
                since_dt = to_storage_local(cursor_time)
                # SQLite CURRENT_TIMESTAMP has second precision. Overlap one
                # second so writes later in the boundary second aren't skipped.
                since_utc = cursor_time.astimezone(timezone.utc).replace(
                    tzinfo=None
                ) - timedelta(seconds=1)
            except ValueError:
                pass

        # Select all groups (even soft-deleted) to propagate deletions
        # Groups and members metadata are always exported in full to maintain directory consistency
        groups_query = select(AttendanceGroup)
        groups_query = repo._apply_org_scope(groups_query, AttendanceGroup)
        groups_result = await repo.session.execute(groups_query)
        groups_orm = groups_result.scalars().all()

        settings_orm = await repo.get_settings()

        # Include ALL members (even soft-deleted)
        members_query = select(AttendanceMember).options(
            selectinload(AttendanceMember.group)
        )
        members_query = repo._apply_org_scope(members_query, AttendanceMember)
        members_result = await repo.session.execute(members_query)
        members_orm = members_result.scalars().all()

        group_rules_query = select(AttendanceGroupRule)
        group_rules_query = repo._apply_org_scope(
            group_rules_query, AttendanceGroupRule
        )
        group_rules_result = await repo.session.execute(
            group_rules_query.order_by(
                AttendanceGroupRule.group_id, AttendanceGroupRule.effective_from
            )
        )
        group_rules_orm = group_rules_result.scalars().all()

        records_query = select(AttendanceRecord)
        records_query = repo._apply_org_scope(records_query, AttendanceRecord)
        if since_dt:
            from sqlalchemy import or_, and_

            records_query = records_query.where(
                or_(
                    AttendanceRecord.modified_at_utc >= since_utc,
                    and_(
                        AttendanceRecord.modified_at_utc.is_(None),
                        AttendanceRecord.last_modified_at >= since_dt,
                    ),
                )
            )
        records_result = await repo.session.execute(
            records_query.order_by(AttendanceRecord.timestamp.desc())
        )
        records_orm = records_result.scalars().all()

        sessions_query = select(AttendanceSession)
        sessions_query = repo._apply_org_scope(sessions_query, AttendanceSession)
        if since_dt:
            sessions_query = sessions_query.where(
                or_(
                    AttendanceSession.modified_at_utc >= since_utc,
                    and_(
                        AttendanceSession.modified_at_utc.is_(None),
                        AttendanceSession.last_modified_at >= since_dt,
                    ),
                )
            )
        sessions_result = await repo.session.execute(
            sessions_query.order_by(AttendanceSession.date.desc())
        )
        sessions_orm = sessions_result.scalars().all()

        serialized_groups = []
        for g in groups_orm:
            group_resp = AttendanceGroupResponse.model_validate(g, from_attributes=True)
            if g.is_deleted:
                group_resp.is_active = False
            serialized_groups.append(group_resp)

        serialized_members = []
        for m in members_orm:
            member_resp = AttendanceMemberResponse.model_validate(
                m, from_attributes=True
            )
            if m.is_deleted:
                member_resp.is_active = False
            serialized_members.append(member_resp)

        return ExportDataResponse(
            groups=serialized_groups,
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
            exported_at=export_boundary,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")


face_detector = None
face_recognizer = None


@router.post("/export-embeddings")
async def export_embeddings(repo: AttendanceRepository = Depends(get_repository)):
    query = repo._apply_org_scope(select(Face), Face)
    result = []
    for face in (await repo.session.execute(query)).scalars():
        if not face.sync_dirty:
            continue
        result.append(
            {
                "person_id": face.person_id,
                "embedding_bytes": ""
                if face.is_deleted
                else base64.b64encode(decrypt_local_data(face.embedding)).decode(
                    "ascii"
                ),
                "embedding_dimension": face.embedding_dimension,
                "is_deleted": face.is_deleted,
                "sync_revision": face.sync_revision,
                "version": face.version,
            }
        )
    return {"embeddings": result}


class ImportEmbeddingRequest(BaseModel):
    person_id: str
    embedding_bytes: str = ""
    embedding_dimension: int = 512
    is_deleted: bool = False
    sync_revision: int = 0
    acknowledged_version: Optional[int] = None
    accepted_revision: Optional[int] = None


class ImportEmbeddingsBatchRequest(BaseModel):
    embeddings: List[ImportEmbeddingRequest]


async def _import_embedding(
    item: ImportEmbeddingRequest, repo: AttendanceRepository
) -> bool:
    member = await repo.get_member(item.person_id)
    group = await repo.get_group(member.group_id) if member else None
    faces = FaceRepository(repo.session, repo.organization_id)
    query = repo._apply_org_scope(
        select(Face).where(Face.person_id == item.person_id), Face
    )
    face = (await repo.session.execute(query)).scalar_one_or_none()
    active = bool(member and member.is_active and group and group.is_active)
    if not active and not item.is_deleted:
        return False
    if (
        face
        and face.sync_dirty
        and face.version != item.acknowledged_version
        and active
    ):
        if item.accepted_revision == item.sync_revision:
            face.sync_revision = item.sync_revision
        return False  # Keep a local enrollment/removal that hasn't been acknowledged.
    if face and item.sync_revision < face.sync_revision:
        return False
    if item.is_deleted:
        raw = b""
    else:
        raw = base64.b64decode(item.embedding_bytes, validate=True)
        if len(raw) != item.embedding_dimension * 4 or item.embedding_dimension != 512:
            raise ValueError("Invalid face template dimensions")
    await faces.upsert_face(
        item.person_id,
        encrypt_local_data(raw) if raw else b"",
        item.embedding_dimension,
    )
    face = (await repo.session.execute(query)).scalar_one()
    face.is_deleted = item.is_deleted
    face.sync_revision = item.sync_revision
    face.sync_dirty = False
    return True


@router.post("/import-embedding")
async def import_embedding(
    request: ImportEmbeddingRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    result = await import_embeddings_batch(
        ImportEmbeddingsBatchRequest(embeddings=[request]), repo
    )
    return {"success": result["imported_count"] == 1}


@router.post("/import-embeddings-batch")
async def import_embeddings_batch(
    request: ImportEmbeddingsBatchRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    from core.lifespan import face_recognizer

    repo.session.info["sync_import"] = True
    try:
        imported = 0
        for item in request.embeddings:
            imported += int(await _import_embedding(item, repo))
        await repo.session.commit()
        if face_recognizer:
            await face_recognizer.refresh_cache(repo.organization_id)
        return {
            "success": True,
            "imported_count": imported,
            "failed_count": len(request.embeddings) - imported,
            "total": len(request.embeddings),
        }
    except Exception:
        await repo.session.rollback()
        raise
    finally:
        repo.session.info.pop("sync_import", None)
