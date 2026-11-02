import { describe, expect, it } from "vitest"
import { clockWarningFromHealth, consumeClockWarning } from "./clockWarnings"

describe("consumeClockWarning", () => {
  it("shows a keyed warning only once per session", () => {
    const shownKeys = new Set<string>()
    const detail = { message: "Timezone mismatch", dedupeKey: "timezone-mismatch" }

    expect(consumeClockWarning(detail, shownKeys)).toBe("Timezone mismatch")
    expect(consumeClockWarning(detail, shownKeys)).toBeNull()
  })

  it("does not suppress unkeyed clock warnings", () => {
    const shownKeys = new Set<string>()
    const detail = { message: "Clock changed" }

    expect(consumeClockWarning(detail, shownKeys)).toBe("Clock changed")
    expect(consumeClockWarning(detail, shownKeys)).toBe("Clock changed")
  })

  it("ignores empty warning messages", () => {
    expect(consumeClockWarning({ message: "   " }, new Set())).toBeNull()
  })

  it("deduplicates timezone advice per pair rather than hiding all later mismatches", () => {
    const shownKeys = new Set<string>()
    const first = clockWarningFromHealth({
      timezone_mismatch: true,
      device_time_zone_name: "America/Phoenix",
      attendance_time_zone_name: "America/Denver",
      timezone_warning_message: "Different DST rules.",
    })!
    expect(consumeClockWarning(first, shownKeys)).toBe("Different DST rules.")
    expect(consumeClockWarning(first, shownKeys)).toBeNull()
    const changed = clockWarningFromHealth({
      timezone_mismatch: true,
      device_time_zone_name: "America/Phoenix",
      attendance_time_zone_name: "Asia/Manila",
      timezone_warning_message: "Different attendance timezone.",
    })!
    expect(consumeClockWarning(changed, shownKeys)).toBe("Different attendance timezone.")
  })

  it("never deduplicates an actual clock warning just because the timezone also differs", () => {
    const shownKeys = new Set<string>()
    const health = {
      timezone_mismatch: true,
      device_time_zone_name: "America/Phoenix",
      attendance_time_zone_name: "America/Denver",
      timezone_warning_message: "Different DST rules.",
    }
    consumeClockWarning(clockWarningFromHealth(health)!, shownKeys)
    const drift = clockWarningFromHealth({ ...health, warning_message: "Clock moved backwards." })!
    expect(drift.dedupeKey).toBeUndefined()
    expect(consumeClockWarning(drift, shownKeys)).toBe("Clock moved backwards.")
    expect(consumeClockWarning(drift, shownKeys)).toBe("Clock moved backwards.")
  })

  it("does not emit a toast when equivalent zones have no advisory", () => {
    expect(clockWarningFromHealth({ timezone_mismatch: false })).toBeNull()
  })

  it("supports legacy timezone warnings without suppressing detected drift", () => {
    expect(
      clockWarningFromHealth({ timezone_mismatch: true, warning_message: "Timezone mismatch" })
        ?.dedupeKey,
    ).toBe("attendance-timezone-mismatch")
    expect(
      clockWarningFromHealth({
        timezone_mismatch: true,
        warning_message: "Clock drift",
        online_verification_status: "drift_detected",
      })?.dedupeKey,
    ).toBeUndefined()
  })
})
