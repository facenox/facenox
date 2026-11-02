"""Backup export/import routes for attendance data and face embeddings."""

import base64
import logging
from typing import List, Optional

import numpy as np
import ulid
from fastapi import APIRouter, Body, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.deps import get_repository
from database.repository import AttendanceRepository
from database.models import (
    AttendanceGroup as GroupModel,
    AttendanceGroupRule as GroupRuleModel,
    AttendanceMember as MemberModel,
    AttendanceRecord as RecordModel,
    AttendanceSession as SessionModel,
    AttendanceSessionDeletion as SessionDeletionModel,
    Face as FaceModel,
)
from api.schemas import (
    AttendanceGroupResponse,
    AttendanceGroupRuleResponse,
    AttendanceMemberResponse,
    AttendanceRecordResponse,
    AttendanceSessionResponse,
    AttendanceSessionDeletionResponse,
    AttendanceSettingsResponse,
    ExportDataResponse,
    ImportDataRequest,
    SuccessResponse,
)
from core.cipher import decrypt_local_data, encrypt_local_data
from services.time_authority_service import get_time_authority
from time_utils import to_storage_local
from attendance_time import restore_fields

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backup", tags=["backup"])


# Schemas


class BiometricEntry(BaseModel):
    person_id: str
    embedding_b64: str  # base64-encoded raw float32 bytes
    embedding_dim: int


class BackupGroup(AttendanceGroupResponse):
    is_deleted: bool = False


class BackupGroupRule(AttendanceGroupRuleResponse):
    is_deleted: bool = False


class BackupMember(AttendanceMemberResponse):
    is_deleted: bool = False


class BackupAttendanceData(ExportDataResponse):
    groups: List[BackupGroup]
    group_rules: List[BackupGroupRule] = []
    members: List[BackupMember]


class BackupAttendanceImport(ImportDataRequest):
    data: BackupAttendanceData


class BackupExportResponse(BaseModel):
    version: int = 1
    exported_at: str
    attendance: BackupAttendanceData
    biometrics: List[BiometricEntry]


class BackupImportRequest(BaseModel):
    version: int = 1
    exported_at: Optional[str] = None
    attendance: BackupAttendanceImport
    biometrics: List[BiometricEntry]
    password: Optional[str] = None  # Added password for decryption


def _scope_query(query, model, organization_id: Optional[str]):
    if organization_id is None:
        return query.where(model.organization_id.is_(None))
    return query.where(model.organization_id == organization_id)


async def _export_biometrics(repo: AttendanceRepository) -> List[BiometricEntry]:
    query = _scope_query(
        select(FaceModel).where(FaceModel.is_deleted.is_(False)),
        FaceModel,
        repo.organization_id,
    )
    faces = (await repo.session.execute(query)).scalars().all()
    biometrics: List[BiometricEntry] = []

    for face in faces:
        raw_bytes = decrypt_local_data(face.embedding)
        expected_size = face.embedding_dimension * np.dtype(np.float32).itemsize
        if face.embedding_dimension <= 0 or len(raw_bytes) != expected_size:
            raise ValueError("Stored biometric data has an invalid dimension")
        biometrics.append(
            BiometricEntry(
                person_id=face.person_id,
                embedding_b64=base64.b64encode(raw_bytes).decode("ascii"),
                embedding_dim=face.embedding_dimension,
            )
        )

    return biometrics


# Routes


@router.post("/export")
async def export_backup(
    password: Optional[str] = Body(None),
    repo: AttendanceRepository = Depends(get_repository),
):
    """
    Export complete system state: attendance data + face embeddings.
    If a password is provided, returns an encrypted .facenox blob payload.
    If not, returns the complete unencrypted JSON payload (typically encrypted by Electron before saving).
    """
    export_succeeded = False
    try:
        # Gather attendance data
        groups_orm = (
            (
                await repo.session.execute(
                    _scope_query(select(GroupModel), GroupModel, repo.organization_id)
                )
            )
            .scalars()
            .all()
        )
        settings_orm = await repo.get_settings()

        members_query = _scope_query(
            select(MemberModel),
            MemberModel,
            repo.organization_id,
        )
        members_result = await repo.session.execute(members_query)
        members_orm = members_result.scalars().all()

        group_rules_query = _scope_query(
            select(GroupRuleModel), GroupRuleModel, repo.organization_id
        )
        group_rules_result = await repo.session.execute(
            group_rules_query.order_by(
                GroupRuleModel.group_id, GroupRuleModel.effective_from
            )
        )
        group_rules_orm = group_rules_result.scalars().all()

        records_query = _scope_query(
            select(RecordModel), RecordModel, repo.organization_id
        )
        records_result = await repo.session.execute(
            records_query.order_by(RecordModel.timestamp.desc())
        )
        records_orm = records_result.scalars().all()

        sessions_query = _scope_query(
            select(SessionModel).options(selectinload(SessionModel.applied_rule)),
            SessionModel,
            repo.organization_id,
        )
        sessions_result = await repo.session.execute(
            sessions_query.order_by(SessionModel.date.desc())
        )
        sessions_orm = sessions_result.scalars().all()
        deletions_orm = (await repo.session.execute(_scope_query(
            select(SessionDeletionModel), SessionDeletionModel, repo.organization_id,
        ))).scalars().all()

        attendance_data = BackupAttendanceData(
            groups=[
                BackupGroup.model_validate(g, from_attributes=True) for g in groups_orm
            ],
            group_rules=[
                BackupGroupRule.model_validate(r, from_attributes=True)
                for r in group_rules_orm
            ],
            members=[
                BackupMember.model_validate(m, from_attributes=True)
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
            deleted_sessions=[
                AttendanceSessionDeletionResponse.model_validate(row, from_attributes=True)
                for row in deletions_orm
            ],
            settings=AttendanceSettingsResponse.model_validate(
                settings_orm, from_attributes=True
            ),
            exported_at=get_time_authority().current_time_local(),
        )

        biometrics = await _export_biometrics(repo)

        response_obj = BackupExportResponse(
            version=1,
            exported_at=get_time_authority().current_time_utc().isoformat(),
            attendance=attendance_data,
            biometrics=biometrics,
        )

        if password:
            from core.cipher import encrypt_backup

            plaintext = response_obj.model_dump_json().encode("utf-8")
            encrypted_blob = encrypt_backup(plaintext, password)
            export_succeeded = True
            return {
                "success": True,
                "encrypted": True,
                "blob": base64.b64encode(encrypted_blob).decode("ascii"),
                "filename": f"facenox_backup_{attendance_data.exported_at.strftime('%Y%m%d_%H%M')}.facenox",
            }

        export_succeeded = True
        return response_obj

    except Exception as e:
        logger.error(f"[Backup] Export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Backup export failed: {e}")

    finally:
        try:
            await repo.add_audit_log(
                action=(
                    "BACKUP_EXPORTED" if export_succeeded else "BACKUP_EXPORT_FAILED"
                ),
                target_type="backup",
                details=f"Backup exported at {get_time_authority().current_time_utc().strftime('%b %d, %Y %I:%M %p')} UTC",
            )
            await repo.session.commit()
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
    import_succeeded = False
    try:
        data = payload.attendance.data
        overwrite = payload.attendance.overwrite_existing

        imported_groups = imported_members = imported_records = imported_sessions = (
            skipped
        ) = 0

        for group in data.groups:
            existing = (
                (
                    await repo.session.execute(
                        _scope_query(
                            select(GroupModel).where(GroupModel.id == group.id),
                            GroupModel,
                            repo.organization_id,
                        )
                    )
                )
                .scalars()
                .first()
            )

            if existing and not overwrite:
                skipped += 1
                continue

            if not existing:
                settings_dict = group.settings.model_dump() if group.settings else {}
                repo.session.add(
                    GroupModel(
                        id=group.id,
                        name=group.name,
                        created_at=to_storage_local(group.created_at),
                        late_threshold_minutes=settings_dict.get(
                            "late_threshold_minutes"
                        ),
                        late_threshold_enabled=settings_dict.get(
                            "late_threshold_enabled", False
                        ),
                        class_start_time=settings_dict.get("class_start_time", "08:00"),
                        class_end_time=settings_dict.get("class_end_time"),
                        attendance_mode=settings_dict.get(
                            "attendance_mode",
                            (
                                "work_hours"
                                if settings_dict.get("track_checkout")
                                else "attendance"
                            ),
                        ),
                        track_checkout=settings_dict.get("track_checkout", False),
                        min_checkout_delay_minutes=settings_dict.get(
                            "min_checkout_delay_minutes", 15
                        ),
                        scan_behavior=settings_dict.get("scan_behavior", "automatic"),
                        organization_id=repo.organization_id,
                        is_active=group.is_active,
                        is_deleted=group.is_deleted,
                    )
                )
            else:
                existing.name = group.name
                existing.created_at = to_storage_local(group.created_at)
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
                    existing.class_end_time = settings_dict.get("class_end_time")
                    existing.attendance_mode = settings_dict.get(
                        "attendance_mode", existing.attendance_mode
                    )
                    existing.track_checkout = settings_dict.get(
                        "track_checkout", existing.track_checkout
                    )
                    existing.min_checkout_delay_minutes = settings_dict.get(
                        "min_checkout_delay_minutes", 15
                    )
                    existing.scan_behavior = settings_dict.get(
                        "scan_behavior", existing.scan_behavior
                    )
                existing.is_active = group.is_active
                existing.is_deleted = group.is_deleted
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
                    class_end_time=rule.class_end_time,
                    attendance_mode=rule.attendance_mode,
                    track_checkout=rule.track_checkout,
                    min_checkout_delay_minutes=rule.min_checkout_delay_minutes,
                    scan_behavior=rule.scan_behavior,
                    organization_id=repo.organization_id,
                    is_deleted=rule.is_deleted,
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
                        joined_at=to_storage_local(member.joined_at),
                        is_active=member.is_active,
                        is_deleted=member.is_deleted,
                        organization_id=repo.organization_id,
                    )
                )
            else:
                existing.name = member.name
                existing.group_id = member.group_id
                existing.joined_at = to_storage_local(member.joined_at)
                existing.role = member.role
                existing.email = member.email
                existing.is_active = member.is_active
                existing.is_deleted = member.is_deleted
            imported_members += 1

        await repo.session.flush()
        restored_members = {
            member.person_id: member
            for member in (
                await repo.session.execute(
                    _scope_query(select(MemberModel), MemberModel, repo.organization_id)
                )
            )
            .scalars()
            .all()
        }

        for record in data.records:
            existing_result = await repo.session.execute(
                select(RecordModel).where(RecordModel.id == record.id)
            )
            if existing_result.scalars().first() and not overwrite:
                skipped += 1
                continue

            member = restored_members.get(record.person_id)

            await repo.session.merge(
                RecordModel(
                    id=record.id,
                    person_id=record.person_id,
                    member_id=member.id if member else None,
                    group_id=record.group_id,
                    **restore_fields(record, "timestamp"),
                    confidence=record.confidence,
                    location=record.location,
                    device_id=getattr(record, "device_id", None),
                    event_type=getattr(record, "event_type", None),
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

        for deleted in data.deleted_sessions:
            existing = await repo.session.get(SessionModel, deleted.id)
            if existing and existing.organization_id == repo.organization_id:
                await repo.retire_session(existing)
            elif not await repo.session.get(SessionDeletionModel, deleted.id):
                repo.session.add(SessionDeletionModel(
                    id=deleted.id, organization_id=repo.organization_id,
                    person_id=deleted.person_id, group_id=deleted.group_id, date=deleted.date,
                ))
        await repo.session.flush()

        for session in data.sessions:
            # Recovery remains possible, but a retired Cloud ID is immutable.
            restored_session_id = session.id
            if await repo.session.get(SessionDeletionModel, session.id):
                current = await repo.get_session(
                    session.person_id, session.date, visit_number=session.visit_number,
                )
                restored_session_id = current.id if current else ulid.ulid()
            existing_session = await repo.session.get(SessionModel, restored_session_id)
            if existing_session and not overwrite:
                skipped += 1
                continue
            member = restored_members.get(session.person_id)

            await repo.session.merge(
                SessionModel(
                    id=restored_session_id,
                    person_id=session.person_id,
                    member_id=member.id if member else None,
                    group_id=session.group_id,
                    applied_rule_id=session.applied_rule_id,
                    date=session.date,
                    visit_number=session.visit_number,
                    **restore_fields(session, "check_in_time"),
                    **restore_fields(session, "check_out_time"),
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
            # Security check: skip redacted biometrics
            if not member or "[REDACTED" in entry.embedding_b64:
                skipped += 1
                continue

            existing_face_result = await repo.session.execute(
                select(FaceModel).where(
                    FaceModel.person_id == entry.person_id,
                    FaceModel.organization_id == repo.organization_id,
                )
            )
            existing_face = existing_face_result.scalars().first()
            if existing_face and not overwrite:
                skipped += 1
                continue
            raw_bytes = base64.b64decode(entry.embedding_b64, validate=True)
            expected_size = entry.embedding_dim * np.dtype(np.float32).itemsize
            if entry.embedding_dim <= 0 or len(raw_bytes) != expected_size:
                raise ValueError("Backup biometric data has an invalid dimension")
            encrypted_bytes = encrypt_local_data(raw_bytes)
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
        import_succeeded = True

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
            if not import_succeeded:
                await repo.session.rollback()
            await repo.add_audit_log(
                action=(
                    "BACKUP_IMPORTED" if import_succeeded else "BACKUP_IMPORT_FAILED"
                ),
                target_type="backup",
                details=(
                    f"Backup imported at {get_time_authority().current_time_utc().strftime('%b %d, %Y %I:%M %p')} UTC"
                    + (
                        ", existing records overwritten"
                        if payload.attendance.overwrite_existing
                        else ", existing records kept"
                    )
                ),
            )
            await repo.session.commit()
        except Exception as audit_err:
            logger.warning(
                f"[Backup] Failed to write audit log for import: {audit_err}"
            )


@router.post("/import-encrypted", response_model=SuccessResponse)
async def import_encrypted_backup(
    password: str = Body(...),
    blob_b64: str = Body(...),
    repo: AttendanceRepository = Depends(get_repository),
):
    """Decrypt and import a .facenox backup file."""
    try:
        import json
        from core.cipher import decrypt_backup

        blob = base64.b64decode(blob_b64)
        plaintext = decrypt_backup(blob, password)
        payload_dict = json.loads(plaintext.decode("utf-8"))

        payload = BackupImportRequest.model_validate(payload_dict)
        return await import_backup(payload, repo)

    except Exception as e:
        logger.error(f"[Backup] Encrypted import failed: {e}")
        raise HTTPException(status_code=400, detail=f"Decryption failed: {e}")
