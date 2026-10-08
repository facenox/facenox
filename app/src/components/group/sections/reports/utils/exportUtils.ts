import type { RowData, ColumnKey } from "@/components/group/sections/reports/types"
import {
  parseLocalDate,
  generateDateRange,
  createDisplayNameMap,
  getLocalDateString,
} from "@/utils"
import { attendanceManager } from "@/services/AttendanceManager"
import type { AttendanceGroup, AttendanceMember, AttendanceSession } from "@/types/recognition"

export function exportReportToCSV(
  groupedRows: Record<string, RowData[]>,
  visibleColumns: ColumnKey[],
  allColumns: readonly { key: ColumnKey; label: string }[],
  groupName: string,
  startDate: string,
  endDate: string,
) {
  try {
    const pad = (n: number, len = 2) => String(n).padStart(len, "0")
    const formatDateOnly = (d: Date): string => {
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
    }
    const formatTimeOnly = (d: Date): string => {
      const hours = d.getHours()
      const minutes = pad(d.getMinutes())
      const period = hours >= 12 ? "PM" : "AM"
      const displayHours = hours % 12 || 12
      return `${displayHours}:${minutes} ${period}`
    }

    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()

    const cols = allColumns.filter((c) => visibleColumns.includes(c.key))
    const header = cols.map((c) => c.label)
    const rows: string[][] = []
    Object.values(groupedRows).forEach((groupArr) => {
      groupArr.forEach((r) => {
        const row = cols.map((c) => {
          const v = r[c.key]

          if (c.key === "total_hours" && typeof v === "number") {
            const hrs = Math.floor(v)
            const mins = Math.round((v - hrs) * 60)
            return `${hrs > 0 ? `${hrs}h ` : ""}${mins > 0 || hrs === 0 ? `${mins}m` : ""}`.trim()
          }

          if (c.key === "date" && typeof v === "string") {
            return formatDateOnly(parseLocalDate(v))
          }

          if ((c.key === "check_in_time" || c.key === "check_out_time") && v instanceof Date) {
            return formatTimeOnly(v)
          }

          if (typeof v === "boolean") return v ? "true" : "false"
          if (typeof v === "number") return String(v)
          if (v instanceof Date) return formatDateOnly(v)
          return v ?? ""
        })
        rows.push(row)
      })
    })

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    let appended = false

    try {
      anchor.href = url

      const formatDateForFilename = (dateString: string): string => {
        const date = parseLocalDate(dateString)
        const month = date.toLocaleString("en-US", { month: "long" })
        const day = date.getDate()
        const year = date.getFullYear()
        return `${month} ${day}, ${year}`
      }

      const formattedStartDate = formatDateForFilename(startDate)
      const formattedEndDate = formatDateForFilename(endDate)

      const dateRange =
        startDate === endDate ? formattedStartDate : `${formattedStartDate} to ${formattedEndDate}`

      anchor.download = sanitizeFilename(`${groupName} (${dateRange}).csv`)
      document.body.appendChild(anchor)
      appended = true
      anchor.click()
    } finally {
      if (appended) {
        document.body.removeChild(anchor)
      }
      URL.revokeObjectURL(url)
    }
    return { success: true }
  } catch (err) {
    console.error("Error exporting view:", err)
    return { success: false, error: err }
  }
}

export async function exportAllGroupsReportToCSV(
  groups: AttendanceGroup[],
  startDate: string,
  endDate: string,
) {
  try {
    const pad = (n: number, len = 2) => String(n).padStart(len, "0")
    const formatDateOnly = (d: Date): string => {
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
    }
    const formatTimeOnly = (d: Date): string => {
      const hours = d.getHours()
      const minutes = pad(d.getMinutes())
      const period = hours >= 12 ? "PM" : "AM"
      const displayHours = hours % 12 || 12
      return `${displayHours}:${minutes} ${period}`
    }
    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()

    const allDates = generateDateRange(startDate, endDate)
    const todayStr = getLocalDateString()

    const header = [
      "Group",
      "Name",
      "Date",
      "Status",
      "Time In",
      "Time Out",
      "Total Hours",
      "Late (Mins)",
      "Notes",
    ]

    const rows: string[][] = []

    const validGroups = groups.filter((g) => g.id !== "all")
    const groupDataPromises = validGroups.map(async (group) => {
      const [members, sessions] = await Promise.all([
        attendanceManager.getGroupMembers(group.id).catch(() => [] as AttendanceMember[]),
        attendanceManager
          .getSessions({
            group_id: group.id,
            start_date: startDate,
            end_date: endDate,
          })
          .catch(() => [] as AttendanceSession[]),
      ])
      return { group, members, sessions }
    })

    const groupResults = await Promise.all(groupDataPromises)

    for (const { group, members, sessions } of groupResults) {
      if (!members || members.length === 0) continue

      const displayNameMap = createDisplayNameMap(members)
      const sessionsMap = new Map<string, AttendanceSession>()
      sessions.forEach((s) => {
        sessionsMap.set(`${s.person_id}_${s.date}`, s)
      })

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

          let status = ""
          if (shouldShowNoRecords) {
            status = "No Records"
          } else if (!finalSession) {
            status = "Absent"
          } else if (finalSession.is_late) {
            status = "Late"
          } else {
            status =
              finalSession.status ?
                finalSession.status.charAt(0).toUpperCase() + finalSession.status.slice(1)
              : "Present"
          }

          let timeIn = ""
          if (finalSession?.check_in_time) {
            const d =
              finalSession.check_in_time instanceof Date ?
                finalSession.check_in_time
              : new Date(finalSession.check_in_time)
            if (!isNaN(d.getTime())) timeIn = formatTimeOnly(d)
          }

          let timeOut = ""
          if (finalSession?.check_out_time) {
            const d =
              finalSession.check_out_time instanceof Date ?
                finalSession.check_out_time
              : new Date(finalSession.check_out_time)
            if (!isNaN(d.getTime())) timeOut = formatTimeOnly(d)
          }

          let totalHoursStr = ""
          if (typeof finalSession?.total_hours === "number") {
            const hrs = Math.floor(finalSession.total_hours)
            const mins = Math.round((finalSession.total_hours - hrs) * 60)
            totalHoursStr =
              `${hrs > 0 ? `${hrs}h ` : ""}${mins > 0 || hrs === 0 ? `${mins}m` : ""}`.trim()
          }

          const lateMinutesStr = finalSession?.late_minutes ? String(finalSession.late_minutes) : ""
          const notesStr = finalSession?.notes || ""

          rows.push([
            group.name,
            displayNameMap.get(member.person_id) || member.name || "Unknown",
            formatDateOnly(parseLocalDate(date)),
            status,
            timeIn,
            timeOut,
            totalHoursStr,
            lateMinutesStr,
            notesStr,
          ])
        }
      }
    }

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    let appended = false

    try {
      anchor.href = url
      const formatDateForFilename = (dateString: string): string => {
        const date = parseLocalDate(dateString)
        const month = date.toLocaleString("en-US", { month: "long" })
        const day = date.getDate()
        const year = date.getFullYear()
        return `${month} ${day}, ${year}`
      }

      const formattedStartDate = formatDateForFilename(startDate)
      const formattedEndDate = formatDateForFilename(endDate)
      const dateRange =
        startDate === endDate ? formattedStartDate : `${formattedStartDate} to ${formattedEndDate}`

      anchor.download = sanitizeFilename(`All Groups Attendance (${dateRange}).csv`)
      document.body.appendChild(anchor)
      appended = true
      anchor.click()
    } finally {
      if (appended) {
        document.body.removeChild(anchor)
      }
      URL.revokeObjectURL(url)
    }
    return { success: true }
  } catch (err) {
    console.error("Error exporting all groups report:", err)
    return { success: false, error: err }
  }
}
