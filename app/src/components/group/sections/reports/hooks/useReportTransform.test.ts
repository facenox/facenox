import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useReportTransform } from "@/components/group/sections/reports/hooks/useReportTransform"
import {
  createAttendanceGroup,
  createAttendanceMember,
  createAttendanceReport,
  createAttendanceSession,
} from "@/test/fixtures"

const members = [
  createAttendanceMember({
    person_id: "member-1",
    name: "Alice",
    joined_at: new Date("2026-04-01T00:00:00.000Z"),
  }),
  createAttendanceMember({
    person_id: "member-2",
    name: "Bob",
    joined_at: new Date("2026-04-03T00:00:00.000Z"),
  }),
]

const sessions = [
  createAttendanceSession({
    id: "session-1",
    person_id: "member-1",
    date: "2026-04-01",
    check_in_time: new Date("2026-04-01T08:00:00.000Z"),
  }),
  createAttendanceSession({
    id: "session-2",
    person_id: "member-1",
    date: "2026-04-02",
    check_in_time: new Date("2026-04-02T08:10:00.000Z"),
    is_late: true,
    late_minutes: 10,
  }),
]

describe("useReportTransform", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-10T08:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("builds rows with absent, late, and no_records states", () => {
    const { result } = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        members,
        sessions,
        null,
        "2026-04-01",
        "2026-04-03",
        "none",
        "all",
        "",
      ),
    )

    const rows = result.current.filteredRows
    expect(
      rows.find((row) => row.person_id === "member-1" && row.date === "2026-04-01")?.status,
    ).toBe("present")
    expect(
      rows.find((row) => row.person_id === "member-1" && row.date === "2026-04-02")?.is_late,
    ).toBe(true)
    expect(
      rows.find((row) => row.person_id === "member-2" && row.date === "2026-04-01")?.status,
    ).toBe("no_records")
    expect(
      rows.find((row) => row.person_id === "member-2" && row.date === "2026-04-03")?.status,
    ).toBe("absent")
  })

  it("filters by status and search safely", () => {
    const { result } = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        members,
        sessions,
        null,
        "2026-04-01",
        "2026-04-03",
        "none",
        "late",
        "alice",
      ),
    )

    expect(result.current.filteredRows).toHaveLength(1)
    expect(result.current.filteredRows[0]?.person_id).toBe("member-1")
    expect(result.current.filteredRows[0]?.late_minutes).toBe(10)
  })

  it("groups rows by person or date", () => {
    const byPerson = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        members,
        sessions,
        null,
        "2026-04-01",
        "2026-04-02",
        "person",
        "all",
        "",
      ),
    )
    expect(Object.keys(byPerson.result.current.groupedRows)).toContain("Alice")

    const byDate = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        members,
        sessions,
        null,
        "2026-04-01",
        "2026-04-02",
        "date",
        "all",
        "",
      ),
    )
    expect(Object.keys(byDate.result.current.groupedRows)).toContain("2026-04-01")
  })

  it("prefers report.summary.total_working_days when provided", () => {
    const { result } = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        members,
        sessions,
        createAttendanceReport({
          date_range: {
            start: new Date("2026-04-01"),
            end: new Date("2026-04-03"),
          },
          summary: {
            total_working_days: 12,
          },
        }),
        "2026-04-01",
        "2026-04-03",
        "none",
        "all",
        "",
      ),
    )

    expect(result.current.daysTracked).toBe(12)
    expect(result.current.allColumns).toHaveLength(9)
  })
})
