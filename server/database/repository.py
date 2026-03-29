from typing import Optional, List, Any, Dict
from datetime import datetime, timedelta
from sqlalchemy import select, desc, func, update
from sqlalchemy.ext.asyncio import AsyncSession
import ulid

from database.models import (
    AttendanceGroup,
    AttendanceGroupRule,
    AttendanceMember,
    AttendanceRecord,
    AttendanceSession,
    AttendanceSettings,
    AuditLog,
    Face,
)
from time_utils import local_now, to_storage_local


class AttendanceRepository:
    """Repository pattern for Attendance database operations"""

    def __init__(self, session: AsyncSession, organization_id: Optional[str] = None):
        self.session = session
        self.organization_id = organization_id

    def _apply_org_scope(self, query, model):
        if self.organization_id:
            query = query.where(model.organization_id == self.organization_id)
        return query

    def _settings_payload(
        self, source: Optional[AttendanceSettings] = None
    ) -> Dict[str, Any]:
        if source is None:
            return {"organization_id": self.organization_id}

        return {
            "organization_id": self.organization_id,
            "late_threshold_minutes": source.late_threshold_minutes,
            "enable_location_tracking": source.enable_location_tracking,
            "confidence_threshold": source.confidence_threshold,
            "attendance_cooldown_seconds": source.attendance_cooldown_seconds,
            "relog_cooldown_seconds": source.relog_cooldown_seconds,
            "enable_liveness_detection": source.enable_liveness_detection,
            "max_recognition_faces_per_frame": source.max_recognition_faces_per_frame,
            "data_retention_days": source.data_retention_days,
        }

    def _group_rule_payload(
        self,
        group_id: str,
        settings: Dict[str, Any],
        effective_from: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        return {
            "id": ulid.ulid(),
            "group_id": group_id,
            "effective_from": effective_from or to_storage_local(local_now()),
            "late_threshold_minutes": settings.get("late_threshold_minutes"),
            "late_threshold_enabled": settings.get("late_threshold_enabled", False),
            "class_start_time": settings.get(
                "class_start_time", local_now().strftime("%H:%M")
            ),
            "track_checkout": settings.get("track_checkout", False),
            "organization_id": self.organization_id,
        }

    # Group Methods
    async def create_group(self, group_data: Dict[str, Any]) -> AttendanceGroup:
        settings = group_data.get("settings", {})
        group = AttendanceGroup(
            id=group_data["id"],
            name=group_data["name"],
            created_at=to_storage_local(local_now()),
            late_threshold_minutes=settings.get("late_threshold_minutes"),
            late_threshold_enabled=settings.get("late_threshold_enabled", False),
            class_start_time=settings.get(
                "class_start_time", local_now().strftime("%H:%M")
            ),
            track_checkout=settings.get("track_checkout", False),
            organization_id=self.organization_id,
            is_active=True,
            is_deleted=False,
        )
        self.session.add(group)
        await self.session.commit()
        await self.session.refresh(group)
        await self.add_group_rule(
            self._group_rule_payload(
                group.id,
                {
                    "late_threshold_minutes": group.late_threshold_minutes,
                    "late_threshold_enabled": group.late_threshold_enabled,
                    "class_start_time": group.class_start_time,
                    "track_checkout": group.track_checkout,
                },
                effective_from=to_storage_local(local_now()),
            )
        )
        return group

    async def get_groups(self, active_only: bool = True) -> List[AttendanceGroup]:
        query = select(AttendanceGroup).where(AttendanceGroup.is_deleted.is_(False))
        if self.organization_id:
            query = query.where(AttendanceGroup.organization_id == self.organization_id)

        query = query.order_by(AttendanceGroup.name)
        if active_only:
            query = query.where(AttendanceGroup.is_active)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_group(self, group_id: str) -> Optional[AttendanceGroup]:
        query = select(AttendanceGroup).where(
            AttendanceGroup.id == group_id, AttendanceGroup.is_deleted.is_(False)
        )
        query = self._apply_org_scope(query, AttendanceGroup)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def add_group_rule(self, rule_data: Dict[str, Any]) -> AttendanceGroupRule:
        rule = AttendanceGroupRule(**rule_data)
        self.session.add(rule)
        await self.session.commit()
        await self.session.refresh(rule)
        return rule

    async def get_group_rule(self, rule_id: str) -> Optional[AttendanceGroupRule]:
        query = select(AttendanceGroupRule).where(AttendanceGroupRule.id == rule_id)
        query = self._apply_org_scope(query, AttendanceGroupRule)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_group_rules(self, group_id: str) -> List[AttendanceGroupRule]:
        query = select(AttendanceGroupRule).where(
            AttendanceGroupRule.group_id == group_id
        )
        query = self._apply_org_scope(query, AttendanceGroupRule)
        query = query.order_by(
            AttendanceGroupRule.effective_from.asc(), AttendanceGroupRule.id.asc()
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_effective_group_rule(
        self, group_id: str, effective_at: datetime
    ) -> Optional[AttendanceGroupRule]:
        query = (
            select(AttendanceGroupRule)
            .where(
                AttendanceGroupRule.group_id == group_id,
                AttendanceGroupRule.effective_from <= effective_at,
            )
            .order_by(
                desc(AttendanceGroupRule.effective_from),
                desc(AttendanceGroupRule.id),
            )
        )
        query = self._apply_org_scope(query, AttendanceGroupRule)
        result = await self.session.execute(query)
        rule = result.scalars().first()
        if rule:
            return rule

        fallback_query = select(AttendanceGroupRule).where(
            AttendanceGroupRule.group_id == group_id
        )
        fallback_query = self._apply_org_scope(fallback_query, AttendanceGroupRule)
        fallback_query = fallback_query.order_by(
            AttendanceGroupRule.effective_from.asc(), AttendanceGroupRule.id.asc()
        )
        fallback_result = await self.session.execute(fallback_query)
        return fallback_result.scalars().first()

    async def update_group(
        self, group_id: str, updates: Dict[str, Any]
    ) -> Optional[AttendanceGroup]:
        group = await self.get_group(group_id)
        if not group:
            return None

        tracked_before = {
            "late_threshold_minutes": group.late_threshold_minutes,
            "late_threshold_enabled": group.late_threshold_enabled,
            "class_start_time": group.class_start_time,
            "track_checkout": group.track_checkout,
        }

        for key, value in updates.items():
            if key == "settings":
                if "late_threshold_minutes" in value:
                    group.late_threshold_minutes = value["late_threshold_minutes"]
                if "late_threshold_enabled" in value:
                    group.late_threshold_enabled = value["late_threshold_enabled"]
                if "class_start_time" in value:
                    group.class_start_time = value["class_start_time"]
                if "track_checkout" in value:
                    group.track_checkout = value["track_checkout"]
            elif hasattr(group, key):
                setattr(group, key, value)

        await self.session.commit()
        await self.session.refresh(group)

        tracked_after = {
            "late_threshold_minutes": group.late_threshold_minutes,
            "late_threshold_enabled": group.late_threshold_enabled,
            "class_start_time": group.class_start_time,
            "track_checkout": group.track_checkout,
        }
        if tracked_before != tracked_after:
            await self.add_group_rule(self._group_rule_payload(group.id, tracked_after))
        return group

    async def delete_group(self, group_id: str) -> bool:
        group = await self.get_group(group_id)
        if not group:
            return False
        group.is_active = False
        group.is_deleted = True

        # Soft delete members and hard delete their faces
        members_query = select(AttendanceMember).where(
            AttendanceMember.group_id == group_id
        )
        members_result = await self.session.execute(members_query)
        members = members_result.scalars().all()
        for member in members:
            member.is_active = False
            member.is_deleted = True

            face_query = select(Face).where(Face.person_id == member.person_id)
            face_query = self._apply_org_scope(face_query, Face)
            face_result = await self.session.execute(face_query)
            face = face_result.scalars().first()
            if face:
                await self.session.delete(face)

        await self.session.commit()
        return True

    # Member Methods
    async def add_member(self, member_data: Dict[str, Any]) -> AttendanceMember:
        has_consent = member_data.get("has_consent", False)
        existing_query = select(AttendanceMember).where(
            AttendanceMember.person_id == member_data["person_id"]
        )
        existing_query = self._apply_org_scope(existing_query, AttendanceMember)
        existing_result = await self.session.execute(existing_query)
        existing_member = existing_result.scalars().first()
        if existing_member:
            if existing_member.is_deleted or not existing_member.is_active:
                existing_member.group_id = member_data["group_id"]
                existing_member.name = member_data["name"]
                existing_member.role = member_data.get("role")
                existing_member.email = member_data.get("email")
                existing_member.has_consent = has_consent
                existing_member.consent_granted_at = (
                    to_storage_local(local_now()) if has_consent else None
                )
                existing_member.consent_granted_by = (
                    member_data.get("consent_granted_by", "admin")
                    if has_consent
                    else None
                )
                existing_member.is_active = True
                existing_member.is_deleted = False
                member = existing_member
            else:
                raise ValueError(
                    f"Person ID '{member_data['person_id']}' already exists in this organization."
                )
        else:
            member = AttendanceMember(
                id=ulid.ulid(),
                person_id=member_data["person_id"],
                group_id=member_data["group_id"],
                name=member_data["name"],
                role=member_data.get("role"),
                email=member_data.get("email"),
                joined_at=to_storage_local(local_now()),
                has_consent=has_consent,
                consent_granted_at=(
                    to_storage_local(local_now()) if has_consent else None
                ),
                consent_granted_by=(
                    member_data.get("consent_granted_by", "admin")
                    if has_consent
                    else None
                ),
                is_active=True,
                is_deleted=False,
                organization_id=self.organization_id,
            )
            self.session.add(member)
        await self.session.commit()
        await self.session.refresh(member)
        return member

    async def get_member(self, person_id: str) -> Optional[AttendanceMember]:
        query = select(AttendanceMember).where(
            AttendanceMember.person_id == person_id,
            AttendanceMember.is_active,
            AttendanceMember.is_deleted.is_(False),
        )
        if self.organization_id:
            query = query.where(
                AttendanceMember.organization_id == self.organization_id
            )

        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_group_members(self, group_id: str) -> List[AttendanceMember]:
        query = select(AttendanceMember).where(
            AttendanceMember.group_id == group_id,
            AttendanceMember.is_active,
            AttendanceMember.is_deleted.is_(False),
        )
        if self.organization_id:
            query = query.where(
                AttendanceMember.organization_id == self.organization_id
            )

        query = query.order_by(AttendanceMember.name)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_group_person_ids(self, group_id: str) -> List[str]:
        query = select(AttendanceMember.person_id).where(
            AttendanceMember.group_id == group_id,
            AttendanceMember.is_active,
            AttendanceMember.is_deleted.is_(False),
        )
        if self.organization_id:
            query = query.where(
                AttendanceMember.organization_id == self.organization_id
            )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update_member(
        self, person_id: str, updates: Dict[str, Any]
    ) -> Optional[AttendanceMember]:
        member = await self.get_member(person_id)
        if not member:
            return None

        # Track consent changes for timestamp bookkeeping
        new_consent = updates.get("has_consent")
        if new_consent is True and not member.has_consent:
            updates["consent_granted_at"] = to_storage_local(local_now())
            if "consent_granted_by" not in updates:
                updates["consent_granted_by"] = "admin"
        elif new_consent is False and member.has_consent:
            updates["consent_granted_at"] = None
            updates["consent_granted_by"] = None

        for key, value in updates.items():
            if hasattr(member, key):
                setattr(member, key, value)

        await self.session.commit()
        await self.session.refresh(member)
        return member

    async def remove_member(self, person_id: str) -> bool:
        member = await self.get_member(person_id)
        if not member:
            return False
        member.is_active = False
        member.is_deleted = True

        face_query = select(Face).where(Face.person_id == person_id)
        face_query = self._apply_org_scope(face_query, Face)
        face_result = await self.session.execute(face_query)
        face = face_result.scalars().first()
        if face:
            await self.session.delete(face)

        await self.session.commit()
        return True

    async def rename_person_id(self, old_person_id: str, new_person_id: str) -> bool:
        member = await self.get_member(old_person_id)
        if not member:
            return False

        existing_query = select(AttendanceMember).where(
            AttendanceMember.person_id == new_person_id
        )
        existing_query = self._apply_org_scope(existing_query, AttendanceMember)
        existing_result = await self.session.execute(existing_query)
        existing = existing_result.scalars().first()
        if existing:
            return False

        member.person_id = new_person_id
        await self.session.execute(
            update(AttendanceRecord)
            .where(AttendanceRecord.member_id == member.id)
            .values(person_id=new_person_id)
        )
        await self.session.execute(
            update(AttendanceSession)
            .where(AttendanceSession.member_id == member.id)
            .values(person_id=new_person_id)
        )
        await self.session.commit()
        await self.session.refresh(member)
        return True

    # Record Methods
    async def add_record(self, record_data: Dict[str, Any]) -> AttendanceRecord:
        member = await self.get_member(record_data["person_id"])
        if not member:
            raise ValueError("Member not found")

        record = AttendanceRecord(
            id=record_data["id"],
            person_id=record_data["person_id"],
            member_id=member.id,
            group_id=record_data["group_id"],
            timestamp=record_data["timestamp"],
            confidence=record_data["confidence"],
            location=record_data.get("location"),
            notes=record_data.get("notes"),
            is_manual=record_data.get("is_manual", False),
            created_by=record_data.get("created_by"),
            organization_id=self.organization_id,
        )
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def get_records(
        self,
        group_id: Optional[str] = None,
        person_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: Optional[int] = None,
    ) -> List[AttendanceRecord]:
        query = select(AttendanceRecord)
        query = self._apply_org_scope(query, AttendanceRecord)

        if group_id:
            query = query.where(AttendanceRecord.group_id == group_id)
        if person_id:
            query = query.where(AttendanceRecord.person_id == person_id)
        if start_date:
            query = query.where(AttendanceRecord.timestamp >= start_date)
        if end_date:
            query = query.where(AttendanceRecord.timestamp <= end_date)

        query = query.order_by(desc(AttendanceRecord.timestamp))

        if limit:
            query = query.limit(limit)

        result = await self.session.execute(query)
        return result.scalars().all()

    # Session Methods
    async def upsert_session(self, session_data: Dict[str, Any]) -> AttendanceSession:
        member = await self.get_member(session_data["person_id"])
        if not member:
            raise ValueError("Member not found")

        session_obj = await self.get_session(
            session_data["person_id"], session_data["date"]
        )
        if session_obj:
            session_obj.group_id = session_data["group_id"]
            session_obj.applied_rule_id = session_data.get("applied_rule_id")
            session_obj.check_in_time = session_data.get("check_in_time")
            session_obj.check_out_time = session_data.get("check_out_time")
            session_obj.total_hours = session_data.get("total_hours")
            session_obj.status = session_data["status"]
            session_obj.is_late = session_data.get("is_late", False)
            session_obj.late_minutes = session_data.get("late_minutes")
            session_obj.notes = session_data.get("notes")
        else:
            session_obj = AttendanceSession(
                id=session_data["id"],
                person_id=session_data["person_id"],
                member_id=member.id,
                group_id=session_data["group_id"],
                applied_rule_id=session_data.get("applied_rule_id"),
                date=session_data["date"],
                check_in_time=session_data.get("check_in_time"),
                check_out_time=session_data.get("check_out_time"),
                total_hours=session_data.get("total_hours"),
                status=session_data["status"],
                is_late=session_data.get("is_late", False),
                late_minutes=session_data.get("late_minutes"),
                notes=session_data.get("notes"),
                organization_id=self.organization_id,
            )
            self.session.add(session_obj)
        await self.session.commit()
        await self.session.refresh(session_obj)
        return session_obj

    async def get_session(
        self, person_id: str, date: str
    ) -> Optional[AttendanceSession]:
        query = select(AttendanceSession).where(
            AttendanceSession.person_id == person_id, AttendanceSession.date == date
        )
        if self.organization_id:
            query = query.where(
                AttendanceSession.organization_id == self.organization_id
            )
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_sessions(
        self,
        group_id: Optional[str] = None,
        person_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[AttendanceSession]:
        query = select(AttendanceSession)
        query = self._apply_org_scope(query, AttendanceSession)

        if group_id:
            query = query.where(AttendanceSession.group_id == group_id)
        if person_id:
            query = query.where(AttendanceSession.person_id == person_id)
        if start_date:
            query = query.where(AttendanceSession.date >= start_date)
        if end_date:
            query = query.where(AttendanceSession.date <= end_date)

        query = query.order_by(
            desc(AttendanceSession.date), AttendanceSession.person_id
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    # Settings Methods
    async def get_settings(self) -> AttendanceSettings:
        query = select(AttendanceSettings)
        if self.organization_id:
            query = query.where(
                AttendanceSettings.organization_id == self.organization_id
            )
        else:
            query = query.where(AttendanceSettings.organization_id.is_(None))

        query = query.order_by(
            desc(AttendanceSettings.last_modified_at), AttendanceSettings.id
        )
        result = await self.session.execute(query)
        settings = result.scalars().first()
        if not settings:
            template_query = select(AttendanceSettings).where(
                AttendanceSettings.organization_id.is_(None)
            )
            template_query = template_query.order_by(
                desc(AttendanceSettings.last_modified_at), AttendanceSettings.id
            )
            template_result = await self.session.execute(template_query)
            template = template_result.scalars().first()
            settings = AttendanceSettings(**self._settings_payload(template))
            self.session.add(settings)
            await self.session.commit()
            await self.session.refresh(settings)
        return settings

    async def update_settings(self, settings_data: Dict[str, Any]) -> bool:
        settings = await self.get_settings()

        for key, value in settings_data.items():
            if hasattr(settings, key) and key != "id":
                setattr(settings, key, value)

        await self.session.commit()
        return True

    # Audit Log Methods
    async def add_audit_log(
        self,
        action: str,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        details: Optional[str] = None,
    ) -> AuditLog:
        """Record an immutable audit event for a sensitive administrative action."""
        log = AuditLog(
            id=ulid.ulid(),
            timestamp=to_storage_local(local_now()),
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            organization_id=self.organization_id,
        )
        self.session.add(log)
        await self.session.commit()
        return log

    async def get_audit_logs(self) -> List[AuditLog]:
        """Return all audit logs for this organization, newest first."""
        result = await self.session.execute(
            select(AuditLog)
            .where(AuditLog.organization_id == self.organization_id)
            .order_by(desc(AuditLog.timestamp))
        )
        return list(result.scalars().all())

    # Stats
    async def get_stats(self) -> Dict[str, Any]:
        from config.paths import DATA_DIR

        db_path = DATA_DIR / "attendance.db"

        groups_count = await self.session.scalar(
            self._apply_org_scope(
                select(func.count())
                .select_from(AttendanceGroup)
                .where(
                    AttendanceGroup.is_active, AttendanceGroup.is_deleted.is_(False)
                ),
                AttendanceGroup,
            )
        )
        members_count = await self.session.scalar(
            self._apply_org_scope(
                select(func.count())
                .select_from(AttendanceMember)
                .where(
                    AttendanceMember.is_active, AttendanceMember.is_deleted.is_(False)
                ),
                AttendanceMember,
            )
        )
        records_count = await self.session.scalar(
            self._apply_org_scope(
                select(func.count()).select_from(AttendanceRecord), AttendanceRecord
            )
        )
        sessions_count = await self.session.scalar(
            self._apply_org_scope(
                select(func.count()).select_from(AttendanceSession), AttendanceSession
            )
        )

        db_size = db_path.stat().st_size if db_path.exists() else 0

        return {
            "total_groups": groups_count,
            "total_members": members_count,
            "total_records": records_count,
            "total_sessions": sessions_count,
            "database_path": str(db_path),
            "database_size_bytes": db_size,
            "database_size_mb": round(db_size / (1024 * 1024), 2),
        }

    async def cleanup_old_data(self, days: int) -> Dict[str, int]:
        """Delete records and sessions older than X days"""
        cutoff_date = to_storage_local(local_now() - timedelta(days=days))
        cutoff_date_str = cutoff_date.strftime("%Y-%m-%d")

        # Delete records
        record_query = select(AttendanceRecord).where(
            AttendanceRecord.timestamp < cutoff_date
        )
        record_query = self._apply_org_scope(record_query, AttendanceRecord)
        records_result = await self.session.execute(record_query)
        records_to_delete = records_result.scalars().all()
        for r in records_to_delete:
            await self.session.delete(r)

        # Delete sessions
        session_query = select(AttendanceSession).where(
            AttendanceSession.date < cutoff_date_str
        )
        session_query = self._apply_org_scope(session_query, AttendanceSession)
        sessions_result = await self.session.execute(session_query)
        sessions_to_delete = sessions_result.scalars().all()
        for s in sessions_to_delete:
            await self.session.delete(s)

        await self.session.commit()

        return {
            "records_deleted": len(records_to_delete),
            "sessions_deleted": len(sessions_to_delete),
        }


class FaceRepository:
    """Repository pattern for Face database operations"""

    def __init__(self, session: AsyncSession, organization_id: Optional[str] = None):
        self.session = session
        self.organization_id = organization_id

    async def upsert_face(
        self,
        person_id: str,
        embedding: bytes,
        dimension: int,
        image_hash: Optional[str] = None,
    ) -> Face:
        query = select(Face).where(Face.person_id == person_id)
        if self.organization_id:
            query = query.where(Face.organization_id == self.organization_id)
        else:
            query = query.where(Face.organization_id.is_(None))
        result = await self.session.execute(query)
        face = result.scalars().first()
        if face:
            face.embedding = embedding
            face.embedding_dimension = dimension
            face.hash = image_hash
            face.is_deleted = False
        else:
            face = Face(
                id=ulid.ulid(),
                person_id=person_id,
                embedding=embedding,
                embedding_dimension=dimension,
                hash=image_hash,
                organization_id=self.organization_id,
                is_deleted=False,  # Ensure it's active if re-added
            )
            self.session.add(face)
        await self.session.commit()
        await self.session.refresh(face)
        return face

    async def get_face(self, person_id: str) -> Optional[Face]:
        query = select(Face).where(
            Face.person_id == person_id, Face.is_deleted.is_(False)
        )
        if self.organization_id:
            query = query.where(Face.organization_id == self.organization_id)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_all_faces(self) -> List[Face]:
        query = select(Face).where(Face.is_deleted.is_(False))
        if self.organization_id:
            query = query.where(Face.organization_id == self.organization_id)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def remove_face(self, person_id: str) -> bool:
        face = await self.get_face(person_id)
        if not face:
            return False
        await self.session.delete(face)
        await self.session.commit()
        return True

    async def update_person_id(self, old_id: str, new_id: str) -> bool:
        face = await self.get_face(old_id)
        if not face:
            return False

        # Check if new_id already exists
        query = select(Face).where(Face.person_id == new_id)
        if self.organization_id:
            query = query.where(Face.organization_id == self.organization_id)
        else:
            query = query.where(Face.organization_id.is_(None))
        exists_result = await self.session.execute(query)
        exists = exists_result.scalars().first()
        if exists:
            return False

        face.person_id = new_id
        await self.session.commit()
        return True

    async def clear_faces(self) -> bool:
        query = select(Face)
        if self.organization_id:
            query = query.where(Face.organization_id == self.organization_id)
        result = await self.session.execute(query)
        faces = result.scalars().all()
        for f in faces:
            await self.session.delete(f)
        await self.session.commit()
        return True

    async def get_stats(self) -> Dict[str, Any]:
        query = select(func.count()).select_from(Face).where(Face.is_deleted.is_(False))
        if self.organization_id:
            query = query.where(Face.organization_id == self.organization_id)
        count = await self.session.scalar(query)
        return {"total_faces": count}
