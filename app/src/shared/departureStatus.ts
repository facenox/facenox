import { attendanceDateTimeToDate } from "@/utils/attendanceTime"
import type { AttendanceSession } from "@/types/recognition"

export type DepartureStatus = "early" | "on_schedule" | "after_schedule"

export const DEPARTURE_LABELS: Record<DepartureStatus, string> = {
  early: "Left early",
  on_schedule: "On schedule",
  after_schedule: "Left after schedule",
}

function timeMinutes(value: string | null | undefined): number | undefined {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return undefined
  const [hours, minutes] = value.split(":").map(Number)
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : undefined
}

export function getDepartureStatus(
  date: string,
  checkInTime: Date | string | undefined,
  checkOutTime: Date | string | undefined,
  scheduledEndTime: string | null | undefined,
  timeZone?: string | null,
  scheduledStartTime?: string | null,
): DepartureStatus | undefined {
  if (!checkInTime || !checkOutTime || !scheduledEndTime) return undefined

  const endMinutes = timeMinutes(scheduledEndTime)
  const startMinutes = timeMinutes(scheduledStartTime)
  if (endMinutes === undefined) return undefined
  if (scheduledStartTime != null && (startMinutes === undefined || startMinutes === endMinutes)) {
    return undefined
  }

  const checkIn = new Date(checkInTime)
  const checkOut = new Date(checkOutTime)
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return undefined
  if (checkOut < checkIn) return undefined

  let end: Date
  try {
    end = attendanceDateTimeToDate(date, scheduledEndTime, timeZone)
    // A cross-midnight schedule is explicit. A daytime late arrival must
    // never shift its target to tomorrow. Early-morning overnight arrivals
    // use the end on their own attendance date.
    if (startMinutes !== undefined && endMinutes < startMinutes && checkIn > end) {
      const nextDate = new Date(`${date}T00:00:00Z`)
      nextDate.setUTCDate(nextDate.getUTCDate() + 1)
      end = attendanceDateTimeToDate(
        nextDate.toISOString().slice(0, 10),
        scheduledEndTime,
        timeZone,
      )
    }
  } catch {
    return undefined
  }

  const checkoutMinute = Math.floor(checkOut.getTime() / 60000)
  const endMinute = Math.floor(end.getTime() / 60000)
  return (
    checkoutMinute < endMinute ? "early"
    : checkoutMinute > endMinute ? "after_schedule"
    : "on_schedule"
  )
}

export function getSessionDepartureStatus(
  session: AttendanceSession | null | undefined,
  attendanceTimeZone?: string | null,
): DepartureStatus | undefined {
  const schedule = session?.applied_schedule
  if (!session || !schedule || schedule.attendance_mode !== "work_hours") return undefined
  if (timeMinutes(schedule.class_start_time) === undefined) return undefined
  return getDepartureStatus(
    session.date,
    session.check_in_time,
    session.check_out_time,
    schedule.class_end_time,
    session.check_in_time_timezone || session.check_out_time_timezone || attendanceTimeZone,
    schedule.class_start_time,
  )
}
