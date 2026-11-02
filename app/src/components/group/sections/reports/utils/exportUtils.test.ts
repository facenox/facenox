import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  exportReportToCSV,
  exportAllGroupsReportToCSV,
  exportAllGroupsReportToExcel,
  exportAllGroupsReportToIndividualCSVs,
} from "./exportUtils"
import { attendanceManager } from "@/services/AttendanceManager"
import type { AttendanceGroup, AttendanceMember, AttendanceSession } from "@/types/recognition"
import type { RowData } from "../types"
import { formatAttendanceTime } from "@/utils/attendanceTime"
import { HttpClient } from "@/services/attendance/HttpClient"

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
      { key: "check_in_time" as const, label: "Time in" },
      { key: "check_out_time" as const, label: "Time out" },
      { key: "total_hours" as const, label: "Total hours" },
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

  it("keeps exported lateness numeric and explicitly labeled as minutes", async () => {
    let exportedBlob: Blob | undefined
    vi.mocked(global.URL.createObjectURL).mockImplementation((blob) => {
      exportedBlob = blob as Blob
      return "mock-url"
    })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const row: RowData = {
      person_id: "p-late",
      name: "Alice",
      date: "2026-11-02",
      status: "late",
      is_late: true,
      late_minutes: 90,
      total_hours: 0,
      notes: "Manual correction — Complete note — Extra detail",
      session: null,
    }
    const result = exportReportToCSV(
      { __all__: [row] },
      ["late_minutes", "total_hours", "notes"],
      [
        { key: "late_minutes", label: "Late duration" },
        { key: "total_hours", label: "Total hours" },
        { key: "notes", label: "Notes" },
      ],
      "Group",
      "2026-11-02",
      "2026-11-02",
    )
    expect(result.success).toBe(true)
    const csv = await exportedBlob?.text()
    expect(csv).toContain('"Late (mins)","Total hours","Notes"')
    expect(csv).toContain('"90","0m","Manual correction — Complete note — Extra detail"')
  })

  it.each([
    ["early", "Left early"],
    ["on_schedule", "On schedule"],
    ["after_schedule", "Left after schedule"],
  ] as const)(
    "exports the displayed label for a %s departure in the current view",
    async (departure_status, label) => {
      let exportedBlob: Blob | undefined
      vi.mocked(global.URL.createObjectURL).mockImplementation((blob) => {
        exportedBlob = blob as Blob
        return "mock-url"
      })
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
      const row: RowData = {
        person_id: "p",
        name: "Alice",
        date: "2026-11-02",
        status: "present",
        is_late: false,
        late_minutes: 0,
        departure_status,
        notes: "",
        session: null,
      }
      const result = exportReportToCSV(
        { __all__: [row] },
        ["departure_status"],
        [{ key: "departure_status", label: "Departure" }],
        "Group",
        row.date,
        row.date,
      )
      expect(result.success).toBe(true)
      expect(await exportedBlob?.text()).toBe(`"Departure"\n"${label}"`)
    },
  )

  it("exports captured attendance time instead of browser-local time", async () => {
    let exportedBlob: Blob | undefined
    vi.mocked(global.URL.createObjectURL).mockImplementation((blob) => {
      exportedBlob = blob as Blob
      return "mock-url"
    })
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) node.click = vi.fn()
      return node
    })
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node)

    exportReportToCSV(
      {
        __all__: [
          {
            person_id: "p-1",
            name: "Alice",
            date: "2026-01-15",
            status: "present",
            check_in_time: new Date("2026-01-15T13:30:00.000Z"),
            is_late: false,
            late_minutes: 0,
            notes: "",
            session: null,
          },
        ],
      },
      ["name", "check_in_time"],
      [
        { key: "name", label: "Name" },
        { key: "check_in_time", label: "Time in" },
      ],
      "Group",
      "2026-01-15",
      "2026-01-15",
      "America/Toronto",
    )

    expect(await exportedBlob?.text()).toContain("8:30 AM")
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
      },
    ]

    const mockMembersG2: AttendanceMember[] = [
      {
        person_id: "p-2",
        group_id: "group-2",
        name: "Bob Jones",
        joined_at: new Date("2026-01-01"),
        is_active: true,
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

  it("exports multi-sheet Excel workbook for all groups", async () => {
    const clickSpy = vi.fn()
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.click = clickSpy
      }
      return node
    })
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node)

    const mockGroups: AttendanceGroup[] = [
      { id: "group-1", name: "Teachers", created_at: new Date(), is_active: true, settings: {} },
      { id: "group-2", name: "Staff", created_at: new Date(), is_active: true, settings: {} },
    ]

    vi.spyOn(attendanceManager, "getGroupMembers").mockImplementation(async (gid) => [
      {
        person_id: `p-${gid}`,
        group_id: gid,
        name: `Member ${gid}`,
        joined_at: new Date("2026-01-01"),
        is_active: true,
      },
    ])

    vi.spyOn(attendanceManager, "getSessions").mockImplementation(async () => [])

    const result = await exportAllGroupsReportToExcel(mockGroups, "2026-10-08", "2026-10-08")
    expect(result.success).toBe(true)
    expect(clickSpy).toHaveBeenCalled()

    appendSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it("exports individual CSV files for all groups", async () => {
    const clickSpy = vi.fn()
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.click = clickSpy
      }
      return node
    })
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node)

    const mockGroups: AttendanceGroup[] = [
      { id: "group-1", name: "Teachers", created_at: new Date(), is_active: true, settings: {} },
      { id: "group-2", name: "Staff", created_at: new Date(), is_active: true, settings: {} },
    ]

    vi.spyOn(attendanceManager, "getGroupMembers").mockImplementation(async (gid) => [
      {
        person_id: `p-${gid}`,
        group_id: gid,
        name: `Member ${gid}`,
        joined_at: new Date("2026-01-01"),
        is_active: true,
      },
    ])

    vi.spyOn(attendanceManager, "getSessions").mockImplementation(async () => [])

    const result = await exportAllGroupsReportToIndividualCSVs(
      mockGroups,
      "2026-10-08",
      "2026-10-08",
    )
    expect(result.success).toBe(true)
    expect(clickSpy).toHaveBeenCalledTimes(2) // 1 per group

    appendSpy.mockRestore()
    removeSpy.mockRestore()
  })
})

describe("report export regression coverage", () => {
  const date = "2026-01-02"
  let group: AttendanceGroup
  let members: AttendanceMember[]
  let visits: AttendanceSession[]
  let downloads: Blob[]
  const exporters = [
    ["combined CSV", exportAllGroupsReportToCSV],
    ["individual CSV", exportAllGroupsReportToIndividualCSVs],
    ["Excel", exportAllGroupsReportToExcel],
  ] as const

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-03T00:00:00Z"))
    downloads = []
    URL.createObjectURL = vi.fn((value) => {
      downloads.push(value as Blob)
      return "report-download"
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) node.click = vi.fn()
      return node
    })
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node)
    group = {
      id: "g",
      name: "Visits",
      created_at: new Date("2026-01-01T00:00:00Z"),
      is_active: true,
      settings: { attendance_mode: "visits" },
    }
    members = [
      {
        person_id: "p",
        group_id: "g",
        name: "Member",
        joined_at: new Date("2026-01-01T00:00:00Z"),
        is_active: true,
      },
    ]
    visits = [
      {
        id: "v1",
        person_id: "p",
        member_id: "p",
        group_id: "g",
        date,
        visit_number: 1,
        check_in_time: new Date(`${date}T08:00:00Z`),
        check_out_time: new Date(`${date}T09:00:00Z`),
        total_hours: 1,
        status: "present",
        is_late: false,
        late_minutes: 0,
        notes: "First visit note",
      },
      {
        id: "v2",
        person_id: "p",
        member_id: "p",
        group_id: "g",
        date,
        visit_number: 2,
        check_in_time: new Date(`${date}T10:00:00Z`),
        check_out_time: new Date(`${date}T11:00:00Z`),
        total_hours: 1,
        status: "present",
        is_late: true,
        late_minutes: 30,
        notes: 'Second, "quoted" visit note',
      },
    ]
    vi.spyOn(attendanceManager, "getGroupMembers").mockImplementation(async () => members)
    vi.spyOn(attendanceManager, "getSessions").mockImplementation(async () => visits)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function exportedRows(format: string) {
    const text = await downloads[0].text()
    let rows: string[][]
    if (format === "Excel") {
      const xml = new DOMParser().parseFromString(text, "application/xml")
      expect(xml.getElementsByTagName("parsererror")).toHaveLength(0)
      rows = [...xml.getElementsByTagName("Worksheet")[0].getElementsByTagName("Row")].map((row) =>
        [...row.getElementsByTagName("Data")].map((cell) => cell.textContent || ""),
      )
    } else {
      rows = text
        .split("\n")
        .map((line) =>
          [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replaceAll('""', '"')),
        )
    }
    const [header, ...data] = rows
    for (const row of data) expect(row).toHaveLength(header.length)
    return data.map((row) => Object.fromEntries(header.map((label, i) => [label, row[i]])))
  }

  it.each(exporters)(
    "uses newest dates, names A-Z and numeric visits in %s",
    async (format, exporter) => {
      members = [
        { ...members[0], person_id: "z", name: "Zed" },
        { ...members[0], person_id: "a", name: "Alice" },
      ]
      visits = [
        { ...visits[1], id: "a2", person_id: "a", visit_number: 2 },
        { ...visits[0], id: "z1", person_id: "z" },
        { ...visits[0], id: "a-old", person_id: "a", date: "2026-01-01" },
        { ...visits[0], id: "a1", person_id: "a" },
      ]
      expect((await exporter([group], "2026-01-01", date, "UTC")).success).toBe(true)
      expect((await exportedRows(format)).map((row) => [row.Date, row.Name, row.Visit])).toEqual([
        ["01/02/2026", "Alice", "1"],
        ["01/02/2026", "Alice", "2"],
        ["01/02/2026", "Zed", "1"],
        ["01/01/2026", "Alice", "1"],
        ["01/01/2026", "Zed", ""],
      ])
      expect(members.map((member) => member.name)).toEqual(["Zed", "Alice"])
      expect(visits.map((session) => session.id)).toEqual(["a2", "z1", "a-old", "a1"])
    },
  )

  it("preserves the displayed group and row order when exporting the current view", async () => {
    const row: RowData = {
      person_id: "a",
      name: "Alice",
      date,
      status: "absent",
      is_late: false,
      late_minutes: 0,
      notes: "",
      session: null,
    }
    const result = exportReportToCSV(
      {
        Alice: [row, { ...row, date: "2026-01-01" }],
        Zed: [{ ...row, person_id: "z", name: "Zed" }],
      },
      ["name", "date"],
      [
        { key: "name", label: "Name" },
        { key: "date", label: "Date" },
      ],
      "Group",
      "2026-01-01",
      date,
      "UTC",
    )
    expect(result.success).toBe(true)
    expect((await exportedRows("current CSV")).map((row) => [row.Name, row.Date])).toEqual([
      ["Alice", "01/02/2026"],
      ["Alice", "01/01/2026"],
      ["Zed", "01/02/2026"],
    ])
  })

  it.each(exporters)(
    "preserves each visit's columns, notes and status in %s",
    async (format, exporter) => {
      expect((await exporter([group], date, date, "UTC")).success).toBe(true)
      expect(downloads).toHaveLength(1)
      const rows = await exportedRows(format)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({
        Visit: "1",
        Status: "Present",
        "Late (mins)": "",
        Notes: "First visit note",
      })
      expect(rows[1]).toMatchObject({
        Name: "Member",
        Visit: "2",
        Status: "Late",
        "Time in": formatAttendanceTime(visits[1].check_in_time, "UTC"),
        "Time out": formatAttendanceTime(visits[1].check_out_time, "UTC"),
        Departure: "",
        "Total hours": "1h",
        "Late (mins)": "30",
        Notes: 'Second, "quoted" visit note',
      })
    },
  )

  it.each(exporters)(
    "does not copy an earlier late status to an on-time visit in %s",
    async (format, exporter) => {
      visits[0].is_late = true
      visits[0].late_minutes = 15
      visits[1].is_late = false
      visits[1].late_minutes = 0
      await exporter([group], date, date, "UTC")
      const rows = await exportedRows(format)
      expect(rows[0].Status).toBe("Late")
      expect(rows[1]).toMatchObject({ Status: "Present", "Late (mins)": "" })
    },
  )

  it("aligns mixed Attendance, Time in/out and Visits rows under one combined header", async () => {
    const attendance = {
      ...group,
      id: "attendance",
      name: "Attendance",
      settings: { attendance_mode: "attendance" as const },
    }
    const work = {
      ...group,
      id: "work",
      name: "Work",
      settings: { attendance_mode: "work_hours" as const, class_end_time: "09:00" },
    }
    vi.mocked(attendanceManager.getSessions).mockImplementation(async (params) =>
      params?.group_id === group.id ? visits : [{ ...visits[0], group_id: params!.group_id! }],
    )
    await exportAllGroupsReportToCSV([attendance, work, group], date, date, "UTC")
    const rows = await exportedRows("combined CSV")
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({
      Group: "Attendance",
      Visit: "",
      "Total hours": "1h",
      Notes: "First visit note",
    })
    expect(rows[1]).toMatchObject({
      Group: "Work",
      Visit: "",
      "Time out": formatAttendanceTime(visits[0].check_out_time, "UTC"),
      "Total hours": "1h",
      Notes: "First visit note",
    })
    expect(rows[3]).toMatchObject({
      Group: "Visits",
      Visit: "2",
      "Late (mins)": "30",
      Notes: 'Second, "quoted" visit note',
    })
  })

  describe.each(exporters)("%s historical departure labels", (format, exporter) => {
    it.each([
      ["08:59:59", "Left early"],
      ["09:00:59", "On schedule"],
      ["09:01:00", "Left after schedule"],
    ])(
      "exports a %s checkout as %s using the session's original schedule",
      async (checkout, label) => {
        group.settings = {
          attendance_mode: "work_hours",
          class_start_time: "07:00",
          class_end_time: "17:00",
        }
        vi.mocked(attendanceManager.getSessions).mockResolvedValue([
          {
            ...visits[0],
            check_out_time: new Date(`${date}T${checkout}Z`),
            applied_schedule: {
              class_start_time: "08:00",
              class_end_time: "09:00",
              attendance_mode: "work_hours",
            },
          },
        ])
        expect((await exporter([group], date, date, "UTC")).success).toBe(true)
        expect((await exportedRows(format))[0].Departure).toBe(label)
      },
    )

    it("does not invent a departure label when the historical schedule is unavailable", async () => {
      group.settings = {
        attendance_mode: "work_hours",
        class_start_time: "08:00",
        class_end_time: "17:00",
      }
      vi.mocked(attendanceManager.getSessions).mockResolvedValue([
        { ...visits[0], applied_schedule: null },
      ])
      expect((await exporter([group], date, date, "UTC")).success).toBe(true)
      expect((await exportedRows(format))[0].Departure).toBe("")
    })
  })

  describe.each(exporters)("%s load failure handling", (_format, exporter) => {
    it.each(["getSessions", "getGroupMembers"] as const)(
      "propagates real service-layer %s failures instead of using an empty fallback",
      async (method) => {
        vi.mocked(attendanceManager[method]).mockRestore()
        const error = new Error("HTTP request failed")
        vi.spyOn(HttpClient.prototype, "get").mockRejectedValue(error)
        const result = await exporter([group], date, date, "UTC")
        expect(result).toEqual({ success: false, error })
        expect(downloads).toEqual([])
      },
    )

    it.each(["getSessions", "getGroupMembers"] as const)(
      "does not download when %s fails",
      async (method) => {
        const error = new Error("Local service unavailable")
        vi.mocked(attendanceManager[method]).mockRejectedValue(error)
        const result = await exporter([group], date, date, "UTC")
        expect(result).toEqual({ success: false, error })
        expect(downloads).toEqual([])
        expect(URL.createObjectURL).not.toHaveBeenCalled()
      },
    )

    it("does not download partial results when a later group fails", async () => {
      const other = { ...group, id: "other" }
      vi.mocked(attendanceManager.getSessions).mockImplementation(async (params) => {
        if (params?.group_id === "other") throw new Error("Other group unavailable")
        return visits
      })
      expect((await exporter([group, other], date, date, "UTC")).success).toBe(false)
      expect(downloads).toEqual([])
    })

    it("still reports a genuine missing session as Absent after a successful read", async () => {
      visits = []
      expect((await exporter([group], date, date, "UTC")).success).toBe(true)
      expect((await exportedRows(_format))[0].Status).toBe("Absent")
    })
  })

  it("preserves the existing non-export fallback for member and session reads", async () => {
    vi.mocked(attendanceManager.getSessions).mockRestore()
    vi.mocked(attendanceManager.getGroupMembers).mockRestore()
    vi.spyOn(HttpClient.prototype, "get").mockRejectedValue(new Error("Offline"))
    await expect(attendanceManager.getGroupMembers("g")).resolves.toEqual([])
    await expect(attendanceManager.getSessions({ group_id: "g" })).resolves.toEqual([])
  })

  it.each([
    [0, "0m"],
    [59 / 60, "59m"],
    [59.999 / 60, "1h"],
    [1.5, "1h 30m"],
    [8 + 3599 / 3600, "9h"],
  ] as const)("normalizes %s hours in visible-column CSV to %s", async (hours, expected) => {
    exportReportToCSV(
      {
        __all__: [
          {
            person_id: "p",
            name: "Member",
            date,
            status: "present",
            total_hours: hours,
            is_late: false,
            late_minutes: 0,
            notes: "",
            session: null,
          },
        ],
      },
      ["total_hours"],
      [{ key: "total_hours", label: "Total hours" }],
      "Group",
      date,
      date,
      "UTC",
    )
    expect(await downloads[0].text()).toBe(`"Total hours"\n"${expected}"`)
  })

  it.each(exporters)("normalizes hours for each session in %s", async (format, exporter) => {
    visits[0].total_hours = 0
    visits[1].total_hours = 8 + 3599 / 3600
    await exporter([group], date, date, "UTC")
    const rows = await exportedRows(format)
    expect(rows.map((row) => row["Total hours"])).toEqual(["0m", "9h"])
  })
})
