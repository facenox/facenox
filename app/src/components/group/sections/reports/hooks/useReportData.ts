import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react"
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
  const queryKey = JSON.stringify([group.id, startDateStr, endDateStr])
  const [settledQueryKey, setSettledQueryKey] = useState<string | null>(null)
  const activeQueryRef = useRef(queryKey)
  const requestIdRef = useRef(0)

  // Invalidate older responses at commit, including the debounce before the next request.
  useLayoutEffect(() => {
    activeQueryRef.current = queryKey
    requestIdRef.current += 1
    setLoading(true)
    setSettledQueryKey(null)
    return () => {
      requestIdRef.current += 1
    }
  }, [queryKey])

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

  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const generateReport = useCallback(async () => {
    if (!isMountedRef.current || activeQueryRef.current !== queryKey) return
    const requestId = ++requestIdRef.current
    const isCurrentRequest = () =>
      isMountedRef.current &&
      requestId === requestIdRef.current &&
      activeQueryRef.current === queryKey
    const startDate = parseLocalDate(startDateStr)
    const endDate = parseLocalDate(endDateStr)

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate.getFullYear() < 2000 ||
      endDate.getFullYear() < 2000
    ) {
      if (isCurrentRequest()) {
        setError("Select a valid report date range.")
        setLoading(false)
        setSettledQueryKey(queryKey)
      }
      return
    }

    if (startDate > endDate) {
      if (isCurrentRequest()) {
        setError("The start date must be on or before the end date.")
        setLoading(false)
        setSettledQueryKey(queryKey)
      }
      return
    }

    setLoading(true)
    try {
      setError(null)

      const [generatedReport, loadedSessions, loadedMembers] = await Promise.all([
        attendanceManager.generateReport(group.id, startDate, endDate),
        attendanceManager.getSessions(
          {
            group_id: group.id,
            start_date: getLocalDateString(startDate),
            end_date: getLocalDateString(endDate),
          },
          { throwOnError: true },
        ),
        initialMembersRef.current.length > 0 ?
          Promise.resolve(initialMembersRef.current)
        : attendanceManager.getGroupMembers(group.id, { throwOnError: true }),
      ])
      if (!isCurrentRequest()) return
      setReport(generatedReport)
      setSessions(loadedSessions)
      setMembers(loadedMembers)
    } catch (err) {
      if (!isCurrentRequest()) return
      console.error("Error generating report:", err)
      setError(err instanceof Error ? err.message : "Failed to generate report")
    } finally {
      if (isCurrentRequest()) {
        setLoading(false)
        setSettledQueryKey(queryKey)
      }
    }
  }, [group.id, startDateStr, endDateStr, queryKey])

  return {
    report: settledQueryKey === queryKey ? report : null,
    sessions: settledQueryKey === queryKey ? sessions : [],
    members,
    loading: loading || settledQueryKey !== queryKey,
    error: settledQueryKey === queryKey ? error : null,
    generateReport,
  }
}
