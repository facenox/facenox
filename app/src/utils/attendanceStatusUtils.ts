export type AttendanceStatusDisplay = 'present' | 'absent' | 'late' | 'no_records'

export interface StatusConfig {
  label: string
  shortLabel?: string
  className: string
  color: string
}
