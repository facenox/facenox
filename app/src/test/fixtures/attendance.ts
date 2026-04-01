import type {
  AttendanceGroup,
  AttendanceMember,
  AttendanceRecord,
  AttendanceReport,
  AttendanceSession,
} from "@/types/recognition"

type AttendanceGroupOverrides = Partial<AttendanceGroup>
type AttendanceMemberOverrides = Partial<AttendanceMember>
type AttendanceRecordOverrides = Partial<AttendanceRecord>
type AttendanceSessionOverrides = Partial<AttendanceSession>
type AttendanceReportOverrides = Partial<Omit<AttendanceReport, "date_range" | "summary">> & {
  date_range?: Partial<AttendanceReport["date_range"]>
  summary?: Partial<AttendanceReport["summary"]>
}

export function createAttendanceGroup(overrides: AttendanceGroupOverrides = {}): AttendanceGroup {
  const { settings, ...rest } = overrides

  return {
    id: "group-1",
    name: "Morning Class",
    created_at: new Date("2026-04-01T00:00:00.000Z"),
    is_active: true,
    ...rest,
    settings: {
      late_threshold_minutes: 15,
      late_threshold_enabled: false,
      class_start_time: "08:00",
      track_checkout: false,
      ...settings,
    },
  }
}

export function createAttendanceMember(
  overrides: AttendanceMemberOverrides = {},
): AttendanceMember {
  return {
    person_id: "person-1",
    group_id: "group-1",
    name: "Alice",
    joined_at: new Date("2026-04-01T00:00:00.000Z"),
    is_active: true,
    has_face_data: true,
    has_consent: true,
    ...overrides,
  }
}

export function createAttendanceRecord(
  overrides: AttendanceRecordOverrides = {},
): AttendanceRecord {
  return {
    id: "record-1",
    person_id: "person-1",
    group_id: "group-1",
    timestamp: new Date("2026-04-01T08:00:00.000Z"),
    confidence: 0.95,
    is_manual: false,
    ...overrides,
  }
}

export function createAttendanceSession(
  overrides: AttendanceSessionOverrides = {},
): AttendanceSession {
  return {
    id: "session-1",
    person_id: "person-1",
    group_id: "group-1",
    date: "2026-04-01",
    check_in_time: new Date("2026-04-01T08:00:00.000Z"),
    status: "present",
    is_late: false,
    ...overrides,
  }
}

export function createAttendanceReport(
  overrides: AttendanceReportOverrides = {},
): AttendanceReport {
  const { date_range, summary, ...rest } = overrides

  return {
    group_id: "group-1",
    ...rest,
    date_range: {
      start: new Date("2026-04-01T00:00:00.000Z"),
      end: new Date("2026-04-05T00:00:00.000Z"),
      ...date_range,
    },
    members: rest.members ?? [],
    summary: {
      total_working_days: 5,
      average_attendance_rate: 0,
      most_punctual: "",
      most_absent: "",
      ...summary,
    },
  }
}
