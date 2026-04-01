import type { ReactNode } from "react"
import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Reports } from "@/components/group/sections/Reports"
import { useGroupStore } from "@/components/group/stores"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures"
import { renderWithProviders } from "@/test/utils/renderWithProviders"

const mockUseReportData = vi.fn()
const mockUseReportViews = vi.fn()
const mockUseReportTransform = vi.fn()
const mockExportReportToCSV = vi.fn()

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

vi.mock("@/components/group/sections/reports/hooks/useReportData", () => ({
  useReportData: (...args: unknown[]) => mockUseReportData(...args),
}))

vi.mock("@/components/group/sections/reports/hooks/useReportViews", () => ({
  useReportViews: (...args: unknown[]) => mockUseReportViews(...args),
}))

vi.mock("@/components/group/sections/reports/hooks/useReportTransform", () => ({
  useReportTransform: (...args: unknown[]) => mockUseReportTransform(...args),
}))

vi.mock("@/components/group/sections/reports/utils/exportUtils", () => ({
  exportReportToCSV: (...args: unknown[]) => mockExportReportToCSV(...args),
}))

vi.mock("@/components/group/sections/reports/components/ReportToolbar", () => ({
  ReportToolbar: ({
    onStartDateChange,
    onEndDateChange,
    search,
    setSearch,
  }: {
    onStartDateChange: (value: string) => void
    onEndDateChange: (value: string) => void
    search: string
    setSearch: (value: string) => void
  }) => (
    <div>
      <button type="button" onClick={() => onStartDateChange("2026-04-01")}>
        Set Start
      </button>
      <button type="button" onClick={() => onEndDateChange("2026-04-07")}>
        Set End
      </button>
      <button type="button" onClick={() => setSearch(search ? "" : "alice")}>
        Toggle Search
      </button>
    </div>
  ),
}))

vi.mock("@/components/group/sections/reports/components/ReportTable", () => ({
  ReportTable: ({ groupedRows }: { groupedRows: Record<string, unknown[]> }) => (
    <div>Mock Report Table ({Object.keys(groupedRows).length})</div>
  ),
}))

function resetGroupStore() {
  useGroupStore.setState({
    selectedGroup: null,
    groups: [],
    members: [],
    loading: false,
    error: null,
    lastDeletedGroupId: null,
  })
}

function defaultViewsState() {
  return {
    visibleColumns: ["name", "date", "status", "check_in_time"],
    setVisibleColumns: vi.fn(),
    groupBy: "none",
    setGroupBy: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    search: "",
    setSearch: vi.fn(),
  }
}

describe("Reports", () => {
  beforeEach(() => {
    resetGroupStore()
    mockUseReportViews.mockReturnValue(defaultViewsState())
    mockUseReportTransform.mockReturnValue({
      groupedRows: { __all__: [] },
      daysTracked: 7,
      allColumns: [],
    })
    mockUseReportData.mockReturnValue({
      report: null,
      sessions: [],
      members: [],
      loading: false,
      error: null,
      generateReport: vi.fn(),
    })
  })

  it("shows the loading state", () => {
    mockUseReportData.mockReturnValue({
      report: null,
      sessions: [],
      members: [],
      loading: true,
      error: null,
      generateReport: vi.fn(),
    })

    renderWithProviders(<Reports group={createAttendanceGroup()} />)
    expect(screen.getByText("Generating Report")).toBeInTheDocument()
  })

  it("shows the empty members state", () => {
    renderWithProviders(<Reports group={createAttendanceGroup()} onAddMember={vi.fn()} />)

    expect(screen.getByText("No members in this group yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Member" })).toBeInTheDocument()
  })

  it("renders the table when members exist", () => {
    useGroupStore.setState({
      members: [createAttendanceMember({ person_id: "member-1", name: "Alice" })],
    })
    mockUseReportData.mockReturnValue({
      report: null,
      sessions: [],
      members: useGroupStore.getState().members,
      loading: false,
      error: null,
      generateReport: vi.fn(),
    })
    mockUseReportTransform.mockReturnValue({
      groupedRows: { __all__: [{ person_id: "member-1" }] },
      daysTracked: 7,
      allColumns: [],
    })

    renderWithProviders(<Reports group={createAttendanceGroup()} />)

    expect(screen.getByText("Mock Report Table (1)")).toBeInTheDocument()
  })

  it("emits days tracked and export handlers when report data is ready", () => {
    const onDaysTrackedChange = vi.fn()
    const onExportHandlersReady = vi.fn()
    const members = [createAttendanceMember({ person_id: "member-1", name: "Alice" })]
    useGroupStore.setState({ members })
    mockUseReportData.mockReturnValue({
      report: null,
      sessions: [],
      members,
      loading: false,
      error: null,
      generateReport: vi.fn(),
    })
    mockUseReportTransform.mockReturnValue({
      groupedRows: { __all__: [{ person_id: "member-1" }] },
      daysTracked: 7,
      allColumns: [{ key: "name", label: "Name" }],
    })

    renderWithProviders(
      <Reports
        group={createAttendanceGroup()}
        onDaysTrackedChange={onDaysTrackedChange}
        onExportHandlersReady={onExportHandlersReady}
      />,
    )

    expect(onDaysTrackedChange).toHaveBeenCalledWith(7, false)
    expect(onExportHandlersReady).toHaveBeenCalled()

    const handlers = onExportHandlersReady.mock.calls.at(-1)?.[0] as { exportCSV: () => void }
    handlers.exportCSV()

    expect(mockExportReportToCSV).toHaveBeenCalled()
  })

  it("shows report errors above the content", () => {
    mockUseReportData.mockReturnValue({
      report: null,
      sessions: [],
      members: [],
      loading: false,
      error: "Failed to generate report",
      generateReport: vi.fn(),
    })

    renderWithProviders(<Reports group={createAttendanceGroup()} />)

    expect(screen.getByText("Failed to generate report")).toBeInTheDocument()
  })
})
