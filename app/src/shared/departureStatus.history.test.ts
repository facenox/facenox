import { renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { getDepartureStatus } from "./departureStatus"
import { formatAttendanceTime } from "@/utils/attendanceTime"
import { useReportTransform } from "@/components/group/sections/reports/hooks/useReportTransform"
import {
  createAttendanceGroup,
  createAttendanceMember,
  createAttendanceSession,
} from "@/test/fixtures"

afterEach(() => {
  vi.useRealTimers()
})

it("compares time-outs at the same minute precision as the display", () => {
  const exact = "2026-11-01T17:00:00Z"
  const after = "2026-11-01T17:00:30Z"
  expect(formatAttendanceTime(exact, "UTC")).toBe(formatAttendanceTime(after, "UTC"))
  expect(getDepartureStatus("2026-11-01", "2026-11-01T08:00:00Z", exact, "17:00", "UTC")).toBe(
    "on_schedule",
  )
  expect(getDepartureStatus("2026-11-01", "2026-11-01T08:00:00Z", after, "17:00", "UTC")).toBe(
    "on_schedule",
  )
})

it("does not turn a daytime late arrival into an overnight shift", () => {
  expect(
    getDepartureStatus(
      "2026-11-01",
      "2026-11-01T18:44:00Z",
      "2026-11-01T19:02:00Z",
      "17:00",
      "UTC",
      "08:00",
    ),
  ).toBe("after_schedule")
})

it("preserves the historical schedule when the current group end time changes", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"))
  const group = createAttendanceGroup({
    settings: { attendance_mode: "work_hours", class_end_time: "17:00" },
  })
  const members = [
    createAttendanceMember({
      person_id: "audit-member",
      joined_at: new Date("2026-01-01T00:00:00Z"),
    }),
  ]
  const sessions = [
    createAttendanceSession({
      person_id: "audit-member",
      date: "2026-11-01",
      applied_rule_id: "historical-rule-17h",
      applied_schedule: {
        class_start_time: "08:00",
        class_end_time: "17:00",
        attendance_mode: "work_hours",
      },
      check_in_time: new Date("2026-11-01T08:00:00Z"),
      check_out_time: new Date("2026-11-01T16:30:00Z"),
    }),
  ]
  const { result, rerender } = renderHook(
    ({ end }) =>
      useReportTransform(
        { ...group, settings: { ...group.settings, class_end_time: end } },
        members,
        sessions,
        null,
        "2026-11-01",
        "2026-11-01",
        "none",
        "all",
        "",
        "UTC",
      ),
    { initialProps: { end: "17:00" } },
  )
  expect(result.current.filteredRows[0].departure_status).toBe("early")
  rerender({ end: "16:00" })
  expect(result.current.filteredRows[0].departure_status).toBe("early")
})
