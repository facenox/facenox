import type { RowData, ColumnKey } from "@/components/group/sections/reports/types"
import { parseLocalDate, generateDateRange, createDisplayNameMap, formatDuration } from "@/utils"
import { attendanceManager } from "@/services/AttendanceManager"
import type { AttendanceGroup, AttendanceSession } from "@/types/recognition"
import { DEPARTURE_LABELS, getSessionDepartureStatus } from "@/shared/departureStatus"
import { formatAttendanceTime, getAttendanceDateString } from "@/utils/attendanceTime"
import { compareReportRows } from "./reportOrdering"

export function exportReportToCSV(
  groupedRows: Record<string, RowData[]>,
  visibleColumns: ColumnKey[],
  allColumns: readonly { key: ColumnKey; label: string }[],
  groupName: string,
  startDate: string,
  endDate: string,
  attendanceTimeZone?: string | null,
) {
  try {
    const pad = (n: number, len = 2) => String(n).padStart(len, "0")
    const formatDateOnly = (d: Date): string => {
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
    }
    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()

    const cols = allColumns.filter((c) => visibleColumns.includes(c.key))
    // CSV lateness remains numeric minutes, unlike the table's formatted duration.
    const header = cols.map((c) => (c.key === "late_minutes" ? "Late (mins)" : c.label))
    const rows: string[][] = []
    Object.values(groupedRows).forEach((groupArr) => {
      groupArr.forEach((r) => {
        const row = cols.map((c) => {
          const v = r[c.key]

          if (c.key === "total_hours" && typeof v === "number") {
            return formatDuration(Math.round(v * 60))
          }

          if (c.key === "departure_status") {
            return r.departure_status ? DEPARTURE_LABELS[r.departure_status] : ""
          }

          if (c.key === "date" && typeof v === "string") {
            return formatDateOnly(parseLocalDate(v))
          }

          if ((c.key === "check_in_time" || c.key === "check_out_time") && v instanceof Date) {
            const capturedTimeZone =
              c.key === "check_in_time" ?
                r.session?.check_in_time_timezone
              : r.session?.check_out_time_timezone
            return formatAttendanceTime(v, capturedTimeZone || attendanceTimeZone)
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

interface ProcessedGroupReportData {
  group: AttendanceGroup
  header: string[]
  rows: string[][]
}

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  let appended = false
  try {
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    appended = true
    anchor.click()
  } finally {
    if (appended) {
      document.body.removeChild(anchor)
    }
    URL.revokeObjectURL(url)
  }
}

function formatDateForFilename(dateString: string): string {
  const date = parseLocalDate(dateString)
  const month = date.toLocaleString("en-US", { month: "long" })
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month} ${day}, ${year}`
}

function getDateRangeFilenameLabel(startDate: string, endDate: string): string {
  const formattedStartDate = formatDateForFilename(startDate)
  const formattedEndDate = formatDateForFilename(endDate)
  return startDate === endDate ? formattedStartDate : `${formattedStartDate} to ${formattedEndDate}`
}

async function fetchAllGroupsProcessedData(
  groups: AttendanceGroup[],
  startDate: string,
  endDate: string,
  attendanceTimeZone?: string | null,
): Promise<ProcessedGroupReportData[]> {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0")
  const formatDateOnly = (d: Date): string => {
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
  }
  const allDates = generateDateRange(startDate, endDate)
  const todayStr = getAttendanceDateString(new Date(), attendanceTimeZone)

  const validGroups = groups.filter((g) => g.id !== "all")
  const groupDataPromises = validGroups.map(async (group) => {
    const [members, sessions] = await Promise.all([
      attendanceManager.getGroupMembers(group.id, { throwOnError: true }),
      attendanceManager.getSessions(
        {
          group_id: group.id,
          start_date: startDate,
          end_date: endDate,
        },
        { throwOnError: true },
      ),
    ])
    return { group, members, sessions }
  })

  const groupResults = await Promise.all(groupDataPromises)
  const processedGroups: ProcessedGroupReportData[] = []

  for (const { group, members, sessions } of groupResults) {
    if (!members || members.length === 0) continue

    const displayNameMap = createDisplayNameMap(members)
    const sessionsMap = new Map<string, AttendanceSession[]>()
    sessions.forEach((s) => {
      const key = `${s.person_id}_${s.date}`
      sessionsMap.set(key, [...(sessionsMap.get(key) || []), s])
    })

    const header = [
      "Name",
      "Date",
      ...(group.settings?.attendance_mode === "visits" ? ["Visit"] : []),
      "Status",
      "Time in",
      "Time out",
      "Departure",
      "Total hours",
      "Late (mins)",
      "Notes",
    ]
    const orderedRows: {
      date: string
      name: string
      person_id: string
      visit_number: number
      cells: string[]
    }[] = []

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
        const finalSession = sessionsForDate[0] || null

        const sessionsToExport =
          group.settings?.attendance_mode === "visits" && sessionsForDate.length > 0 ?
            sessionsForDate
          : [finalSession]

        for (const sessionToExport of sessionsToExport) {
          const exportSession = sessionToExport

          let status: string
          if (shouldShowNoRecords) {
            status = "No Records"
          } else if (!exportSession) {
            status = "Absent"
          } else if (exportSession.is_late) {
            status = "Late"
          } else {
            status =
              exportSession.status ?
                exportSession.status.charAt(0).toUpperCase() + exportSession.status.slice(1)
              : "Present"
          }

          let timeIn = ""
          if (exportSession?.check_in_time) {
            const d =
              exportSession.check_in_time instanceof Date ?
                exportSession.check_in_time
              : new Date(exportSession.check_in_time)
            if (!isNaN(d.getTime())) {
              timeIn = formatAttendanceTime(
                d,
                exportSession.check_in_time_timezone || attendanceTimeZone,
              )
            }
          }

          let timeOut = ""
          if (exportSession?.check_out_time) {
            const d =
              exportSession.check_out_time instanceof Date ?
                exportSession.check_out_time
              : new Date(exportSession.check_out_time)
            if (!isNaN(d.getTime())) {
              timeOut = formatAttendanceTime(
                d,
                exportSession.check_out_time_timezone || attendanceTimeZone,
              )
            }
          }

          let totalHoursStr = ""
          if (typeof exportSession?.total_hours === "number") {
            totalHoursStr = formatDuration(Math.round(exportSession.total_hours * 60))
          }

          const lateMinutesStr =
            exportSession?.late_minutes ? String(exportSession.late_minutes) : ""
          const departureStatus = getSessionDepartureStatus(exportSession, attendanceTimeZone)
          const notesStr = exportSession?.notes || ""

          const name = displayNameMap.get(member.person_id) || member.name || "Member"
          orderedRows.push({
            date,
            name,
            person_id: member.person_id,
            visit_number: exportSession?.visit_number || 1,
            cells: [
              name,
              formatDateOnly(parseLocalDate(date)),
              ...(group.settings?.attendance_mode === "visits" ?
                [exportSession ? String(exportSession.visit_number || 1) : ""]
              : []),
              status,
              timeIn,
              timeOut,
              departureStatus ? DEPARTURE_LABELS[departureStatus] : "",
              totalHoursStr,
              lateMinutesStr,
              notesStr,
            ],
          })
        }
      }
    }

    processedGroups.push({
      group,
      header,
      rows: orderedRows.sort(compareReportRows).map((row) => row.cells),
    })
  }

  return processedGroups
}

/**
 * Exports all groups into a multi-sheet Excel workbook (SpreadsheetML XML).
 * Opens directly in Microsoft Excel, Apple Numbers, LibreOffice, and Google Sheets with separate tabs.
 */
export async function exportAllGroupsReportToExcel(
  groups: AttendanceGroup[],
  startDate: string,
  endDate: string,
  attendanceTimeZone?: string | null,
) {
  try {
    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()
    const processedGroups = await fetchAllGroupsProcessedData(
      groups,
      startDate,
      endDate,
      attendanceTimeZone,
    )
    if (processedGroups.length === 0) return { success: true }

    const usedSheetNames = new Set<string>()
    const worksheetsXml = processedGroups
      .map(({ group, header, rows }) => {
        const cleanName =
          group.name
            .replace(/[\\/?*:[\]]/g, "_")
            .trim()
            .slice(0, 31) || "Group"
        let uniqueName = cleanName
        let counter = 1
        while (usedSheetNames.has(uniqueName.toLowerCase())) {
          const suffix = ` (${counter})`
          uniqueName = `${cleanName.slice(0, 31 - suffix.length)}${suffix}`
          counter++
        }
        usedSheetNames.add(uniqueName.toLowerCase())

        const headerRowXml = `   <Row ss:StyleID="Header">
${header.map((h) => `    <Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("\n")}
   </Row>`

        const dataRowsXml = rows
          .map(
            (row) => `   <Row>
${row.map((cell) => `    <Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("\n")}
   </Row>`,
          )
          .join("\n")

        return ` <Worksheet ss:Name="${escapeXml(uniqueName)}">
  <Table>
   <Column ss:Width="160"/>
   <Column ss:Width="95"/>
   <Column ss:Width="90"/>
   <Column ss:Width="85"/>
   <Column ss:Width="85"/>
   <Column ss:Width="95"/>
   <Column ss:Width="85"/>
   <Column ss:Width="180"/>
${headerRowXml}
${dataRowsXml}
  </Table>
 </Worksheet>`
      })
      .join("\n")

    const excelXml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9D9D9"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
  </Style>
 </Styles>
${worksheetsXml}
</Workbook>`

    const dateRange = getDateRangeFilenameLabel(startDate, endDate)
    const filename = sanitizeFilename(`All Groups Attendance (${dateRange}).xls`)
    const blob = new Blob([excelXml], { type: "application/vnd.ms-excel;charset=utf-8" })
    triggerDownload(blob, filename)
    return { success: true }
  } catch (err) {
    console.error("Error exporting all groups to Excel:", err)
    return { success: false, error: err }
  }
}

/**
 * Exports each group as a separate CSV file download.
 */
export async function exportAllGroupsReportToIndividualCSVs(
  groups: AttendanceGroup[],
  startDate: string,
  endDate: string,
  attendanceTimeZone?: string | null,
) {
  try {
    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()
    const processedGroups = await fetchAllGroupsProcessedData(
      groups,
      startDate,
      endDate,
      attendanceTimeZone,
    )
    const dateRange = getDateRangeFilenameLabel(startDate, endDate)

    for (let i = 0; i < processedGroups.length; i++) {
      const { group, header, rows } = processedGroups[i]
      const csvContent = [header, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n")

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const filename = sanitizeFilename(`${group.name} - Attendance (${dateRange}).csv`)

      // Small delay between multiple browser downloads to prevent browser throttling
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 200))
      }
      triggerDownload(blob, filename)
    }

    return { success: true }
  } catch (err) {
    console.error("Error exporting individual group CSVs:", err)
    return { success: false, error: err }
  }
}

/**
 * Exports all groups into a single combined CSV with a Group column.
 */
export async function exportAllGroupsReportToCSV(
  groups: AttendanceGroup[],
  startDate: string,
  endDate: string,
  attendanceTimeZone?: string | null,
) {
  try {
    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()
    const processedGroups = await fetchAllGroupsProcessedData(
      groups,
      startDate,
      endDate,
      attendanceTimeZone,
    )

    const combinedHeader = [
      "Group",
      "Name",
      "Date",
      "Visit",
      "Status",
      "Time in",
      "Time out",
      "Departure",
      "Total hours",
      "Late (mins)",
      "Notes",
    ]

    const combinedRows: string[][] = []
    for (const { group, header, rows } of processedGroups) {
      const columnIndexes = combinedHeader.slice(1).map((label) => header.indexOf(label))
      for (const row of rows) {
        combinedRows.push([
          group.name,
          ...columnIndexes.map((index) => (index >= 0 ? row[index] : "")),
        ])
      }
    }

    const csvContent = [combinedHeader, ...combinedRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const dateRange = getDateRangeFilenameLabel(startDate, endDate)
    const filename = sanitizeFilename(`All Groups Combined Attendance (${dateRange}).csv`)
    triggerDownload(blob, filename)
    return { success: true }
  } catch (err) {
    console.error("Error exporting all groups report:", err)
    return { success: false, error: err }
  }
}
