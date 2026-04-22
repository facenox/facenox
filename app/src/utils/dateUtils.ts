export const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const parseLocalDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export const generateDateRange = (startDate: Date | string, endDate: Date | string): string[] => {
  const start = typeof startDate === "string" ? parseLocalDate(startDate) : startDate
  const end = typeof endDate === "string" ? parseLocalDate(endDate) : endDate

  const dates: string[] = []
  const current = new Date(start)
  current.setHours(0, 0, 0, 0)
  const endDateObj = new Date(end)
  endDateObj.setHours(0, 0, 0, 0)

  while (current <= endDateObj) {
    dates.push(getLocalDateString(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

/**
 * Formats a duration in minutes into a human-readable string (e.g., "8h 25m" or "45m").
 */
export const formatDuration = (totalMinutes: number): string => {
  if (totalMinutes < 60) return `${totalMinutes}m`
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
