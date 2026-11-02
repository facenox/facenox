import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Reports } from "../Reports"
import { useReportData } from "./hooks/useReportData"
import { useReportTransform } from "./hooks/useReportTransform"
import { useGroupStore } from "@/components/group/stores"
import { useAttendanceStore } from "@/components/main/stores"
import {
  createAttendanceGroup,
  createAttendanceMember,
  createAttendanceReport,
  createAttendanceSession,
} from "@/test/fixtures"
import type { RowData } from "./types"
import type { AttendanceReport } from "@/types/recognition"

const { manager } = vi.hoisted(() => ({
  manager: {
    generateReport: vi.fn(),
    getSessions: vi.fn(),
    getGroupMembers: vi.fn(),
  },
}))
vi.mock("@/services", () => ({ attendanceManager: manager }))
vi.mock("@/services/AttendanceManager", () => ({ attendanceManager: manager }))
vi.mock("./hooks/useReportViews", () => ({
  useReportViews: () => ({
    visibleColumns: ["name", "date", "status"],
    setVisibleColumns: () => {},
    groupBy: "none",
    setGroupBy: () => {},
    statusFilter: "all",
    setStatusFilter: () => {},
    search: "",
    setSearch: () => {},
    pageSize: 25,
    setPageSize: () => {},
  }),
}))
vi.mock("./components/ReportToolbar", () => ({
  ReportToolbar: ({
    onStartDateChange,
    onEndDateChange,
  }: {
    onStartDateChange: (date: string) => void
    onEndDateChange: (date: string) => void
  }) => (
    <button
      onClick={() => {
        onStartDateChange("2026-11-01")
        onEndDateChange("2026-11-01")
      }}>
      Yesterday
    </button>
  ),
}))
vi.mock("./components/ReportTable", () => ({
  ReportTable: ({ groupedRows }: { groupedRows: Record<string, RowData[]> }) => (
    <div data-testid="rows">
      {Object.values(groupedRows)
        .flat()
        .map((r) => `${r.date}:${r.status}`)
        .join(",")}
    </div>
  ),
}))
vi.mock("./components/EditSessionModal", () => ({ EditSessionModal: () => null }))
vi.mock("@/components/group/modals", () => ({ ExportAllGroupsModal: () => null }))
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
}))

const group = createAttendanceGroup({ id: "group-1" })
const members = [
  createAttendanceMember({ person_id: "alice", joined_at: new Date("2026-01-01T00:00:00Z") }),
]
function session(date: string) {
  return createAttendanceSession({
    person_id: "alice",
    date,
    check_in_time: new Date(`${date}T08:00:00Z`),
  })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((r, j) => {
    resolve = r
    reject = j
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"))
  manager.generateReport.mockResolvedValue(createAttendanceReport())
  manager.getSessions.mockResolvedValue([session("2026-11-02")])
  manager.getGroupMembers.mockResolvedValue(members)
  useGroupStore.setState({ members, selectedGroup: group, groups: [group] })
  useAttendanceStore.setState({ attendanceTimezone: "UTC" })
})
afterEach(() => {
  vi.useRealTimers()
})

it("does not render new dates against old sessions during the debounce", async () => {
  render(<Reports group={group} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  expect(screen.getByTestId("rows")).toHaveTextContent("2026-11-02:present")
  const pending = deferred<AttendanceReport>()
  manager.generateReport.mockReturnValue(pending.promise)
  manager.getSessions.mockResolvedValue([session("2026-11-01")])
  fireEvent.click(screen.getByRole("button", { name: "Yesterday" }))
  expect(screen.queryByTestId("rows")).toBeNull()
  expect(screen.getByText("Generating report")).toBeInTheDocument()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
  expect(screen.getByText("Generating report")).toBeInTheDocument()
  await act(async () => {
    pending.resolve(createAttendanceReport())
    await pending.promise
  })
  expect(screen.getByTestId("rows")).toHaveTextContent("2026-11-01:present")
})

it.each(["date", "group", "same range"])(
  "ignores an older response after the %s changes",
  async (change) => {
    const old = deferred<AttendanceReport>()
    const latest = createAttendanceReport({
      group_id: change === "group" ? "group-2" : "group-1",
      summary: { total_working_days: 1 },
    })
    manager.generateReport.mockReturnValueOnce(old.promise).mockResolvedValueOnce(latest)
    const { result, rerender } = renderHook(
      ({ id, date }) => useReportData({ ...group, id }, members, date, date),
      { initialProps: { id: "group-1", date: "2026-11-01" } },
    )
    let first!: Promise<void>
    act(() => {
      first = result.current.generateReport()
    })
    rerender({
      id: change === "group" ? "group-2" : "group-1",
      date: change === "date" ? "2026-11-02" : "2026-11-01",
    })
    await act(async () => {
      await result.current.generateReport()
    })
    expect(result.current.report).toEqual(latest)
    const stale = createAttendanceReport({ summary: { total_working_days: 9 } })
    await act(async () => {
      old.resolve(stale)
      await first
    })
    expect(result.current.report).toEqual(latest)
    expect(result.current.report?.summary.total_working_days).toBe(1)
  },
)

it.each(["success", "failure"])(
  "ignores an old %s while the newest report is still loading",
  async (outcome) => {
    const old = deferred<AttendanceReport>()
    const latest = deferred<AttendanceReport>()
    manager.generateReport.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const { result, rerender } = renderHook(
      ({ date }) => useReportData(group, members, date, date),
      { initialProps: { date: "2026-11-01" } },
    )
    let first!: Promise<void>
    act(() => {
      first = result.current.generateReport()
    })
    rerender({ date: "2026-11-02" })
    let second!: Promise<void>
    act(() => {
      second = result.current.generateReport()
    })
    await act(async () => {
      if (outcome === "success") old.resolve(createAttendanceReport())
      else old.reject(new Error("Old request failed"))
      await first
    })
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.report).toBeNull()
    const report = createAttendanceReport({ summary: { total_working_days: 1 } })
    await act(async () => {
      latest.resolve(report)
      await second
    })
    expect(result.current.report).toEqual(report)
    expect(result.current.loading).toBe(false)
  },
)

it("invalidates an earlier response during the debounce before the next request starts", async () => {
  const old = deferred<AttendanceReport>()
  manager.generateReport.mockReturnValueOnce(old.promise)
  const { result, rerender } = renderHook(({ date }) => useReportData(group, members, date, date), {
    initialProps: { date: "2026-11-01" },
  })
  let request!: Promise<void>
  act(() => {
    request = result.current.generateReport()
  })
  rerender({ date: "2026-11-02" })
  await act(async () => {
    old.resolve(createAttendanceReport())
    await request
  })
  expect(result.current.loading).toBe(true)
  expect(result.current.report).toBeNull()
})

it("does not flash stale data when returning to a previously loaded date range", async () => {
  const { result, rerender } = renderHook(({ date }) => useReportData(group, members, date, date), {
    initialProps: { date: "2026-11-01" },
  })
  await act(async () => {
    await result.current.generateReport()
  })
  expect(result.current.loading).toBe(false)
  rerender({ date: "2026-11-02" })
  rerender({ date: "2026-11-01" })
  expect(result.current.loading).toBe(true)
  expect(result.current.report).toBeNull()
})

it.each(["invalid", "0002-01-01"])("does not query an invalid date: %s", async (date) => {
  const { result } = renderHook(() => useReportData(group, members, date, date))
  await act(async () => {
    await result.current.generateReport()
  })
  expect(result.current.error).toBe("Select a valid report date range.")
  expect(result.current.loading).toBe(false)
  expect(manager.generateReport).not.toHaveBeenCalled()
})

it("exposes session-read errors instead of marking members absent", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  manager.getSessions.mockRejectedValueOnce(new Error("Sessions unavailable"))
  const { result } = renderHook(() => useReportData(group, members, "2026-11-01", "2026-11-01"))
  await act(async () => {
    await result.current.generateReport()
  })
  expect(result.current.error).toBe("Sessions unavailable")
  expect(result.current.loading).toBe(false)
  expect(manager.getSessions).toHaveBeenCalledWith(expect.any(Object), { throwOnError: true })
})

it("keeps member order rather than sorting by latest time-in", () => {
  const bob = createAttendanceMember({ person_id: "bob", name: "Bob" })
  const sessions = [
    createAttendanceSession({
      person_id: "bob",
      date: "2026-11-01",
      check_in_time: new Date("2026-11-01T10:00:00Z"),
    }),
    session("2026-11-01"),
  ]
  const { result } = renderHook(() =>
    useReportTransform(
      group,
      [...members, bob],
      sessions,
      null,
      "2026-11-01",
      "2026-11-01",
      "none",
      "all",
      "",
      "UTC",
    ),
  )
  expect(result.current.filteredRows.map((r) => r.person_id)).toEqual(["alice", "bob"])
})

it("opening the date menu alone does not change the date range", async () => {
  const { ReportToolbar } = await vi.importActual<typeof import("./components/ReportToolbar")>(
    "./components/ReportToolbar",
  )
  const start = vi.fn()
  const end = vi.fn()
  render(
    <ReportToolbar
      startDate="2026-11-02"
      endDate="2026-11-02"
      onStartDateChange={start}
      onEndDateChange={end}
      visibleColumns={["name"]}
      setVisibleColumns={() => {}}
      groupBy="none"
      setGroupBy={() => {}}
      statusFilter="all"
      setStatusFilter={() => {}}
      search=""
      setSearch={() => {}}
      allColumns={[{ key: "name", label: "Name" }]}
      unavailableColumns={[]}
      attendanceTimeZone="UTC"
    />,
  )
  fireEvent.click(screen.getByRole("button", { name: "Today" }))
  expect(screen.getByRole("button", { name: "Yesterday" })).toBeInTheDocument()
  expect(start).not.toHaveBeenCalled()
  expect(end).not.toHaveBeenCalled()
})
