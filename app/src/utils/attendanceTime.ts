type AttendanceTimeValue = Date | string | null | undefined

function partsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

export function formatAttendanceTime(value: AttendanceTimeValue, timeZone?: string | null) {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  try {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    })
  } catch {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }
}

export function getAttendanceDateString(
  value: Date = new Date(),
  timeZone?: string | null,
): string {
  if (!timeZone) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
  }

  try {
    const parts = partsInTimeZone(value, timeZone)
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
  } catch {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
  }
}

export function addAttendanceDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new Error("Invalid attendance date")
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getAttendanceWeekStart(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new Error("Invalid attendance date")
  return addAttendanceDays(dateString, -((date.getUTCDay() + 6) % 7))
}

export function formatAttendanceDate(value: AttendanceTimeValue, timeZone?: string | null): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  try {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    })
  } catch {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }
}

export function formatAttendanceTimeInput(value: AttendanceTimeValue, timeZone?: string | null) {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  if (!timeZone) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  }

  try {
    const parts = partsInTimeZone(date, timeZone)
    return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
  } catch {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  }
}

export function attendanceDateTimeToDate(
  dateString: string,
  timeString: string,
  timeZone?: string | null,
) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeString)
  if (!dateMatch || !timeMatch) throw new Error("Invalid attendance date or time")

  const desired = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  }
  if (desired.hour > 23 || desired.minute > 59) throw new Error("Invalid attendance time")

  if (!timeZone) {
    return new Date(
      desired.year,
      desired.month - 1,
      desired.day,
      desired.hour,
      desired.minute,
      0,
      0,
    )
  }

  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  )
  let instant = desiredAsUtc

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = partsInTimeZone(new Date(instant), timeZone)
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    )
    const correction = desiredAsUtc - actualAsUtc
    instant += correction
    if (correction === 0) break
  }

  const result = new Date(instant)
  const resolved = partsInTimeZone(result, timeZone)
  if (
    resolved.year !== desired.year ||
    resolved.month !== desired.month ||
    resolved.day !== desired.day ||
    resolved.hour !== desired.hour ||
    resolved.minute !== desired.minute
  ) {
    throw new Error("This local time does not exist in the attendance timezone")
  }
  return result
}
