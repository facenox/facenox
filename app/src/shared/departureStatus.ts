import { attendanceDateTimeToDate } from "@/utils/attendanceTime"

export type DepartureStatus = "undertime" | "overtime"

export function getDepartureStatus(
  date: string,
  checkInTime: Date | string | undefined,
  checkOutTime: Date | string | undefined,
  scheduledEndTime: string | null | undefined,
  timeZone?: string | null,
): DepartureStatus | undefined {
  if (!checkInTime || !checkOutTime || !scheduledEndTime) return undefined

  const [hours, minutes] = scheduledEndTime.split(":").map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined

  const checkIn = new Date(checkInTime)
  const checkOut = new Date(checkOutTime)
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return undefined

  let end: Date
  try {
    end = attendanceDateTimeToDate(date, scheduledEndTime, timeZone)
    if (end <= checkIn) {
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

  return (
    checkOut < end ? "undertime"
    : checkOut > end ? "overtime"
    : undefined
  )
}
