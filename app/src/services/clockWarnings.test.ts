import { describe, expect, it } from "vitest"
import { consumeClockWarning } from "./clockWarnings"

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
})
