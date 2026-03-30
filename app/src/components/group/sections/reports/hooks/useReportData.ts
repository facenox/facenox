import { useState, useCallback, useEffect } from "react"
import { attendanceManager } from "@/services"
import { getLocalDateString, parseLocalDate } from "@/utils"
import type {
  AttendanceGroup,
  AttendanceReport,
  AttendanceSession,
  AttendanceMember,
} from "@/types/recognition"

export function useReportData(
  group: AttendanceGroup,
  initialMembers: AttendanceMember[],
  startDateStr: string,
  endDateStr: string,
) {
  const [report, setReport] = useState<AttendanceReport | null>(null)
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [members, setMembers] = useState<AttendanceMember[]>(initialMembers)
  const [loading, setLoading] = useState(initialMembers.length > 0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Reset if group changes
    setReport(null)
    setSessions([])
    setMembers(initialMembers)
    setError(null)
    setLoading(initialMembers.length > 0)
  }, [group.id, initialMembers])

  const generateReport = useCallback(async () => {
    if (members.length === 0) {
      setLoading(false)
      return
    }

    const startDate = parseLocalDate(startDateStr)
    const endDate = parseLocalDate(endDateStr)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Please select valid report dates.")
      setLoading(false) // Make sure we stop loading
      return
    }

    if (startDate > endDate) {
      setError("The start date must be before the end date.")
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      setError(null)

      const [generatedReport, loadedSessions, loadedMembers] = await Promise.all([
        attendanceManager.generateReport(group.id, startDate, endDate),
        attendanceManager.getSessions({
          group_id: group.id,
          start_date: getLocalDateString(startDate),
          end_date: getLocalDateString(endDate),
        }),
        attendanceManager.getGroupMembers(group.id),
      ])
      setReport(generatedReport)
      setSessions(loadedSessions)
      setMembers(loadedMembers)
    } catch (err) {
      console.error("Error generating report:", err)
      setError(err instanceof Error ? err.message : "Failed to generate report")
    } finally {
      setLoading(false)
    }
  }, [group.id, startDateStr, endDateStr, members.length])

  return {
    report,
    sessions,
    members,
    loading,
    error,
    generateReport,
  }
}
