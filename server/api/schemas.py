"""API Schemas"""

from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from enum import Enum
from zoneinfo import ZoneInfo

from time_utils import to_api_utc
from attendance_time import event_time, read_value


class CapturedAttendanceResponse(BaseModel):
    """Prefer preserved instants while keeping legacy API datetime field names."""

    @model_validator(mode="before")
    @classmethod
    def _captured_instants(cls, value):
        data = (
            dict(value)
            if isinstance(value, dict)
            else {
                name: getattr(value, name)
                for name in cls.model_fields
                if hasattr(value, name)
            }
        )
        for field in ("timestamp", "check_in_time", "check_out_time"):
            if field in cls.model_fields:
                captured = event_time(value, field)
                if captured is not None:
                    data[field] = captured
                # Only export provenance when its companions actually resolved
                # this event, not stale metadata left by a legacy writer.
                utc = read_value(value, f"{field}_utc")
                if utc is not None and captured is not None and captured.tzinfo is None:
                    data[f"{field}_timezone"] = None
                    data[f"{field}_offset_seconds"] = None
        return data


def _normalize_api_datetime(value):
    if value is None or not isinstance(value, datetime):
        return value
    return to_api_utc(value)


# ============================================================================
# Face Detection Schemas
# ============================================================================


class DetectionResponse(BaseModel):
    success: bool
    faces: List[Dict]
    processing_time: float
    model_used: str
    suggested_skip: int = 0


# ============================================================================
# Face Recognition Schemas
# ============================================================================


class FaceRecognitionResponse(BaseModel):
    success: bool
    person_id: Optional[str] = None
    similarity: float
    processing_time: float
    error: Optional[str] = None


class PersonUpdateRequest(BaseModel):
    old_person_id: str
    new_person_id: str


class SimilarityThresholdRequest(BaseModel):
    threshold: float


# ============================================================================
# Attendance Schemas
# ============================================================================


class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"


# Group Models
class GroupSettings(BaseModel):
    attendance_mode: str = Field(
        "attendance", pattern="^(attendance|work_hours|visits)$"
    )
    late_threshold_minutes: Optional[int] = 15
    late_threshold_enabled: bool = False
    class_start_time: Optional[str] = None  # HH:MM, defaults to creation time
    class_end_time: Optional[str] = None  # HH:MM, target departure/dismissal time
    track_checkout: bool = False
    min_checkout_delay_minutes: Optional[int] = 15
    scan_behavior: str = Field(
        "automatic", pattern="^(automatic|entry_only|exit_only)$"
    )


class AttendanceGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    settings: Optional[GroupSettings] = None


class AttendanceGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    settings: Optional[GroupSettings] = None
    is_active: Optional[bool] = None


class AttendanceGroupResponse(BaseModel):
    sync_revision: int = 0
    sync_dirty: bool = True
    version: int = 1
    id: str
    name: str
    created_at: datetime
    is_active: bool
    settings: GroupSettings
    remote_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_created_at(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _normalize_api_datetime(value)


class AttendanceGroupRuleResponse(BaseModel):
    id: str
    group_id: str
    effective_from: datetime
    late_threshold_minutes: Optional[int]
    late_threshold_enabled: bool
    class_start_time: str
    class_end_time: Optional[str] = None
    attendance_mode: str = "attendance"
    track_checkout: bool
    min_checkout_delay_minutes: Optional[int] = 15
    scan_behavior: str = "automatic"

    model_config = ConfigDict(from_attributes=True)

    @field_validator("effective_from", mode="before")
    @classmethod
    def _normalize_effective_from(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _normalize_api_datetime(value)


# Member Models
class AttendanceMemberCreate(BaseModel):
    person_id: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="Auto-generated if empty",
    )
    group_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=100)
    role: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)


class AttendanceMemberUpdate(BaseModel):
    group_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class AttendanceMemberResponse(BaseModel):
    sync_revision: int = 0
    sync_dirty: bool = True
    version: int = 1
    id: str
    person_id: str
    group_id: str
    name: str
    role: Optional[str]
    email: Optional[str]
    joined_at: datetime
    is_active: bool
    has_face_data: bool = False
    remote_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("joined_at", mode="before")
    @classmethod
    def _normalize_member_datetimes(
        cls, value: Optional[datetime]
    ) -> Optional[datetime]:
        return _normalize_api_datetime(value)


# Record Models
class AttendanceRecordCreate(BaseModel):
    person_id: str = Field(..., min_length=1)
    timestamp: Optional[datetime] = None
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    location: Optional[str] = Field(None, max_length=255)
    device_id: Optional[str] = Field(None, max_length=255)
    event_type: Optional[str] = Field(None, pattern="^(check_in|check_out)$")
    notes: Optional[str] = Field(None, max_length=500)
    is_manual: bool = False
    created_by: Optional[str] = Field(None, max_length=100)


class AttendanceRecordResponse(CapturedAttendanceResponse):
    id: str
    person_id: str
    member_id: str
    group_id: str
    timestamp: datetime
    timestamp_timezone: Optional[str] = None
    timestamp_offset_seconds: Optional[int] = None
    confidence: float
    location: Optional[str]
    device_id: Optional[str] = None
    event_type: Optional[str] = None
    notes: Optional[str]
    is_manual: bool
    created_by: Optional[str]
    is_voided: bool = False
    voided_at: Optional[datetime] = None
    voided_by: Optional[str] = None
    void_reason: Optional[str] = None
    remote_id: Optional[str] = None

    @field_validator("timestamp", "voided_at", mode="before")
    @classmethod
    def _normalize_timestamp(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _normalize_api_datetime(value)


class AttendanceRecordVoidRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)
    voided_by: Optional[str] = Field(None, max_length=100)


# Session Models
class AttendanceSessionResponse(CapturedAttendanceResponse):
    id: str
    person_id: str
    member_id: str
    group_id: str
    applied_rule_id: Optional[str] = None
    date: str  # YYYY-MM-DD format
    visit_number: int = 1
    check_in_time: Optional[datetime]
    check_out_time: Optional[datetime] = None
    check_in_time_timezone: Optional[str] = None
    check_in_time_offset_seconds: Optional[int] = None
    check_out_time_timezone: Optional[str] = None
    check_out_time_offset_seconds: Optional[int] = None
    total_hours: Optional[float] = None
    status: AttendanceStatus
    is_late: bool
    late_minutes: Optional[int]
    notes: Optional[str]
    remote_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("check_in_time", "check_out_time", mode="before")
    @classmethod
    def _normalize_session_times(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _normalize_api_datetime(value)


class AttendanceTimeHealthResponse(BaseModel):
    source: str
    current_time_utc: datetime
    current_time_local: datetime
    time_zone_name: str
    os_clock_drift_seconds: float
    os_clock_warning: Optional[str]
    online_verification_status: str
    online_reference_url: Optional[str]
    online_checked_at: Optional[datetime]
    online_reference_time: Optional[datetime]
    online_drift_seconds: Optional[float]
    warning_message: Optional[str]

    @field_validator(
        "current_time_utc",
        "current_time_local",
        "online_checked_at",
        "online_reference_time",
        mode="before",
    )
    @classmethod
    def _normalize_time_health_datetimes(cls, value):
        if value is None or not isinstance(value, datetime):
            return value
        if value.tzinfo is None:
            return to_api_utc(value)
        return value


# Event Models
class AttendanceEventCreate(BaseModel):
    person_id: str = Field(..., min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)
    location: Optional[str] = Field(None, max_length=255)
    device_id: Optional[str] = Field(None, max_length=255)
    scan_behavior: Optional[str] = Field(
        None, pattern="^(automatic|entry_only|exit_only)$"
    )

    # Optional metadata from recognition pipeline.
    # Not persisted today, but accepted for forward compatibility.
    liveness_status: Optional[str] = Field(None, max_length=50)
    liveness_confidence: Optional[float] = Field(None, ge=0.0)

    model_config = ConfigDict(extra="ignore")


class AttendanceEventResponse(BaseModel):
    id: Optional[str]
    person_id: str
    group_id: str
    timestamp: datetime
    confidence: float
    location: Optional[str]
    processed: bool
    event_type: Optional[str] = None  # "check_in" or "check_out"
    device_id: Optional[str] = None
    error: Optional[str]
    time_health: Optional[AttendanceTimeHealthResponse] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("timestamp", mode="before")
    @classmethod
    def _normalize_event_timestamp(
        cls, value: Optional[datetime]
    ) -> Optional[datetime]:
        return _normalize_api_datetime(value)


# Settings Models
class AttendanceSettingsUpdate(BaseModel):
    attendance_timezone: Optional[str] = Field(None, max_length=100)

    @field_validator("attendance_timezone")
    @classmethod
    def _valid_attendance_timezone(cls, value):
        if value:
            try:
                ZoneInfo(value)
            except (KeyError, ValueError) as error:
                raise ValueError("Choose a valid IANA attendance timezone.") from error
        return value

    late_threshold_minutes: Optional[int] = Field(None, ge=0, le=120)
    enable_location_tracking: Optional[bool] = None
    confidence_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    attendance_cooldown_seconds: Optional[int] = Field(None, ge=1, le=300)
    relog_cooldown_seconds: Optional[int] = Field(None, ge=300, le=7200)
    enable_liveness_detection: Optional[bool] = None
    max_recognition_faces_per_frame: Optional[int] = Field(None, ge=0, le=50)
    data_retention_days: Optional[int] = Field(
        None, ge=0, le=3650
    )  # 0=keep forever, max 10 years


class AttendanceSettingsResponse(BaseModel):
    attendance_timezone: Optional[str] = None
    late_threshold_minutes: int
    enable_location_tracking: bool
    confidence_threshold: float
    attendance_cooldown_seconds: int
    relog_cooldown_seconds: int
    enable_liveness_detection: bool
    max_recognition_faces_per_frame: int
    data_retention_days: int
    remote_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# Statistics Models
class AttendanceStatsResponse(BaseModel):
    total_members: int
    present_today: int
    absent_today: int
    late_today: int


class MemberReportData(BaseModel):
    person_id: str
    name: str
    total_days: int
    present_days: int
    absent_days: int
    late_days: int
    attendance_rate: float


class ReportSummary(BaseModel):
    total_working_days: int
    average_attendance_rate: float
    most_punctual: str
    most_absent: str


class AttendanceReportResponse(BaseModel):
    group_id: str
    date_range: Dict[str, datetime]
    members: List[MemberReportData]
    summary: ReportSummary


# Query Models


# Response Models
class SuccessResponse(BaseModel):
    success: bool = True
    message: str


class DatabaseStatsResponse(BaseModel):
    total_groups: int
    total_members: int
    total_records: int
    total_sessions: int
    database_path: str
    database_size_bytes: int
    database_size_mb: float
    unsynced_records_count: Optional[int] = None
    unsynced_sessions_count: Optional[int] = None


# Bulk Operations Models
class BulkMemberCreate(BaseModel):
    members: List[AttendanceMemberCreate] = Field(..., min_length=1, max_length=1000)


class BulkMemberDeleteRequest(BaseModel):
    person_ids: List[str] = Field(..., min_length=1, max_length=1000)


class BulkMemberResponse(BaseModel):
    success_count: int
    error_count: int
    errors: List[Dict[str, str]] = []
    members: List[AttendanceMemberResponse] = []


class ExportDataResponse(BaseModel):
    groups: List[AttendanceGroupResponse]
    group_rules: List[AttendanceGroupRuleResponse] = []
    members: List[AttendanceMemberResponse]
    records: List[AttendanceRecordResponse]
    sessions: List[AttendanceSessionResponse]
    settings: AttendanceSettingsResponse
    exported_at: datetime

    @field_validator("exported_at", mode="before")
    @classmethod
    def _normalize_exported_at(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _normalize_api_datetime(value)


class ImportDataRequest(BaseModel):
    data: ExportDataResponse
    overwrite_existing: bool = False


class CleanupRequest(BaseModel):
    days_to_keep: int = Field(90, ge=1, le=365)


class ImportedGroup(BaseModel):
    sync_revision: int = 0
    id: str
    name: str
    is_active: bool = True
    settings: Optional[Dict] = None
    remote_id: Optional[str] = None
    created_at: Optional[datetime] = None


class ImportedMember(BaseModel):
    sync_revision: int = 0
    id: Optional[str] = None
    person_id: str
    group_id: str
    name: str
    role: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True
    remote_id: Optional[str] = None
    joined_at: Optional[datetime] = None


class ImportMetadataRequest(BaseModel):
    groups: List[ImportedGroup]
    members: List[ImportedMember]
    prune_missing: bool = False
    accepted_groups: Dict[str, int] = Field(default_factory=dict)
    accepted_members: Dict[str, int] = Field(default_factory=dict)
    acknowledged_groups: Dict[str, int] = Field(default_factory=dict)
    acknowledged_members: Dict[str, int] = Field(default_factory=dict)
    removed_group_ids: List[str] = Field(default_factory=list)
    removed_member_ids: List[str] = Field(default_factory=list)


class ImportMetadataResponse(BaseModel):
    success: bool = True
    groups_count: int
    members_count: int
    pruned_faces: int = 0
    erased_faces: int = 0
