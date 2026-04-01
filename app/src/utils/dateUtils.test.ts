import { describe, expect, it } from "vitest"
import { generateDateRange, getLocalDateString, parseLocalDate } from "@/utils/dateUtils"

describe("dateUtils", () => {
  it("getLocalDateString zero-pads month and day", () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe("2026-01-05")
  })

  it("parseLocalDate creates the correct local date", () => {
    const parsed = parseLocalDate("2026-04-01")

    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(3)
    expect(parsed.getDate()).toBe(1)
  })

  it("generateDateRange is inclusive for same-day and multi-day ranges", () => {
    expect(generateDateRange("2026-04-01", "2026-04-01")).toEqual(["2026-04-01"])
    expect(generateDateRange("2026-04-01", "2026-04-03")).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
    ])
  })

  it("generateDateRange supports Date and string inputs", () => {
    expect(generateDateRange(new Date(2026, 3, 1), "2026-04-02")).toEqual([
      "2026-04-01",
      "2026-04-02",
    ])
  })
})
