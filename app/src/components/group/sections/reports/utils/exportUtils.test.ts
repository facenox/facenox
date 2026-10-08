import { describe, expect, it, vi, beforeEach } from "vitest"
import { exportReportToCSV, exportAllGroupsReportToCSV } from "./exportUtils"
import { attendanceManager } from "@/services/AttendanceManager"
import type { AttendanceGroup, AttendanceMember, AttendanceSession } from "@/types/recognition"
import type { RowData } from "../types"

describe("exportUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => "mock-url")
    global.URL.revokeObjectURL = vi.fn()
  })

  it("exports single group report to CSV", () => {
    const clickSpy = vi.fn()
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.click = clickSpy
      }
      return node
    })
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node)

    const groupedRows: Record<string, RowData[]> = {
      __all__: [
        {
          person_id: "p-1",
          name: "Alice Smith",
          date: "2026-10-08",
          status: "present",
          check_in_time: new Date("2026-10-08T08:05:00"),
          check_out_time: new Date("2026-10-08T17:00:00"),
          total_hours: 8.91,
          is_late: false,
          late_minutes: 0,
          notes: "On time",
          session: null,
        },
      ],
    }

    const allColumns = [
      { key: "name" as const, label: "Name" },
      { key: "date" as const, label: "Date" },
      { key: "status" as const, label: "Status" },
      { key: "check_in_time" as const, label: "Time In" },
      { key: "check_out_time" as const, label: "Time Out" },
      { key: "total_hours" as const, label: "Total Hours" },
      { key: "notes" as const, label: "Notes" },
    ]

    const result = exportReportToCSV(
      groupedRows,
      ["name", "date", "status", "check_in_time", "check_out_time", "total_hours", "notes"],
      allColumns,
      "Grade 10-A",
      "2026-10-08",
      "2026-10-08",
    )

    expect(result.success).toBe(true)
    expect(appendSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()

    appendSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it("exports consolidated master report for all groups to CSV", async () => {
    const clickSpy = vi.fn()
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.click = clickSpy
      }
      return node
    })
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node)

    const mockGroups: AttendanceGroup[] = [
      { id: "group-1", name: "Grade 10-A", created_at: new Date(), is_active: true, settings: {} },
      { id: "group-2", name: "Grade 10-B", created_at: new Date(), is_active: true, settings: {} },
    ]

    const mockMembersG1: AttendanceMember[] = [
      {
        person_id: "p-1",
        group_id: "group-1",
        name: "Alice Smith",
        joined_at: new Date("2026-01-01"),
        is_active: true,
        has_consent: true,
      },
    ]

    const mockMembersG2: AttendanceMember[] = [
      {
        person_id: "p-2",
        group_id: "group-2",
        name: "Bob Jones",
        joined_at: new Date("2026-01-01"),
        is_active: true,
        has_consent: true,
      },
    ]

    const mockSessionsG1: AttendanceSession[] = [
      {
        id: "s-1",
        person_id: "p-1",
        member_id: "m-1",
        group_id: "group-1",
        date: "2026-10-08",
        status: "present",
        check_in_time: new Date("2026-10-08T08:05:00"),
        check_out_time: new Date("2026-10-08T17:00:00"),
        total_hours: 8.9,
        is_late: false,
        late_minutes: 0,
      },
    ]

    const mockSessionsG2: AttendanceSession[] = [
      {
        id: "s-2",
        person_id: "p-2",
        member_id: "m-2",
        group_id: "group-2",
        date: "2026-10-08",
        status: "present",
        check_in_time: new Date("2026-10-08T08:45:00"),
        check_out_time: new Date("2026-10-08T17:00:00"),
        total_hours: 8.25,
        is_late: true,
        late_minutes: 45,
      },
    ]

    vi.spyOn(attendanceManager, "getGroupMembers").mockImplementation(async (gid) => {
      if (gid === "group-1") return mockMembersG1
      if (gid === "group-2") return mockMembersG2
      return []
    })

    vi.spyOn(attendanceManager, "getSessions").mockImplementation(async (params) => {
      if (params?.group_id === "group-1") return mockSessionsG1
      if (params?.group_id === "group-2") return mockSessionsG2
      return []
    })

    const result = await exportAllGroupsReportToCSV(mockGroups, "2026-10-08", "2026-10-08")

    expect(result.success).toBe(true)
    expect(appendSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()

    appendSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
