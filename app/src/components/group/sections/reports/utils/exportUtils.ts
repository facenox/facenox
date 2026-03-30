import type { RowData, ColumnKey } from "@/components/group/sections/reports/types"
import { parseLocalDate } from "@/utils"

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
