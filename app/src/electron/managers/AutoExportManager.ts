import { app, Notification, powerSaveBlocker } from "electron"
import path from "node:path"
import fs from "node:fs/promises"
import { backendService } from "../backendService.js"
import { persistentStore } from "../persistentStore.js"
import { withLocalBackendHeaders } from "../localBackendScope.js"

export interface AutoExportConfig {
  enabled: boolean
  time: string
  directory: string
  format: "excel_workbook" | "individual_csvs" | "combined_csv"
  lastExportedDate: string | null
}

export interface GroupRecord {
  id: string
  name: string
  is_active?: boolean
  is_deleted?: boolean
}

export interface MemberRecord {
  id: string
  person_id: string
  name: string
  group_id: string
}

export interface SessionRecord {
  id: string
  person_id: string
  group_id: string
  date: string
  check_in_time?: string | Date | null
  check_out_time?: string | Date | null
  total_hours?: number | null
  is_late?: boolean
  late_minutes?: number | null
  status?: string | null
  notes?: string | null
}

export interface ProcessedGroupData {
  group: GroupRecord
  header: string[]
  rows: string[][]
}

function authHeaders(extra: Record<string, string> = {}) {
  const token = backendService.getToken()
  return withLocalBackendHeaders(token ? { "X-Facenox-Token": token, ...extra } : { ...extra })
}

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function padZero(n: number, len = 2): string {
  return String(n).padStart(len, "0")
}

function formatLocalDate(d: Date): string {
  return `${padZero(d.getMonth() + 1)}/${padZero(d.getDate())}/${d.getFullYear()}`
}

function formatTimeOnly(d: Date): string {
  const hours = d.getHours()
  const minutes = padZero(d.getMinutes())
  const period = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes} ${period}`
}

function getTodayLocalDateString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`
}

function getCurrentTimeHHMM(): string {
  const now = new Date()
  return `${padZero(now.getHours())}:${padZero(now.getMinutes())}`
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim()
}

export class AutoExportManager {
  private timer: NodeJS.Timeout | null = null
  private isExporting = false

  public getConfig(): AutoExportConfig {
    const raw = persistentStore.get("autoExport") as AutoExportConfig | undefined
    return {
      enabled: raw?.enabled ?? false,
      time: raw?.time ?? "17:00",
      directory: raw?.directory ?? "",
      format: raw?.format ?? "excel_workbook",
      lastExportedDate: raw?.lastExportedDate ?? null,
    }
  }

  public updateConfig(updates: Partial<AutoExportConfig>): AutoExportConfig {
    const current = this.getConfig()
    const updated = { ...current, ...updates }
    persistentStore.set("autoExport", updated)
    return updated
  }

  public getDefaultExportDirectory(): string {
    return path.join(app.getPath("documents"), "FaceNox_Reports")
  }

  public start(): void {
    if (this.timer) {
      clearInterval(this.timer)
    }

    // Check every 60 seconds
    this.timer = setInterval(() => {
      void this.checkAndRunExport()
    }, 60000)

    // Initial check on start
    void this.checkAndRunExport()
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  public async checkAndRunExport(): Promise<boolean> {
    const config = this.getConfig()
    if (!config.enabled) return false
    if (this.isExporting) return false

    const today = getTodayLocalDateString()
    const currentTime = getCurrentTimeHHMM()

    // Trigger if currentTime >= scheduled time and hasn't exported for today yet
    if (currentTime >= config.time && config.lastExportedDate !== today) {
      return this.triggerExport(today)
    }

    return false
  }

  public async triggerExport(targetDate?: string): Promise<boolean> {
    if (this.isExporting) return false
    this.isExporting = true

    const blockerId = powerSaveBlocker.start("prevent-app-suspension")
    const dateToExport = targetDate || getTodayLocalDateString()

    try {
      const config = this.getConfig()
      const targetDir = config.directory?.trim() || this.getDefaultExportDirectory()

      await fs.mkdir(targetDir, { recursive: true })

      const processedGroups = await this.fetchAndProcessAttendance(dateToExport)
      if (processedGroups.length === 0) {
        console.warn("[AutoExportManager] No groups or records found to export.")
        this.updateConfig({ lastExportedDate: dateToExport })
        return true
      }

      await this.writeExportFiles(processedGroups, dateToExport, config.format, targetDir)

      this.updateConfig({ lastExportedDate: dateToExport })

      if (Notification.isSupported()) {
        new Notification({
          title: "FaceNox Daily Report Exported",
          body: `Attendance for ${dateToExport} saved to ${path.basename(targetDir)}.`,
          silent: false,
        }).show()
      }

      return true
    } catch (err) {
      console.error("[AutoExportManager] Error during auto export:", err)
      return false
    } finally {
      if (powerSaveBlocker.isStarted(blockerId)) {
        powerSaveBlocker.stop(blockerId)
      }
      this.isExporting = false
    }
  }

  private async fetchAndProcessAttendance(dateStr: string): Promise<ProcessedGroupData[]> {
    const backendUrl = backendService.getUrl()
    if (!backendUrl) return []

    // 1. Fetch active groups
    const groupsRes = await fetch(`${backendUrl}/attendance/groups`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    })
    if (!groupsRes.ok) return []

    const allGroups = ((await groupsRes.json()) as GroupRecord[]) || []
    const activeGroups = allGroups.filter((g) => !g.is_deleted && g.is_active !== false)

    const processedList: ProcessedGroupData[] = []

    for (const group of activeGroups) {
      try {
        // Fetch members for this group
        const membersRes = await fetch(`${backendUrl}/attendance/groups/${group.id}/members`, {
          headers: authHeaders(),
          signal: AbortSignal.timeout(15000),
        })
        const members = membersRes.ok ? ((await membersRes.json()) as MemberRecord[]) || [] : []

        // Fetch sessions for this group on target date
        const sessionsRes = await fetch(
          `${backendUrl}/attendance/sessions?group_id=${group.id}&start_date=${dateStr}&end_date=${dateStr}`,
          {
            headers: authHeaders(),
            signal: AbortSignal.timeout(15000),
          },
        )
        const sessions = sessionsRes.ok ? ((await sessionsRes.json()) as SessionRecord[]) || [] : []

        const sessionMap = new Map<string, SessionRecord>()
        for (const s of sessions) {
          sessionMap.set(s.person_id, s)
        }

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
          const session = sessionMap.get(member.person_id)

          let status = "Absent"
          if (session) {
            if (session.is_late) {
              status = "Late"
            } else if (session.status) {
              status = session.status.charAt(0).toUpperCase() + session.status.slice(1)
            } else {
              status = "Present"
            }
          }

          let timeIn = ""
          if (session?.check_in_time) {
            const d = new Date(session.check_in_time)
            if (!isNaN(d.getTime())) timeIn = formatTimeOnly(d)
          }

          let timeOut = ""
          if (session?.check_out_time) {
            const d = new Date(session.check_out_time)
            if (!isNaN(d.getTime())) timeOut = formatTimeOnly(d)
          }

          let totalHoursStr = ""
          if (typeof session?.total_hours === "number") {
            const hrs = Math.floor(session.total_hours)
            const mins = Math.round((session.total_hours - hrs) * 60)
            totalHoursStr =
              `${hrs > 0 ? `${hrs}h ` : ""}${mins > 0 || hrs === 0 ? `${mins}m` : ""}`.trim()
          }

          const lateMinutesStr = session?.late_minutes ? String(session.late_minutes) : ""
          const notesStr = session?.notes || ""

          rows.push([
            member.name || "Unknown",
            formatLocalDate(new Date(`${dateStr}T00:00:00`)),
            status,
            timeIn,
            timeOut,
            totalHoursStr,
            lateMinutesStr,
            notesStr,
          ])
        }

        processedList.push({ group, header, rows })
      } catch (err) {
        console.error(`[AutoExportManager] Error processing group ${group.name}:`, err)
      }
    }

    return processedList
  }

  private async writeExportFiles(
    processedGroups: ProcessedGroupData[],
    dateStr: string,
    format: AutoExportConfig["format"],
    targetDir: string,
  ): Promise<void> {
    if (format === "excel_workbook") {
      const xmlContent = this.buildExcelXml(processedGroups)
      const filename = sanitizeFilename(`All Groups Attendance (${dateStr}).xls`)
      const filePath = path.join(targetDir, filename)
      await fs.writeFile(filePath, xmlContent, "utf8")
    } else if (format === "individual_csvs") {
      for (const { group, header, rows } of processedGroups) {
        const csvContent = [header, ...rows]
          .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
          .join("\n")
        const filename = sanitizeFilename(`${group.name} - Attendance (${dateStr}).csv`)
        const filePath = path.join(targetDir, filename)
        await fs.writeFile(filePath, csvContent, "utf8")
      }
    } else {
      // Combined flat CSV
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
      const filename = sanitizeFilename(`All Groups Combined Attendance (${dateStr}).csv`)
      const filePath = path.join(targetDir, filename)
      await fs.writeFile(filePath, csvContent, "utf8")
    }
  }

  private buildExcelXml(processedGroups: ProcessedGroupData[]): string {
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

    return `<?xml version="1.0" encoding="UTF-8"?>
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
  }
}

export const autoExportManager = new AutoExportManager()
