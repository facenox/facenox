import type { AttendanceSession } from "@/types/recognition"
import type { DepartureStatus } from "@/components/group/sections/reports/utils/departureStatus"

export type ColumnKey =
  | "name"
  | "date"
  | "visit_number"
  | "check_in_time"
  | "check_out_time"
  | "departure_status"
  | "total_hours"
  | "status"
  | "is_late"
  | "late_minutes"
  | "notes"

export type GroupByKey = "none" | "person" | "date"

export type ReportStatusFilter = "all" | "present" | "late" | "absent" | "no_records"

export interface SavedViewConfig {
  name: string
  columns: ColumnKey[]
  groupBy: GroupByKey
  statusFilter: ReportStatusFilter
  search: string
}

export interface RowData {
  person_id: string
  name: string
  date: string
  check_in_time?: Date
  check_out_time?: Date
  departure_status?: DepartureStatus
  visit_number?: number
  total_hours?: number
  status: ReportStatusFilter
  is_late: boolean
  late_minutes: number
  notes: string
  session: AttendanceSession | null
}
