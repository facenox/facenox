import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { useAttendanceGroups } from "./useAttendanceGroups"
import { useAttendanceStore } from "../stores"
import { useGroupStore } from "@/components/group/stores"
import { createAttendanceGroup } from "@/test/fixtures"

const { manager } = vi.hoisted(() => ({
  manager: {
    getSettings: vi.fn(async () => ({ attendance_timezone: "Australia/Sydney" })),
    getGroups: vi.fn(),
    getGroupMembers: vi.fn(async () => []),
    getRecords: vi.fn(async () => []),
    getGroupStats: vi.fn(async () => ({})),
  },
}))
vi.mock("@/services", () => ({ attendanceManager: manager, backendService: {} }))
vi.mock("@/services/AttendanceManager", () => ({ attendanceManager: manager }))
vi.mock("@/services/PersistentSettingsService", () => ({
  persistentSettings: {
    setUIState: vi.fn(async () => {}),
    getUIState: vi.fn(async () => ({})),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  manager.getSettings.mockResolvedValue({ attendance_timezone: "Australia/Sydney" })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

function mountSyncListener() {
  const group = createAttendanceGroup({ id: "timezone-audit" })
  manager.getGroups.mockResolvedValue([group])
  vi.spyOn(useGroupStore.getState(), "fetchOverviewData").mockResolvedValue(undefined)
  useGroupStore.setState({ selectedGroup: group, groups: [group], members: [] })
  useAttendanceStore.setState({
    currentGroup: group,
    attendanceGroups: [group],
    attendanceTimezone: "Asia/Manila",
    groupMembers: [],
    recentAttendance: [],
    isShellReady: false,
    isPanelLoading: false,
    isPanelRefreshing: false,
    isPanelSwitchPending: false,
    panelDataError: null,
  })
  let dataChanged!: () => void
  vi.mocked(window.electronAPI!.sync.onDataChanged).mockImplementation((callback) => {
    dataChanged = callback
    return () => {}
  })
  const hook = renderHook(useAttendanceGroups)
  return { ...hook, dataChanged: () => dataChanged() }
}

it("refreshes the renderer's timezone from the backend after a Cloud policy change", async () => {
  const { dataChanged } = mountSyncListener()
  // The main process broadcasts this after persisting a new site timezone in the backend.
  await act(async () => {
    dataChanged()
    await Promise.resolve()
  })
  expect(manager.getGroups).toHaveBeenCalled()
  expect(manager.getGroupMembers).toHaveBeenCalled()
  expect(manager.getSettings).toHaveBeenCalledWith({ forceRefresh: true })
  expect(useAttendanceStore.getState().attendanceTimezone).toBe("Australia/Sydney")
})

it("preserves the displayed timezone if the refresh fails", async () => {
  const { dataChanged } = mountSyncListener()
  manager.getSettings.mockRejectedValueOnce(new Error("Backend offline"))
  await act(async () => {
    dataChanged()
    await Promise.resolve()
  })
  expect(useAttendanceStore.getState().attendanceTimezone).toBe("Asia/Manila")
})

it("ignores older timezone responses and responses after unmount", async () => {
  const { dataChanged, unmount } = mountSyncListener()
  let resolveOld!: (settings: { attendance_timezone: string }) => void
  manager.getSettings.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve
    }),
  )
  await act(async () => {
    dataChanged()
    dataChanged()
    await Promise.resolve()
  })
  expect(useAttendanceStore.getState().attendanceTimezone).toBe("Australia/Sydney")
  await act(async () => {
    resolveOld({ attendance_timezone: "America/Toronto" })
    await Promise.resolve()
  })
  expect(useAttendanceStore.getState().attendanceTimezone).toBe("Australia/Sydney")
  let resolveLast!: (settings: { attendance_timezone: string }) => void
  manager.getSettings.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLast = resolve
    }),
  )
  act(() => {
    dataChanged()
  })
  unmount()
  await act(async () => {
    resolveLast({ attendance_timezone: "Asia/Manila" })
    await Promise.resolve()
  })
  expect(useAttendanceStore.getState().attendanceTimezone).toBe("Australia/Sydney")
})
