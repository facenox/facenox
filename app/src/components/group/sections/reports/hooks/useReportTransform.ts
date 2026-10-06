import { useMemo } from "react"
import {
  generateDateRange,
  createDisplayNameMap,
  parseLocalDate,
  getLocalDateString,
} from "@/utils"
import type {
  AttendanceSession,
  AttendanceMember,
  AttendanceGroup,
  AttendanceReport,
} from "@/types/recognition"
import type {
  RowData,
  GroupByKey,
  ReportStatusFilter,
} from "@/components/group/sections/reports/types"

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
) {
  // Build table rows from sessions + members
  const displayNameMap = useMemo(() => {
    return createDisplayNameMap(members)
  }, [members])

  // Create a map of sessions by person_id and date for quick lookup
  const sessionsMap = useMemo(() => {
    const map = new Map<string, AttendanceSession>()
    sessions.forEach((s) => {
      const key = `${s.person_id}_${s.date}`
      map.set(key, s)
    })
    return map
  }, [sessions])

  // 1. Generate base raw rows for the date range
  const allRows = useMemo(() => {
    const allDates = generateDateRange(startDateStr, endDateStr)
    const rows: RowData[] = []
    const todayStr = getLocalDateString()

    for (const member of members) {
      let memberJoinedStr: string | null = null
      const rawJoinedAt = member.joined_at as unknown
      if (rawJoinedAt instanceof Date) {
        memberJoinedStr = getLocalDateString(rawJoinedAt)
      } else if (typeof rawJoinedAt === "string") {
        memberJoinedStr = rawJoinedAt.split("T")[0]
      }

      for (const date of allDates) {
        const isBeforeJoined = Boolean(memberJoinedStr && date < memberJoinedStr)
        const isFutureDate = date > todayStr
        const shouldShowNoRecords = isBeforeJoined || isFutureDate

        const sessionKey = `${member.person_id}_${date}`
        const session = sessionsMap.get(sessionKey) || null
        const finalSession = shouldShowNoRecords ? null : session

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

        const isLate = Boolean(finalSession?.is_late)
        const lateMinutes = finalSession?.late_minutes || 0

        rows.push({
          person_id: member.person_id,
          name: displayNameMap.get(member.person_id) || member.name || "Unknown",
          date: date,
          check_in_time: finalSession?.check_in_time,
          check_out_time: finalSession?.check_out_time,
          total_hours: finalSession?.total_hours,
          status: status,
          is_late: isLate,
          late_minutes: lateMinutes,
          notes: finalSession?.notes || "",
          session: finalSession,
        })
      }
    }
    return rows
  }, [sessionsMap, members, displayNameMap, startDateStr, endDateStr])

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
    const groups: Record<string, typeof filteredRows> = {}
    for (const r of filteredRows) {
      const key = groupBy === "person" ? `${r.name}` : r.date
      if (!groups[key]) groups[key] = []
      groups[key].push(r)
    }
    return groups
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
    return ALL_COLUMNS
  }, [])

  return {
    filteredRows,
    groupedRows,
    daysTracked,
    allColumns: finalColumns,
  }
}

const ALL_COLUMNS = [
  { key: "name", label: "Name", align: "left" },
  { key: "date", label: "Date", align: "left" },
  { key: "status", label: "Status", align: "center" },
  { key: "check_in_time", label: "Time In", align: "center" },
  { key: "check_out_time", label: "Time Out", align: "center" },
  { key: "total_hours", label: "Total Hours", align: "center" },
  { key: "late_minutes", label: "Late (Mins)", align: "center" },
  { key: "notes", label: "Notes", align: "left" },
] as const
