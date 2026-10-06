import { useState, useCallback, useEffect, useRef } from "react"
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const initialMembersRef = useRef(initialMembers)
  useEffect(() => {
    initialMembersRef.current = initialMembers
  }, [initialMembers])

  // Reset report state only when the active group changes
  useEffect(() => {
    setReport(null)
    setSessions([])
    setMembers(initialMembersRef.current)
    setError(null)
    setLoading(true)
  }, [group.id])

  // Sync local members list when background hydration completes or changes reference
  useEffect(() => {
    if (initialMembers.length > 0) {
      setMembers(initialMembers)
    }
  }, [initialMembers])

  const generateReport = useCallback(async () => {
    const startDate = parseLocalDate(startDateStr)
    const endDate = parseLocalDate(endDateStr)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      setError("Please select valid report dates.")
      setLoading(false)
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
        initialMembersRef.current.length > 0 ?
          Promise.resolve(initialMembersRef.current)
        : attendanceManager.getGroupMembers(group.id),
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
  }, [group.id, startDateStr, endDateStr])

  return {
    report,
    sessions,
    members,
    loading,
    error,
    generateReport,
  }
}
