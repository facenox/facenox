// AttendanceSession import removed

export type AttendanceStatusDisplay = "present" | "absent" | "late" | "no_records"

export interface StatusConfig {
  label: string
  shortLabel?: string
  className: string
  color: string
}

// Unused status utility functions removed as they are not imported anywhere in the app.
