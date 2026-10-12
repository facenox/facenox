import type { AttendanceRecord } from "@/components/main/types"

export type AttendanceSortField = "time" | "name"
export type AttendanceSortOrder = "asc" | "desc"
export type AttendanceRecordScope = "today" | "yesterday" | "week" | "all"

interface ProcessAttendanceRecordsOptions {
  recentAttendance: AttendanceRecord[]
  displayNameMap: Map<string, string>
  recordScope: AttendanceRecordScope
  searchQuery: string
  sortField: AttendanceSortField
  sortOrder: AttendanceSortOrder
  today?: Date
}

export function processAttendanceRecords({
  recentAttendance,
  displayNameMap,
  recordScope,
  searchQuery,
  sortField,
  sortOrder,
  today = new Date(),
}: ProcessAttendanceRecordsOptions): AttendanceRecord[] {
  if (!recentAttendance.length) {
    return []
  }

  let filtered = [...recentAttendance]

  if (recordScope === "today") {
    const todayString = today.toDateString()
    filtered = filtered.filter((record) => record.timestamp.toDateString() === todayString)
  } else if (recordScope === "yesterday") {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayString = yesterday.toDateString()
    filtered = filtered.filter((record) => record.timestamp.toDateString() === yesterdayString)
  } else if (recordScope === "week") {
    // This week: Monday to today
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(today)
    endOfWeek.setHours(23, 59, 59, 999)

    filtered = filtered.filter((record) => {
      const recordTime = record.timestamp.getTime()
      return recordTime >= monday.getTime() && recordTime <= endOfWeek.getTime()
    })
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  if (normalizedQuery) {
    filtered = filtered.filter((record) => {
      const displayName = (displayNameMap.get(record.person_id) || "Member").toLowerCase()
      return displayName.includes(normalizedQuery)
    })
  }

  if (sortField === "time") {
    filtered.sort((a, b) => {
      const timeA = a.timestamp.getTime()
      const timeB = b.timestamp.getTime()
      return sortOrder === "asc" ? timeA - timeB : timeB - timeA
    })
  } else {
    const nameCache = new Map<string, string>()
    filtered.sort((a, b) => {
      let nameA = nameCache.get(a.person_id)
      if (!nameA) {
        nameA = (displayNameMap.get(a.person_id) || "Member").toLowerCase()
        nameCache.set(a.person_id, nameA)
      }

      let nameB = nameCache.get(b.person_id)
      if (!nameB) {
        nameB = (displayNameMap.get(b.person_id) || "Member").toLowerCase()
        nameCache.set(b.person_id, nameB)
      }

      const comparison = nameA.localeCompare(nameB)
      return sortOrder === "asc" ? comparison : -comparison
    })
  }

  return filtered
}

export function limitAttendanceRecords(
  processedRecords: AttendanceRecord[],
  displayLimit: number,
): AttendanceRecord[] {
  return processedRecords.slice(0, displayLimit)
}

export function buildRecordCheckInStatusMap(
  processedRecords: AttendanceRecord[],
): Map<string, boolean> {
  const checkedInSet = new Set<string>()
  const chronologicalRecords = [...processedRecords].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  const recordCheckInStatus = new Map<string, boolean>()

  chronologicalRecords.forEach((record) => {
    const personId = record.person_id
    const dateString = record.timestamp.toDateString()
    const key = `${personId}_${dateString}`

    if (!checkedInSet.has(key)) {
      checkedInSet.add(key)
      recordCheckInStatus.set(record.id, false)
    } else {
      recordCheckInStatus.set(record.id, true)
    }
  })

  return recordCheckInStatus
}
