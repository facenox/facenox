import { describe, expect, it } from "vitest"
import {
  buildRecordCheckInStatusMap,
  limitAttendanceRecords,
  processAttendanceRecords,
} from "@/components/main/components/attendancePanelUtils"
import { createAttendanceRecord } from "@/test/fixtures"

const displayNameMap = new Map([
  ["alice", "Alice"],
  ["bob", "Bob"],
  ["charlie", "Charlie"],
])

const records = [
  createAttendanceRecord({
    id: "1",
    person_id: "alice",
    timestamp: new Date("2026-04-01T08:00:00.000Z"),
  }),
  createAttendanceRecord({
    id: "2",
    person_id: "bob",
    timestamp: new Date("2026-04-02T09:00:00.000Z"),
    confidence: 0.96,
  }),
  createAttendanceRecord({
    id: "3",
    person_id: "alice",
    timestamp: new Date("2026-04-02T10:00:00.000Z"),
    confidence: 0.97,
  }),
]

describe("attendancePanelUtils", () => {
  it("filters today-only records", () => {
    expect(
      processAttendanceRecords({
        recentAttendance: records,
        displayNameMap,
        recordScope: "today",
        searchQuery: "",
        sortField: "time",
        sortOrder: "desc",
        today: new Date("2026-04-02T12:00:00.000Z"),
      }).map((record) => record.id),
    ).toEqual(["3", "2"])
  })

  it("matches normalized display names for search", () => {
    expect(
      processAttendanceRecords({
        recentAttendance: records,
        displayNameMap,
        recordScope: "all",
        searchQuery: "ali",
        sortField: "time",
        sortOrder: "desc",
      }).map((record) => record.id),
    ).toEqual(["3", "1"])
  })

  it("sorts by time and name in both directions", () => {
    expect(
      processAttendanceRecords({
        recentAttendance: records,
        displayNameMap,
        recordScope: "all",
        searchQuery: "",
        sortField: "time",
        sortOrder: "asc",
      }).map((record) => record.id),
    ).toEqual(["1", "2", "3"])

    expect(
      processAttendanceRecords({
        recentAttendance: records,
        displayNameMap,
        recordScope: "all",
        searchQuery: "",
        sortField: "name",
        sortOrder: "asc",
      }).map((record) => record.person_id),
    ).toEqual(["alice", "alice", "bob"])
  })

  it("limits visible records by display limit", () => {
    expect(limitAttendanceRecords(records, 2).map((record) => record.id)).toEqual(["1", "2"])
  })

  it("marks repeated same-day records as later check-outs", () => {
    const repeatedSameDayRecords = [
      createAttendanceRecord({
        id: "1",
        person_id: "alice",
        timestamp: new Date("2026-04-02T08:00:00.000Z"),
      }),
      createAttendanceRecord({
        id: "2",
        person_id: "bob",
        timestamp: new Date("2026-04-02T09:00:00.000Z"),
        confidence: 0.96,
      }),
      createAttendanceRecord({
        id: "3",
        person_id: "alice",
        timestamp: new Date("2026-04-02T10:00:00.000Z"),
        confidence: 0.97,
      }),
    ]

    expect(Array.from(buildRecordCheckInStatusMap(repeatedSameDayRecords).entries())).toEqual([
      ["1", false],
      ["2", false],
      ["3", true],
    ])
  })
})
