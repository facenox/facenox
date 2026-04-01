import { renderHook, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useSettings } from "@/components/settings/hooks/useSettings"
import { useGroupUIStore } from "@/components/group/stores"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures"

const { mockBackendService, mockAttendanceManager, mockConfirm, mockAlert } = vi.hoisted(() => ({
  mockBackendService: {
    getDatabaseStats: vi.fn(),
    clearDatabase: vi.fn(),
  },
  mockAttendanceManager: {
    getAttendanceStats: vi.fn(),
    getTimeHealth: vi.fn(),
  },
  mockConfirm: vi.fn(),
  mockAlert: vi.fn(),
}))

vi.mock("@/services", () => ({
  backendService: mockBackendService,
  attendanceManager: mockAttendanceManager,
}))

vi.mock("@/components/shared", () => ({
  useDialog: () => ({
    confirm: mockConfirm,
    alert: mockAlert,
  }),
}))

function resetGroupUIStore() {
  useGroupUIStore.setState({
    activeSection: "overview",
    isSidebarCollapsed: false,
    isMobileDrawerOpen: false,
    showAddMemberModal: false,
    showEditMemberModal: false,
    showCreateGroupModal: false,
    showEditGroupModal: false,
    editingMember: null,
    preSelectedMemberId: null,
    lastRegistrationSource: null,
    lastRegistrationMode: null,
  })
}

function createProps(overrides: Partial<Parameters<typeof useSettings>[0]> = {}) {
  const currentGroup = createAttendanceGroup()
  return {
    initialGroupSection: "overview" as const,
    initialSection: "group",
    initialGroups: [currentGroup],
    currentGroup,
    currentGroupMembers: [createAttendanceMember()],
    onQuickSettingsChange: vi.fn(),
    onAudioSettingsChange: vi.fn(),
    onAttendanceSettingsChange: vi.fn(),
    onGroupSelect: vi.fn(),
    onGroupsChanged: vi.fn(),
    quickSettings: {
      cameraMirrored: true,
      showRecognitionNames: true,
      showLandmarks: true,
    },
    ...overrides,
  }
}

async function flushInitialLoad() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("useSettings", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetGroupUIStore()
    mockBackendService.getDatabaseStats.mockReset().mockResolvedValue({ total_persons: 12 })
    mockBackendService.clearDatabase.mockReset().mockResolvedValue({
      success: true,
      message: "Cleared",
    })
    mockAttendanceManager.getAttendanceStats.mockReset().mockResolvedValue({ total_members: 7 })
    mockAttendanceManager.getTimeHealth.mockReset().mockResolvedValue({
      source: "system",
      current_time_utc: "2026-04-01T00:00:00.000Z",
      current_time_local: "2026-04-01T08:00:00.000+08:00",
      time_zone_name: "Asia/Manila",
      os_clock_drift_seconds: 0,
      online_verification_status: "ok",
    })
    mockConfirm.mockReset().mockResolvedValue(true)
    mockAlert.mockReset().mockResolvedValue(undefined)
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("loads system and time-health data after the deferred startup timer", async () => {
    const { result } = renderHook(() => useSettings(createProps()))

    expect(result.current.systemData.totalPersons).toBeNull()
    expect(result.current.timeHealthState.loading).toBe(false)

    await flushInitialLoad()

    expect(result.current.systemData.totalPersons).toBe(12)
    expect(result.current.systemData.totalMembers).toBe(7)
    expect(result.current.timeHealthState.timeHealth?.source).toBe("system")
    expect(result.current.timeHealthState.loading).toBe(false)
  })

  it("clears the database after confirmation and shows a success dialog", async () => {
    const { result } = renderHook(() => useSettings(createProps()))

    await flushInitialLoad()
    expect(mockBackendService.getDatabaseStats).toHaveBeenCalledTimes(1)
    mockBackendService.getDatabaseStats.mockClear()
    mockAttendanceManager.getAttendanceStats.mockClear()

    await act(async () => {
      await result.current.handleClearDatabase()
    })

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Clear all face data",
        confirmVariant: "danger",
      }),
    )
    expect(mockBackendService.clearDatabase).toHaveBeenCalledTimes(1)
    expect(mockAlert).toHaveBeenCalledWith({
      title: "Database cleared",
      message: "Face recognition data cleared successfully.",
    })
    expect(mockBackendService.getDatabaseStats).toHaveBeenCalledTimes(1)
    expect(mockAttendanceManager.getAttendanceStats).toHaveBeenCalledTimes(1)
    expect(result.current.isLoading).toBe(false)
  })

  it("does not clear the database if the confirmation dialog is cancelled", async () => {
    mockConfirm.mockResolvedValueOnce(false)
    const { result } = renderHook(() => useSettings(createProps()))

    await flushInitialLoad()

    await act(async () => {
      await result.current.handleClearDatabase()
    })

    expect(mockBackendService.clearDatabase).not.toHaveBeenCalled()
    expect(mockAlert).not.toHaveBeenCalled()
  })

  it("shows a danger dialog when clearing the database fails", async () => {
    mockBackendService.clearDatabase.mockRejectedValueOnce(new Error("clear failed"))
    const { result } = renderHook(() => useSettings(createProps()))

    await flushInitialLoad()

    await act(async () => {
      await result.current.handleClearDatabase()
    })

    expect(mockAlert).toHaveBeenCalledWith({
      title: "Clear failed",
      message: "Failed to clear face recognition data. Please try again.",
      variant: "danger",
    })
    expect(result.current.isLoading).toBe(false)
  })

  it("reloads system data and forwards callbacks when groups change", async () => {
    const onGroupSelect = vi.fn()
    const onGroupsChanged = vi.fn()
    const nextGroup = createAttendanceGroup({ id: "group-2", name: "Afternoon Class" })
    const { result } = renderHook(() =>
      useSettings(
        createProps({
          onGroupSelect,
          onGroupsChanged,
        }),
      ),
    )

    await flushInitialLoad()
    mockBackendService.getDatabaseStats.mockClear()
    mockAttendanceManager.getAttendanceStats.mockClear()

    await act(async () => {
      await result.current.handleGroupsChanged(nextGroup)
    })

    expect(mockBackendService.getDatabaseStats).toHaveBeenCalledTimes(1)
    expect(mockAttendanceManager.getAttendanceStats).toHaveBeenCalledTimes(1)
    expect(onGroupSelect).toHaveBeenCalledWith(nextGroup)
    expect(onGroupsChanged).toHaveBeenCalledTimes(1)
  })

  it("resets export handlers outside the reports view and clears add-member handlers when no group is selected", async () => {
    const initialGroup = createAttendanceGroup()
    const exportCSV = vi.fn()
    const addMemberHandler = vi.fn()
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof createProps>) => useSettings(props),
      {
        initialProps: createProps({
          initialSection: "group",
          initialGroupSection: "reports",
          currentGroup: initialGroup,
        }),
      },
    )

    act(() => {
      result.current.handleExportHandlersReady({ exportCSV })
      result.current.handleAddMemberHandlerReady(addMemberHandler)
    })

    expect(result.current.reportsExportHandlers?.exportCSV).toBe(exportCSV)
    expect(result.current.addMemberHandler).toBe(addMemberHandler)

    act(() => {
      result.current.setActiveSection("attendance")
    })

    expect(result.current.reportsExportHandlers).toBeNull()

    rerender(
      createProps({
        currentGroup: null,
      }),
    )

    expect(result.current.addMemberHandler).toBeNull()
  })
})
