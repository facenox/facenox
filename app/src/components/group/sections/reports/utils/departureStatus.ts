import { parseLocalDate } from "@/utils"

export type DepartureStatus = "undertime" | "overtime"

export function getDepartureStatus(
  date: string,
  checkInTime: Date | string | undefined,
  checkOutTime: Date | string | undefined,
  scheduledEndTime: string | null | undefined,
): DepartureStatus | undefined {
  if (!checkInTime || !checkOutTime || !scheduledEndTime) return undefined

  const [hours, minutes] = scheduledEndTime.split(":").map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined

  const checkIn = new Date(checkInTime)
  const checkOut = new Date(checkOutTime)
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return undefined

  const end = parseLocalDate(date)
  end.setHours(hours, minutes, 0, 0)
  if (end <= checkIn) end.setDate(end.getDate() + 1)

  return (
    checkOut < end ? "undertime"
    : checkOut > end ? "overtime"
    : undefined
  )
}
