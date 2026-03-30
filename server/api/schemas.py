"""API Schemas"""

from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator
from enum import Enum

from time_utils import to_api_utc


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


class OptimizationRequest(BaseModel):
    pass


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
    late_threshold_minutes: Optional[int] = 15
    late_threshold_enabled: bool = False
    class_start_time: Optional[str] = None  # HH:MM, defaults to creation time
    track_checkout: bool = False


class AttendanceGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    settings: Optional[GroupSettings] = None


class AttendanceGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    settings: Optional[GroupSettings] = None
    is_active: Optional[bool] = None


class AttendanceGroupResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    is_active: bool
    settings: GroupSettings

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
    track_checkout: bool

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
    has_consent: bool = False
    consent_granted_by: Optional[str] = Field(None, max_length=100)


class AttendanceMemberUpdate(BaseModel):
    group_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None
    has_consent: Optional[bool] = None
    consent_granted_by: Optional[str] = Field(None, max_length=100)


class AttendanceMemberResponse(BaseModel):
    person_id: str
    group_id: str
    name: str
    role: Optional[str]
    email: Optional[str]
    joined_at: datetime
    is_active: bool
    has_consent: bool
    consent_granted_at: Optional[datetime] = None
    consent_granted_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("joined_at", "consent_granted_at", mode="before")
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
    notes: Optional[str] = Field(None, max_length=500)
    is_manual: bool = False
    created_by: Optional[str] = Field(None, max_length=100)


class AttendanceRecordResponse(BaseModel):
    id: str
    person_id: str
    group_id: str
    timestamp: datetime
    confidence: float
    location: Optional[str]
    notes: Optional[str]
    is_manual: bool
    created_by: Optional[str]
    is_voided: bool = False
    voided_at: Optional[datetime] = None
    voided_by: Optional[str] = None
    void_reason: Optional[str] = None

    @field_validator("timestamp", "voided_at", mode="before")
    @classmethod
    def _normalize_timestamp(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _normalize_api_datetime(value)


class AttendanceRecordVoidRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)
    voided_by: Optional[str] = Field(None, max_length=100)


# Session Models
class AttendanceSessionResponse(BaseModel):
    id: str
    person_id: str
    group_id: str
    applied_rule_id: Optional[str] = None
    date: str  # YYYY-MM-DD format
    check_in_time: Optional[datetime]
    check_out_time: Optional[datetime] = None
    total_hours: Optional[float] = None
    status: AttendanceStatus
    is_late: bool
    late_minutes: Optional[int]
    notes: Optional[str]

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
    late_threshold_minutes: Optional[int] = Field(None, ge=0, le=120)
    enable_location_tracking: Optional[bool] = None
    confidence_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    attendance_cooldown_seconds: Optional[int] = Field(None, ge=1, le=300)
    relog_cooldown_seconds: Optional[int] = Field(None, ge=300, le=7200)
    enable_liveness_detection: Optional[bool] = None
    max_recognition_faces_per_frame: Optional[int] = Field(None, ge=1, le=20)
    data_retention_days: Optional[int] = Field(
        None, ge=0, le=3650
    )  # 0=keep forever, max 10 years


class AttendanceSettingsResponse(BaseModel):
    late_threshold_minutes: int
    enable_location_tracking: bool
    confidence_threshold: float
    attendance_cooldown_seconds: int
    relog_cooldown_seconds: int
    enable_liveness_detection: bool
    max_recognition_faces_per_frame: int
    data_retention_days: int

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


# Bulk Operations Models
class BulkMemberCreate(BaseModel):
    members: List[AttendanceMemberCreate] = Field(..., min_length=1, max_length=100)


class BulkMemberResponse(BaseModel):
    success_count: int
    error_count: int
    errors: List[Dict[str, str]] = []


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
