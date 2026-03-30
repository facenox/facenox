"""Backup export/import routes for attendance data and face embeddings."""

import base64
import logging
from typing import List, Optional

import numpy as np
import ulid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select

from api.deps import get_repository
from database.repository import AttendanceRepository
from database.models import (
    AttendanceGroup as GroupModel,
    AttendanceGroupRule as GroupRuleModel,
    AttendanceMember as MemberModel,
    AttendanceRecord as RecordModel,
    AttendanceSession as SessionModel,
    Face as FaceModel,
)
from api.schemas import (
    AttendanceGroupResponse,
    AttendanceGroupRuleResponse,
    AttendanceMemberResponse,
    AttendanceRecordResponse,
    AttendanceSessionResponse,
    AttendanceSettingsResponse,
    ExportDataResponse,
    ImportDataRequest,
    SuccessResponse,
)
from core.cipher import encrypt_local_data
from services.time_authority_service import get_time_authority
from time_utils import to_storage_local

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backup", tags=["backup"])


# Schemas


class BiometricEntry(BaseModel):
    person_id: str
    embedding_b64: str  # base64-encoded raw float32 bytes
    embedding_dim: int


class BackupExportResponse(BaseModel):
    version: int = 1
    exported_at: str
    attendance: ExportDataResponse
    biometrics: List[BiometricEntry]


class BackupImportRequest(BaseModel):
    version: int = 1
    exported_at: Optional[str] = None
    attendance: ImportDataRequest
    biometrics: List[BiometricEntry]


# Routes


@router.post("/export", response_model=BackupExportResponse)
async def export_backup(
    repo: AttendanceRepository = Depends(get_repository),
):
    """
    Export complete system state: attendance data + face embeddings.
    Returns plain JSON. Encryption is handled by the Electron layer.
    """
    try:
        # Gather attendance data
        groups_orm = await repo.get_groups(active_only=False)
        settings_orm = await repo.get_settings()

        members_query = select(MemberModel).where(MemberModel.is_deleted.is_(False))
        if repo.organization_id:
            members_query = members_query.where(
                MemberModel.organization_id == repo.organization_id
            )
        members_result = await repo.session.execute(members_query)
        members_orm = members_result.scalars().all()

        group_rules_query = select(GroupRuleModel)
        if repo.organization_id:
            group_rules_query = group_rules_query.where(
                GroupRuleModel.organization_id == repo.organization_id
            )
        group_rules_result = await repo.session.execute(
            group_rules_query.order_by(
                GroupRuleModel.group_id, GroupRuleModel.effective_from
            )
        )
        group_rules_orm = group_rules_result.scalars().all()

        records_query = select(RecordModel)
        if repo.organization_id:
            records_query = records_query.where(
                RecordModel.organization_id == repo.organization_id
            )
        records_result = await repo.session.execute(
            records_query.order_by(RecordModel.timestamp.desc())
        )
        records_orm = records_result.scalars().all()

        sessions_query = select(SessionModel)
        if repo.organization_id:
            sessions_query = sessions_query.where(
                SessionModel.organization_id == repo.organization_id
            )
        sessions_result = await repo.session.execute(
            sessions_query.order_by(SessionModel.date.desc())
        )
        sessions_orm = sessions_result.scalars().all()

        attendance_data = ExportDataResponse(
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

        # Gather face embeddings
        biometrics: List[BiometricEntry] = []
        try:
            from core.lifespan import face_recognizer

            if face_recognizer:
                persons: dict[str, np.ndarray] = (
                    await face_recognizer.export_embeddings(repo.organization_id)
                )
                for person_id, embedding in persons.items():
                    arr = embedding.astype(np.float32)
                    biometrics.append(
                        BiometricEntry(
                            person_id=person_id,
                            embedding_b64=base64.b64encode(arr.tobytes()).decode(
                                "ascii"
                            ),
                            embedding_dim=len(arr),
                        )
                    )
        except Exception as bio_err:
            logger.warning(
                f"[Backup] Could not export biometrics (non-fatal): {bio_err}"
            )

        return BackupExportResponse(
            version=1,
            exported_at=get_time_authority().current_time_utc().isoformat(),
            attendance=attendance_data,
            biometrics=biometrics,
        )

    except Exception as e:
        logger.error(f"[Backup] Export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Backup export failed: {e}")

    finally:
        # Audit log is written even if export partially succeeded
        try:
            await repo.add_audit_log(
                action="BACKUP_EXPORTED",
                target_type="backup",
                details=f"exported_at={get_time_authority().current_time_utc().isoformat()}",
            )
        except Exception as audit_err:
            logger.warning(
                f"[Backup] Failed to write audit log for export: {audit_err}"
            )


@router.post("/import", response_model=SuccessResponse)
async def import_backup(
    payload: BackupImportRequest,
    repo: AttendanceRepository = Depends(get_repository),
):
    """
    Import complete system state from a decrypted backup payload.
    Restores attendance data AND face embeddings so re-registration is not needed.
    """
    try:
        data = payload.attendance.data
        overwrite = payload.attendance.overwrite_existing

        imported_groups = imported_members = imported_records = imported_sessions = (
            skipped
        ) = 0

        for group in data.groups:
            existing = await repo.get_group(group.id)

            # If the group exists, isn't soft-deleted, and we're not overwriting, skip.
            if existing and not existing.is_deleted and not overwrite:
                skipped += 1
                continue

            if not existing:
                settings_dict = group.settings.model_dump() if group.settings else {}
                repo.session.add(
                    GroupModel(
                        id=group.id,
                        name=group.name,
                        late_threshold_minutes=settings_dict.get(
                            "late_threshold_minutes"
                        ),
                        late_threshold_enabled=settings_dict.get(
                            "late_threshold_enabled", False
                        ),
                        class_start_time=settings_dict.get("class_start_time", "08:00"),
                        track_checkout=settings_dict.get("track_checkout", False),
                        organization_id=repo.organization_id,
                        is_active=group.is_active,
                        is_deleted=False,
                    )
                )
            else:
                existing.name = group.name
                if group.settings:
                    settings_dict = group.settings.model_dump()
                    existing.late_threshold_minutes = settings_dict.get(
                        "late_threshold_minutes"
                    )
                    existing.late_threshold_enabled = settings_dict.get(
                        "late_threshold_enabled", False
                    )
                    existing.class_start_time = settings_dict.get(
                        "class_start_time", existing.class_start_time
                    )
                    existing.track_checkout = settings_dict.get(
                        "track_checkout", existing.track_checkout
                    )
                existing.is_active = group.is_active
                existing.is_deleted = False
            imported_groups += 1

        for rule in getattr(data, "group_rules", []):
            existing_rule_result = await repo.session.execute(
                select(GroupRuleModel).where(
                    GroupRuleModel.id == rule.id,
                    GroupRuleModel.organization_id == repo.organization_id,
                )
            )
            existing_rule = existing_rule_result.scalars().first()
            if existing_rule and not overwrite:
                continue

            await repo.session.merge(
                GroupRuleModel(
                    id=rule.id,
                    group_id=rule.group_id,
                    effective_from=to_storage_local(rule.effective_from),
                    late_threshold_minutes=rule.late_threshold_minutes,
                    late_threshold_enabled=rule.late_threshold_enabled,
                    class_start_time=rule.class_start_time,
                    track_checkout=rule.track_checkout,
                    organization_id=repo.organization_id,
                    is_deleted=False,
                )
            )

        for member in data.members:
            existing_result = await repo.session.execute(
                select(MemberModel).where(
                    MemberModel.person_id == member.person_id,
                    MemberModel.organization_id == repo.organization_id,
                )
            )
            existing = existing_result.scalars().first()
            if existing and not overwrite:
                skipped += 1
                continue

            if not existing:
                repo.session.add(
                    MemberModel(
                        id=ulid.ulid(),
                        person_id=member.person_id,
                        group_id=member.group_id,
                        name=member.name,
                        role=member.role,
                        email=member.email,
                        has_consent=member.has_consent,
                        consent_granted_at=(
                            to_storage_local(member.consent_granted_at)
                            if member.consent_granted_at
                            else None
                        ),
                        consent_granted_by=member.consent_granted_by,
                        is_active=member.is_active,
                        is_deleted=False,
                        organization_id=repo.organization_id,
                    )
                )
            else:
                existing.name = member.name
                existing.role = member.role
                existing.email = member.email
                existing.has_consent = member.has_consent
                existing.consent_granted_at = (
                    to_storage_local(member.consent_granted_at)
                    if member.consent_granted_at
                    else None
                )
                existing.consent_granted_by = member.consent_granted_by
                existing.is_active = member.is_active
                existing.is_deleted = False
            imported_members += 1

        for record in data.records:
            existing_result = await repo.session.execute(
                select(RecordModel).where(RecordModel.id == record.id)
            )
            if existing_result.scalars().first() and not overwrite:
                skipped += 1
                continue

            member = await repo.get_member(record.person_id)
            if not member:
                skipped += 1
                continue

            await repo.session.merge(
                RecordModel(
                    id=record.id,
                    person_id=record.person_id,
                    member_id=member.id,
                    group_id=record.group_id,
                    timestamp=to_storage_local(record.timestamp),
                    confidence=record.confidence,
                    location=record.location,
                    notes=record.notes,
                    is_manual=record.is_manual,
                    created_by=record.created_by,
                    is_voided=getattr(record, "is_voided", False),
                    voided_at=(
                        to_storage_local(record.voided_at)
                        if getattr(record, "voided_at", None)
                        else None
                    ),
                    voided_by=getattr(record, "voided_by", None),
                    void_reason=getattr(record, "void_reason", None),
                    organization_id=repo.organization_id,
                )
            )
            imported_records += 1

        for session in data.sessions:
            member = await repo.get_member(session.person_id)
            if not member:
                skipped += 1
                continue

            await repo.session.merge(
                SessionModel(
                    id=session.id,
                    person_id=session.person_id,
                    member_id=member.id,
                    group_id=session.group_id,
                    applied_rule_id=session.applied_rule_id,
                    date=session.date,
                    check_in_time=(
                        to_storage_local(session.check_in_time)
                        if session.check_in_time
                        else None
                    ),
                    check_out_time=(
                        to_storage_local(session.check_out_time)
                        if session.check_out_time
                        else None
                    ),
                    total_hours=session.total_hours,
                    status=session.status,
                    is_late=session.is_late,
                    late_minutes=session.late_minutes,
                    notes=session.notes,
                    organization_id=repo.organization_id,
                )
            )
            imported_sessions += 1

        imported_biometrics = 0
        for entry in payload.biometrics:
            member_result = await repo.session.execute(
                select(MemberModel).where(
                    MemberModel.person_id == entry.person_id,
                    MemberModel.is_deleted.is_(False),
                    MemberModel.organization_id == repo.organization_id,
                )
            )
            member = member_result.scalars().first()
            if not member or not member.has_consent:
                skipped += 1
                continue

            raw_bytes = base64.b64decode(entry.embedding_b64)
            # Encrypt before persisting, same as the normal registration path.
            encrypted_bytes = encrypt_local_data(raw_bytes)
            existing_face_result = await repo.session.execute(
                select(FaceModel).where(
                    FaceModel.person_id == entry.person_id,
                    FaceModel.organization_id == repo.organization_id,
                )
            )
            existing_face = existing_face_result.scalars().first()
            if existing_face:
                existing_face.embedding = encrypted_bytes
                existing_face.embedding_dimension = entry.embedding_dim
                existing_face.is_deleted = False
            else:
                repo.session.add(
                    FaceModel(
                        id=ulid.ulid(),
                        person_id=entry.person_id,
                        embedding=encrypted_bytes,
                        embedding_dimension=entry.embedding_dim,
                        organization_id=repo.organization_id,
                        is_deleted=False,
                    )
                )
            imported_biometrics += 1

        await repo.session.commit()

        from core.lifespan import face_recognizer

        if face_recognizer:
            await face_recognizer.refresh_cache(repo.organization_id)

        return SuccessResponse(
            message=(
                f"{imported_groups} groups, "
                f"{imported_members} members, {imported_records} records, "
                f"{imported_sessions} sessions, {imported_biometrics} biometric "
                f"profiles restored. {skipped} items skipped."
            )
        )

    except Exception as e:
        logger.error(f"[Backup] Import failed: {e}")
        raise HTTPException(status_code=500, detail=f"Backup import failed: {e}")

    finally:
        try:
            await repo.add_audit_log(
                action="BACKUP_IMPORTED",
                target_type="backup",
                details=(
                    f"overwrite={payload.attendance.overwrite_existing}, "
                    f"imported_at={get_time_authority().current_time_utc().isoformat()}"
                ),
            )
        except Exception as audit_err:
            logger.warning(
                f"[Backup] Failed to write audit log for import: {audit_err}"
            )
