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
): Promise<ProcessedGroupReportData[]> {
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

  const allDates = generateDateRange(startDate, endDate)
  const todayStr = getLocalDateString()

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
  const processedGroups: ProcessedGroupReportData[] = []

  for (const { group, members, sessions } of groupResults) {
    if (!members || members.length === 0) continue

    const displayNameMap = createDisplayNameMap(members)
    const sessionsMap = new Map<string, AttendanceSession>()
    sessions.forEach((s) => {
      sessionsMap.set(`${s.person_id}_${s.date}`, s)
    })

    const header = [
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

        let status: string
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

    processedGroups.push({ group, header, rows })
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
) {
  try {
    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()
    const processedGroups = await fetchAllGroupsProcessedData(groups, startDate, endDate)
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
) {
  try {
    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()
    const processedGroups = await fetchAllGroupsProcessedData(groups, startDate, endDate)
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
) {
  try {
    const sanitizeFilename = (name: string): string => name.replace(/[\\/:*?"<>|]/g, "_").trim()
    const processedGroups = await fetchAllGroupsProcessedData(groups, startDate, endDate)

    const combinedHeader = [
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

    const combinedRows: string[][] = []
    for (const { group, rows } of processedGroups) {
      for (const row of rows) {
        combinedRows.push([group.name, ...row])
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
