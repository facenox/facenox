import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPersistentSettings = {
  getReportScratchpad: vi.fn(),
  setReportScratchpad: vi.fn().mockResolvedValue(undefined),
}

vi.mock("@/services/PersistentSettingsService", () => ({
  persistentSettings: mockPersistentSettings,
}))

async function loadHook() {
  vi.resetModules()
  const module = await import("@/components/group/sections/reports/hooks/useReportViews")
  return module.useReportViews
}

describe("useReportViews", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("loads persisted settings and infers columnsFollowDefault from saved columns", async () => {
    mockPersistentSettings.getReportScratchpad.mockResolvedValue({
      columns: ["name", "date", "status", "check_in_time", "check_out_time", "total_hours"],
      groupBy: "person",
    })

    const useReportViews = await loadHook()
    const { result } = renderHook(() =>
      useReportViews(
        "group-1",
        ["name", "date", "status", "check_in_time"],
        [
          ["name", "date", "status", "check_in_time"],
          ["name", "date", "status", "check_in_time", "check_out_time", "total_hours"],
        ],
      ),
    )

    await waitFor(() => {
      expect(result.current.visibleColumns).toEqual(["name", "date", "status", "check_in_time"])
      expect(result.current.groupBy).toBe("person")
    })
  })

  it("persists updated view settings after initialization", async () => {
    mockPersistentSettings.getReportScratchpad.mockResolvedValue(null)
    const useReportViews = await loadHook()
    const { result } = renderHook(() =>
      useReportViews("group-1", ["name", "date", "status", "check_in_time"]),
    )

    await waitFor(() => {
      expect(result.current.visibleColumns).toEqual(["name", "date", "status", "check_in_time"])
    })

    result.current.setVisibleColumns(["name", "status"])

    await waitFor(() => {
      expect(mockPersistentSettings.setReportScratchpad).toHaveBeenCalledWith("group-1", {
        columns: ["name", "status"],
        groupBy: "none",
        columnsFollowDefault: false,
      })
    })
  })

  it("does not persist ephemeral search and status filter state", async () => {
    mockPersistentSettings.getReportScratchpad.mockResolvedValue(null)
    const useReportViews = await loadHook()
    const { result } = renderHook(() =>
      useReportViews("group-1", ["name", "date", "status", "check_in_time"]),
    )

    await waitFor(() => {
      expect(result.current.visibleColumns).toEqual(["name", "date", "status", "check_in_time"])
    })

    result.current.setStatusFilter("late")
    result.current.setSearch("alice")

    await waitFor(() => {
      const lastCall = mockPersistentSettings.setReportScratchpad.mock.calls.at(-1)
      expect(lastCall?.[1]).not.toHaveProperty("statusFilter")
      expect(lastCall?.[1]).not.toHaveProperty("search")
    })
  })
})
