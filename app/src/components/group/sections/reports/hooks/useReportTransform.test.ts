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
    expect(result.current.allColumns).toHaveLength(6)
    expect(result.current.allColumns.find((column) => column.key === "late_minutes")?.label).toBe(
      "Late duration",
    )
  })

  it("uses newest dates then names A-Z regardless of the loaded member order", () => {
    const people = ["Zed", "Alice", "Bob"].map((name) =>
      createAttendanceMember({ person_id: name, name }),
    )
    Object.freeze(people)
    const { result, rerender } = renderHook(
      ({ loadedMembers }) =>
        useReportTransform(
          createAttendanceGroup(),
          loadedMembers,
          [],
          null,
          "2026-04-01",
          "2026-04-02",
          "none",
          "all",
          "",
          "UTC",
        ),
      { initialProps: { loadedMembers: people } },
    )
    const expected = [
      ["2026-04-02", "Alice"],
      ["2026-04-02", "Bob"],
      ["2026-04-02", "Zed"],
      ["2026-04-01", "Alice"],
      ["2026-04-01", "Bob"],
      ["2026-04-01", "Zed"],
    ]
    expect(result.current.filteredRows.map((row) => [row.date, row.name])).toEqual(expected)
    rerender({ loadedMembers: [...people].reverse() })
    expect(result.current.groupedRows.__all__.map((row) => [row.date, row.name])).toEqual(expected)
    expect(people.map((person) => person.name)).toEqual(["Zed", "Alice", "Bob"])
  })

  it("sorts date groups newest first and keeps names alphabetical within each date", () => {
    const { result } = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        [...members].reverse(),
        [],
        null,
        "2026-04-01",
        "2026-04-03",
        "date",
        "all",
        "",
        "UTC",
      ),
    )
    expect(Object.keys(result.current.groupedRows)).toEqual([
      "2026-04-03",
      "2026-04-02",
      "2026-04-01",
    ])
    for (const rows of Object.values(result.current.groupedRows)) {
      expect(rows.map((row) => row.name)).toEqual(["Alice", "Bob"])
    }
  })

  it("keeps person groups alphabetical even when their latest recorded dates differ", () => {
    const people = ["Zed", "Alice"].map((name) => createAttendanceMember({ person_id: name, name }))
    const recorded = [
      createAttendanceSession({ id: "z-new", person_id: "Zed", date: "2026-04-02" }),
      createAttendanceSession({ id: "z-old", person_id: "Zed", date: "2026-04-01" }),
      createAttendanceSession({ id: "a-old", person_id: "Alice", date: "2026-04-01" }),
    ]
    const { result } = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        people,
        recorded,
        null,
        "2026-04-01",
        "2026-04-02",
        "person",
        "present",
        "",
        "UTC",
      ),
    )
    expect(Object.keys(result.current.groupedRows)).toEqual(["Alice", "Zed"])
    expect(result.current.groupedRows.Zed.map((row) => row.date)).toEqual([
      "2026-04-02",
      "2026-04-01",
    ])
  })

  it("sorts visits numerically without depending on the session response order", () => {
    const person = createAttendanceMember({ person_id: "a", name: "Alice" })
    const recorded = [3, 1, 2].map((visit_number) =>
      createAttendanceSession({
        id: `visit-${visit_number}`,
        person_id: "a",
        date: "2026-04-02",
        visit_number,
      }),
    )
    Object.freeze(recorded)
    const { result } = renderHook(() =>
      useReportTransform(
        createAttendanceGroup({ settings: { attendance_mode: "visits" } }),
        [person],
        recorded,
        null,
        "2026-04-01",
        "2026-04-02",
        "none",
        "all",
        "",
        "UTC",
      ),
    )
    expect(result.current.filteredRows.map((row) => [row.date, row.visit_number])).toEqual([
      ["2026-04-02", 1],
      ["2026-04-02", 2],
      ["2026-04-02", 3],
      ["2026-04-01", 1],
    ])
    expect(recorded.map((session) => session.visit_number)).toEqual([3, 1, 2])
  })

  it.each(["attendance", "work_hours"] as const)(
    "keeps historical visits and their columns after switching to %s",
    (attendance_mode) => {
      const recorded = [1, 2].map((visit_number) =>
        createAttendanceSession({
          id: `old-visit-${visit_number}`,
          person_id: "member-1",
          date: "2026-04-02",
          visit_number,
          check_out_time: new Date("2026-04-02T09:00:00Z"),
          applied_schedule: { attendance_mode: "visits", class_start_time: "08:00" },
        }),
      )
      const { result } = renderHook(() =>
        useReportTransform(
          createAttendanceGroup({ settings: { attendance_mode } }),
          [members[0]],
          recorded,
          null,
          "2026-04-02",
          "2026-04-02",
          "none",
          "all",
          "",
          "UTC",
        ),
      )
      expect(result.current.filteredRows.map((row) => row.visit_number)).toEqual([1, 2])
      expect(result.current.allColumns.map((column) => column.key)).toEqual(
        expect.arrayContaining(["visit_number", "check_out_time", "total_hours"]),
      )
    },
  )

  it("does not push absent members out of alphabetical order based on scan time", () => {
    const { result } = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        members,
        [
          createAttendanceSession({
            person_id: "member-2",
            date: "2026-04-03",
            check_in_time: new Date("2026-04-03T18:00:00Z"),
          }),
        ],
        null,
        "2026-04-03",
        "2026-04-03",
        "none",
        "all",
        "",
        "UTC",
      ),
    )
    expect(result.current.filteredRows.map((row) => [row.name, row.status])).toEqual([
      ["Alice", "absent"],
      ["Bob", "present"],
    ])
  })

  it("supports person names that match object prototype properties", () => {
    const people = ["__proto__", "constructor"].map((name) =>
      createAttendanceMember({ person_id: name, name }),
    )
    const { result } = renderHook(() =>
      useReportTransform(
        createAttendanceGroup(),
        people,
        [],
        null,
        "2026-04-01",
        "2026-04-01",
        "person",
        "all",
        "",
        "UTC",
      ),
    )
    expect(Object.hasOwn(result.current.groupedRows, "__proto__")).toBe(true)
    expect(result.current.groupedRows.__proto__).toHaveLength(1)
    expect(result.current.groupedRows.constructor).toHaveLength(1)
  })
})
