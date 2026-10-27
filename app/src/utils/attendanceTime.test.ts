import { describe, expect, it } from "vitest"
import {
  addAttendanceDays,
  attendanceDateTimeToDate,
  formatAttendanceTimeInput,
  getAttendanceDateString,
  getAttendanceWeekStart,
} from "./attendanceTime"

describe("attendance time zone helpers", () => {
  it("formats the same instant in the captured attendance timezone", () => {
    const instant = new Date("2026-01-15T13:30:00.000Z")

    expect(formatAttendanceTimeInput(instant, "America/Toronto")).toBe("08:30")
    expect(formatAttendanceTimeInput(instant, "Asia/Manila")).toBe("21:30")
  })

  it("converts attendance wall time to the correct instant across DST", () => {
    expect(attendanceDateTimeToDate("2026-01-15", "08:30", "America/Toronto").toISOString()).toBe(
      "2026-01-15T13:30:00.000Z",
    )
    expect(attendanceDateTimeToDate("2026-07-15", "08:30", "America/Toronto").toISOString()).toBe(
      "2026-07-15T12:30:00.000Z",
    )
  })

  it("rejects a local time skipped by a DST transition", () => {
    expect(() => attendanceDateTimeToDate("2026-03-08", "02:30", "America/Toronto")).toThrow(
      "does not exist",
    )
  })

  it("derives calendar dates from the attendance timezone", () => {
    const instant = new Date("2026-01-01T02:00:00.000Z")

    expect(getAttendanceDateString(instant, "America/Toronto")).toBe("2025-12-31")
    expect(addAttendanceDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(getAttendanceWeekStart("2026-10-27")).toBe("2026-10-26")
  })
})
