import { useMemo } from "react"
import { generateDateRange, createDisplayNameMap, parseLocalDate } from "@/utils"
import { getAttendanceDateString } from "@/utils/attendanceTime"
import type {
  AttendanceSession,
  AttendanceMember,
  AttendanceGroup,
  AttendanceReport,
} from "@/types/recognition"
import type {
  ColumnKey,
  RowData,
  GroupByKey,
  ReportStatusFilter,
} from "@/components/group/sections/reports/types"
import { getSessionDepartureStatus } from "@/shared/departureStatus"
import { compareReportNames, compareReportRows } from "../utils/reportOrdering"

export function useReportTransform(
  _group: AttendanceGroup,
  members: AttendanceMember[],
  sessions: AttendanceSession[],
  report: AttendanceReport | null,
  startDateStr: string,
  endDateStr: string,
  groupBy: GroupByKey,
  statusFilter: ReportStatusFilter,
  search: string,
  attendanceTimeZone?: string | null,
) {
  const attendanceMode =
    _group.settings?.attendance_mode ??
    (_group.settings?.track_checkout ? "work_hours" : "attendance")
  // Build table rows from sessions + members
  const displayNameMap = useMemo(() => {
    return createDisplayNameMap(members)
  }, [members])

  // Create a map of sessions by person_id and date for quick lookup
  const sessionsMap = useMemo(() => {
    const map = new Map<string, AttendanceSession[]>()
    sessions.forEach((s) => {
      const key = `${s.person_id}_${s.date}`
      const existing = map.get(key) || []
      existing.push(s)
      map.set(key, existing)
    })
    return map
  }, [sessions])

  // 1. Generate base raw rows for the date range
  const allRows = useMemo(() => {
    const allDates = generateDateRange(startDateStr, endDateStr)
    const rows: RowData[] = []
    const todayStr = getAttendanceDateString(new Date(), attendanceTimeZone)

    for (const member of members) {
      let memberJoinedStr: string | null = null
      const rawJoinedAt = member.joined_at as unknown
      if (rawJoinedAt instanceof Date) {
        memberJoinedStr = getAttendanceDateString(rawJoinedAt, attendanceTimeZone)
      } else if (typeof rawJoinedAt === "string") {
        memberJoinedStr = rawJoinedAt.split("T")[0]
      }

      for (const date of allDates) {
        const isBeforeJoined = Boolean(memberJoinedStr && date < memberJoinedStr)
        const isFutureDate = date > todayStr
        const shouldShowNoRecords = isBeforeJoined || isFutureDate

        const sessionKey = `${member.person_id}_${date}`
        const sessionsForDate = shouldShowNoRecords ? [] : sessionsMap.get(sessionKey) || []
        // Today's mode must not collapse visits recorded under an earlier rule.
        for (const finalSession of sessionsForDate.length ? sessionsForDate : [null]) {
          let status: ReportStatusFilter
          if (shouldShowNoRecords) {
            status = "no_records"
          } else if (!finalSession) {
            status = "absent"
          } else if (finalSession.is_late) {
            status = "late"
          } else {
            status = finalSession.status as ReportStatusFilter
          }

          rows.push({
            person_id: member.person_id,
            name: displayNameMap.get(member.person_id) || member.name || "Member",
            date,
            check_in_time: finalSession?.check_in_time,
            check_out_time: finalSession?.check_out_time,
            departure_status: getSessionDepartureStatus(finalSession, attendanceTimeZone),
            visit_number: finalSession?.visit_number || 1,
            total_hours: finalSession?.total_hours,
            status,
            is_late: Boolean(finalSession?.is_late),
            late_minutes: finalSession?.late_minutes || 0,
            notes: finalSession?.notes || "",
            session: finalSession,
          })
        }
      }
    }
    return rows.sort(compareReportRows)
  }, [sessionsMap, members, displayNameMap, startDateStr, endDateStr, attendanceTimeZone])

  // 2. Filter rows based on status and search query
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()

    return allRows.filter((r) => {
      if (statusFilter !== "all") {
        if (statusFilter === "present") {
          if (r.status !== "present" && r.status !== "late" && !r.is_late) return false
        } else if (statusFilter === "late") {
          if (!r.is_late && r.status !== "late") return false
        } else {
          if (r.status !== statusFilter) return false
        }
      }

      if (query) {
        const nameMatch = r.name.toLowerCase().includes(query)
        const statusMatch = r.status.toLowerCase().includes(query)
        const dateMatch = r.date.includes(query)
        const notesMatch = r.notes ? r.notes.toLowerCase().includes(query) : false
        const idMatch = r.person_id.toLowerCase().includes(query)

        if (!nameMatch && !statusMatch && !dateMatch && !notesMatch && !idMatch) {
          return false
        }
      }

      return true
    })
  }, [allRows, statusFilter, search])

  // 3. Group rows
  const groupedRows = useMemo(() => {
    if (groupBy === "none") return { __all__: filteredRows } as Record<string, typeof filteredRows>
    const groups = new Map<string, typeof filteredRows>()
    for (const r of filteredRows) {
      const key = groupBy === "person" ? `${r.name}` : r.date
      const rows = groups.get(key)
      if (rows) rows.push(r)
      else groups.set(key, [r])
    }
    return Object.fromEntries(
      [...groups].sort(([a], [b]) =>
        groupBy === "person" ? compareReportNames(a, b) : b.localeCompare(a),
      ),
    )
  }, [filteredRows, groupBy])

  const daysTracked = useMemo(() => {
    if (report?.summary?.total_working_days !== undefined) {
      return report.summary.total_working_days
    }
    const start = parseLocalDate(startDateStr)
    const end = parseLocalDate(endDateStr)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays
  }, [report, startDateStr, endDateStr])

  const finalColumns = useMemo(() => {
    const hasVisits =
      attendanceMode === "visits" ||
      sessions.some(
        (session) =>
          (session.visit_number || 1) > 1 || session.applied_schedule?.attendance_mode === "visits",
      )
    const hasWorkHours =
      attendanceMode === "work_hours" ||
      sessions.some((session) => session.applied_schedule?.attendance_mode === "work_hours")
    const hasDuration =
      hasVisits ||
      hasWorkHours ||
      sessions.some(
        (session) => Boolean(session.check_out_time) || typeof session.total_hours === "number",
      )
    const columns = ALL_COLUMNS.filter((column) => {
      if (column.key === "departure_status") return hasWorkHours
      if (column.key === "check_out_time" || column.key === "total_hours") return hasDuration
      return true
    })
    return hasVisits ? columns.concat(VISIT_COLUMN) : columns
  }, [attendanceMode, sessions])

  const unavailableColumns = useMemo(() => {
    const availableKeys = new Set(finalColumns.map((column) => column.key))
    return ALL_COLUMNS_WITH_VISITS.filter((column) => !availableKeys.has(column.key)).map(
      (column) => ({
        ...column,
        reason:
          column.key === "visit_number" ? "Only available in Visits mode."
          : column.key === "departure_status" ? "Only available in Time in & time out mode."
          : "Not recorded in Attendance mode.",
      }),
    )
  }, [finalColumns])

  return {
    filteredRows,
    groupedRows,
    daysTracked,
    allColumns: finalColumns,
    unavailableColumns,
  }
}

interface ReportColumn {
  key: ColumnKey
  label: string
  align: "left" | "center" | "right"
}

const ALL_COLUMNS: readonly ReportColumn[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "date", label: "Date", align: "left" },
  { key: "status", label: "Status", align: "center" },
  { key: "check_in_time", label: "Time in", align: "center" },
  { key: "check_out_time", label: "Time out", align: "center" },
  { key: "departure_status", label: "Departure", align: "center" },
  { key: "total_hours", label: "Total hours", align: "center" },
  { key: "late_minutes", label: "Late duration", align: "center" },
  { key: "notes", label: "Notes", align: "left" },
] as const

const VISIT_COLUMN: ReportColumn = {
  key: "visit_number",
  label: "Visit",
  align: "center",
}
const ALL_COLUMNS_WITH_VISITS: readonly ReportColumn[] = [...ALL_COLUMNS, VISIT_COLUMN]
