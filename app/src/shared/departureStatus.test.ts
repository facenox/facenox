import { describe, expect, it } from "vitest"
import { getDepartureStatus, getSessionDepartureStatus } from "./departureStatus"
import { createAttendanceSession } from "@/test/fixtures"

describe("getDepartureStatus", () => {
  it("marks a checkout before the scheduled end as an early departure", () => {
    expect(
      getDepartureStatus(
        "2026-04-01",
        new Date(2026, 3, 1, 8),
        new Date(2026, 3, 1, 16, 59),
        "17:00",
      ),
    ).toBe("early")
  })

  it("marks a checkout after the scheduled end as after schedule", () => {
    expect(
      getDepartureStatus(
        "2026-04-01",
        new Date(2026, 3, 1, 8),
        new Date(2026, 3, 1, 17, 1),
        "17:00",
      ),
    ).toBe("after_schedule")
  })

  it("marks an exact checkout on schedule while leaving incomplete sessions unknown", () => {
    expect(
      getDepartureStatus("2026-04-01", new Date(2026, 3, 1, 8), new Date(2026, 3, 1, 17), "17:00"),
    ).toBe("on_schedule")
    expect(getDepartureStatus("2026-04-01", new Date(), undefined, "17:00")).toBeUndefined()
  })

  it("uses the attendance timezone instead of the computer timezone", () => {
    expect(
      getDepartureStatus(
        "2026-01-15",
        "2026-01-15T13:00:00.000Z",
        "2026-01-15T21:30:00.000Z",
        "17:00",
        "America/Toronto",
      ),
    ).toBe("early")
  })

  it.each([
    ["2026-11-02T05:59:59Z", "early"],
    ["2026-11-02T06:00:59Z", "on_schedule"],
    ["2026-11-02T06:01:00Z", "after_schedule"],
  ])("uses the explicit overnight schedule for a checkout at %s", (checkout, expected) => {
    expect(
      getDepartureStatus("2026-11-01", "2026-11-01T22:00:00Z", checkout, "06:00", "UTC", "22:00"),
    ).toBe(expected)
  })

  it("uses today's end for an early-morning arrival on a known overnight shift", () => {
    expect(
      getDepartureStatus(
        "2026-11-02",
        "2026-11-02T02:00:00Z",
        "2026-11-02T06:00:00Z",
        "06:00",
        "UTC",
        "22:00",
      ),
    ).toBe("on_schedule")
  })

  it("keeps overnight comparisons correct across a daylight-saving change", () => {
    expect(
      getDepartureStatus(
        "2026-10-31",
        "2026-11-01T02:00:00Z",
        "2026-11-01T11:00:45Z",
        "06:00",
        "America/Toronto",
        "22:00",
      ),
    ).toBe("on_schedule")
  })

  it("leaves an unavailable or ambiguous schedule unclassified instead of using current defaults", () => {
    const session = createAttendanceSession({ check_out_time: new Date("2026-04-01T17:00:00Z") })
    expect(getSessionDepartureStatus(session, "UTC")).toBeUndefined()
    session.applied_schedule = {
      class_start_time: "08:00",
      class_end_time: null,
      attendance_mode: "work_hours",
    }
    expect(getSessionDepartureStatus(session, "UTC")).toBeUndefined()
    expect(
      getDepartureStatus(
        "2026-04-01",
        session.check_in_time,
        session.check_out_time,
        "08:00",
        "UTC",
        "08:00",
      ),
    ).toBeUndefined()
  })

  it("does not assess Attendance or Visits sessions as working-hour departures", () => {
    const session = createAttendanceSession({ check_out_time: new Date("2026-04-01T17:00:00Z") })
    for (const attendance_mode of ["attendance", "visits"] as const) {
      session.applied_schedule = {
        class_start_time: "08:00",
        class_end_time: "17:00",
        attendance_mode,
      }
      expect(getSessionDepartureStatus(session, "UTC")).toBeUndefined()
    }
  })

  it("uses the captured time-in timezone when assessing the historical schedule", () => {
    const session = createAttendanceSession({
      date: "2026-01-15",
      check_in_time: new Date("2026-01-15T13:00:00Z"),
      check_out_time: new Date("2026-01-15T22:00:30Z"),
      check_in_time_timezone: "America/Toronto",
      check_out_time_timezone: "UTC",
      applied_schedule: {
        class_start_time: "08:00",
        class_end_time: "17:00",
        attendance_mode: "work_hours",
      },
    })
    expect(getSessionDepartureStatus(session, "Asia/Manila")).toBe("on_schedule")
  })
})
