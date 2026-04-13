from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    String,
    Boolean,
    Integer,
    Float,
    ForeignKey,
    DateTime,
    Text,
    func,
    Index,
    LargeBinary,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.ext.asyncio import AsyncAttrs

from config.models import FACE_DETECTOR_CONFIG


class Base(AsyncAttrs, DeclarativeBase):
    pass


class SyncMixin(AsyncAttrs):
    """
    Mixin to add synchronization metadata and multi-tenancy.
    """

    organization_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, index=True
    )
    cloud_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    last_modified_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)


class AttendanceGroup(Base, SyncMixin):
    __tablename__ = "attendance_groups"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    late_threshold_minutes: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    late_threshold_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Default to current time in HH:MM format
    class_start_time: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now().strftime("%H:%M")
    )
    track_checkout: Mapped[bool] = mapped_column(Boolean, default=False)

    members: Mapped[List["AttendanceMember"]] = relationship(back_populates="group")
    records: Mapped[List["AttendanceRecord"]] = relationship(back_populates="group")
    sessions: Mapped[List["AttendanceSession"]] = relationship(back_populates="group")
    rule_history: Mapped[List["AttendanceGroupRule"]] = relationship(
        back_populates="group", order_by="AttendanceGroupRule.effective_from"
    )

    @property
    def settings(self):
        return {
            "late_threshold_minutes": self.late_threshold_minutes,
            "late_threshold_enabled": self.late_threshold_enabled,
            "class_start_time": self.class_start_time,
            "track_checkout": self.track_checkout,
        }


class AttendanceMember(Base, SyncMixin):
    __tablename__ = "attendance_members"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    person_id: Mapped[str] = mapped_column(String, nullable=False)
    group_id: Mapped[str] = mapped_column(
        String, ForeignKey("attendance_groups.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    has_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    # Compliance: record who granted consent and when (DPA Sec.12 / GDPR Art.7)
    consent_granted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    consent_granted_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    group: Mapped["AttendanceGroup"] = relationship(back_populates="members")
    records: Mapped[List["AttendanceRecord"]] = relationship(back_populates="member")
    sessions: Mapped[List["AttendanceSession"]] = relationship(back_populates="member")

    __table_args__ = (
        Index("ix_member_group_id", "group_id"),
        Index(
            "ux_member_person_global",
            "person_id",
            unique=True,
            sqlite_where=text("organization_id IS NULL"),
        ),
        Index(
            "ux_member_person_org",
            "person_id",
            "organization_id",
            unique=True,
            sqlite_where=text("organization_id IS NOT NULL"),
        ),
    )


class AttendanceRecord(Base, SyncMixin):
    __tablename__ = "attendance_records"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    person_id: Mapped[str] = mapped_column(String, nullable=False)
    member_id: Mapped[str] = mapped_column(
        String, ForeignKey("attendance_members.id"), nullable=False
    )
    group_id: Mapped[str] = mapped_column(
        String, ForeignKey("attendance_groups.id"), nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_voided: Mapped[bool] = mapped_column(Boolean, default=False)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    voided_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    void_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    member: Mapped["AttendanceMember"] = relationship(back_populates="records")
    group: Mapped["AttendanceGroup"] = relationship(back_populates="records")

    __table_args__ = (
        Index("ix_record_group_id", "group_id"),
        Index("ix_record_person_id", "person_id"),
        Index("ix_record_member_id", "member_id"),
        Index("ix_record_timestamp", "timestamp"),
        Index("ix_record_group_timestamp", "group_id", "timestamp"),
    )


class AttendanceSession(Base, SyncMixin):
    __tablename__ = "attendance_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    person_id: Mapped[str] = mapped_column(String, nullable=False)
    member_id: Mapped[str] = mapped_column(
        String, ForeignKey("attendance_members.id"), nullable=False
    )
    group_id: Mapped[str] = mapped_column(
        String, ForeignKey("attendance_groups.id"), nullable=False
    )
    applied_rule_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("attendance_group_rules.id"), nullable=True
    )
    date: Mapped[str] = mapped_column(String, nullable=False)  # YYYY-MM-DD
    check_in_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    check_out_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    total_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="absent")
    is_late: Mapped[bool] = mapped_column(Boolean, default=False)
    late_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    member: Mapped["AttendanceMember"] = relationship(back_populates="sessions")
    group: Mapped["AttendanceGroup"] = relationship(back_populates="sessions")
    applied_rule: Mapped[Optional["AttendanceGroupRule"]] = relationship()

    __table_args__ = (
        Index("ix_session_group_id", "group_id"),
        Index("ix_session_person_id", "person_id"),
        Index("ix_session_member_id", "member_id"),
        Index("ix_session_applied_rule_id", "applied_rule_id"),
        Index("ix_session_date", "date"),
        Index("ix_session_group_date", "group_id", "date"),
        Index("ux_session_member_date", "member_id", "date", unique=True),
    )


class AttendanceGroupRule(Base, SyncMixin):
    __tablename__ = "attendance_group_rules"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_id: Mapped[str] = mapped_column(
        String, ForeignKey("attendance_groups.id"), nullable=False
    )
    effective_from: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, index=True
    )
    late_threshold_minutes: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    late_threshold_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    class_start_time: Mapped[str] = mapped_column(String, nullable=False)
    track_checkout: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )

    group: Mapped["AttendanceGroup"] = relationship(back_populates="rule_history")

    __table_args__ = (
        Index("ix_group_rule_group_id", "group_id"),
        Index(
            "ix_group_rule_group_effective_from",
            "group_id",
            "effective_from",
            unique=False,
        ),
    )


class AttendanceSettings(Base, SyncMixin):
    __tablename__ = "attendance_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    late_threshold_minutes: Mapped[int] = mapped_column(Integer, default=15)
    enable_location_tracking: Mapped[bool] = mapped_column(Boolean, default=False)
    confidence_threshold: Mapped[float] = mapped_column(
        Float, default=FACE_DETECTOR_CONFIG["score_threshold"]
    )
    attendance_cooldown_seconds: Mapped[int] = mapped_column(Integer, default=300)
    # Longer anti-duplicate window (e.g., 30 minutes) to prevent re-logging.
    relog_cooldown_seconds: Mapped[int] = mapped_column(Integer, default=1800)
    enable_liveness_detection: Mapped[bool] = mapped_column(Boolean, default=False)
    max_recognition_faces_per_frame: Mapped[int] = mapped_column(Integer, default=6)
    # Compliance: auto-purge records older than N days (0 = keep forever)
    data_retention_days: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        Index(
            "ux_attendance_settings_organization_id",
            "organization_id",
            unique=True,
            sqlite_where=text("organization_id IS NOT NULL"),
        ),
    )


class Face(Base, SyncMixin):
    __tablename__ = "faces"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    person_id: Mapped[str] = mapped_column(String, nullable=False)
    embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    embedding_dimension: Mapped[int] = mapped_column(Integer, nullable=False)
    hash: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )

    __table_args__ = (
        Index("ix_face_person_id", "person_id"),
        Index(
            "ux_face_person_global",
            "person_id",
            unique=True,
            sqlite_where=text("organization_id IS NULL"),
        ),
        Index(
            "ux_face_person_org",
            "person_id",
            "organization_id",
            unique=True,
            sqlite_where=text("organization_id IS NOT NULL"),
        ),
    )


class AuditLog(Base):
    """Immutable audit trail for sensitive administrative actions."""

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), index=True
    )
    action: Mapped[str] = mapped_column(String, nullable=False, index=True)
    target_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    target_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    organization_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, index=True
    )

    __table_args__ = (
        Index("ix_audit_timestamp", "timestamp"),
        Index("ix_audit_action", "action"),
    )
