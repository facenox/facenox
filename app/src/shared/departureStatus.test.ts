import { describe, expect, it } from "vitest"
import { getDepartureStatus } from "./departureStatus"

describe("getDepartureStatus", () => {
  it("marks a checkout before the scheduled end as undertime", () => {
    expect(
      getDepartureStatus(
        "2026-04-01",
        new Date(2026, 3, 1, 8),
        new Date(2026, 3, 1, 16, 59),
        "17:00",
      ),
    ).toBe("undertime")
  })

  it("marks a checkout after the scheduled end as overtime", () => {
    expect(
      getDepartureStatus(
        "2026-04-01",
        new Date(2026, 3, 1, 8),
        new Date(2026, 3, 1, 17, 1),
        "17:00",
      ),
    ).toBe("overtime")
  })

  it("does not label an exact checkout or an incomplete session", () => {
    expect(
      getDepartureStatus("2026-04-01", new Date(2026, 3, 1, 8), new Date(2026, 3, 1, 17), "17:00"),
    ).toBeUndefined()
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
    ).toBe("undertime")
  })
})
