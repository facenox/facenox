import { renderHook, waitFor, act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAttendanceBootstrap } from "@/components/main/hooks/useAttendanceBootstrap"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"

const { mockBootstrapShellData } = vi.hoisted(() => ({
  mockBootstrapShellData: vi.fn(),
}))

vi.mock("@/components/main/hooks/useAttendanceGroups", () => ({
  bootstrapShellData: (...args: unknown[]) => mockBootstrapShellData(...args),
}))

function resetStores() {
  useUIStore.setState({
    error: null,
    success: null,
    warning: null,
    showSettings: false,
    groupInitialSection: undefined,
    settingsInitialSection: undefined,
    hasSeenIntro: false,
    isHydrated: false,
    sidebarCollapsed: false,
    sidebarWidth: 300,
  })

  useAttendanceStore.setState({
    currentGroup: null,
    attendanceGroups: [],
    groupMembers: [],
    recentAttendance: [],
    isShellBootstrapping: false,
    isShellReady: false,
    shellBootstrapError: null,
    isPanelLoading: false,
    isPanelRefreshing: false,
    isPanelSwitchPending: false,
    showGroupManagement: false,
    showDeleteConfirmation: false,
    groupToDelete: null,
    newGroupName: "",
    persistentCooldowns: new Map(),
    attendanceCooldownSeconds: 8,
    enableSpoofDetection: true,
    maxRecognitionFacesPerFrame: 6,
    dataRetentionDays: 0,
  })
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("useAttendanceBootstrap", () => {
  beforeEach(() => {
    resetStores()
    mockBootstrapShellData.mockReset()
    window.facenoxElectron.updateSplashDataStep.mockClear()
  })

  it("does nothing before UI hydration finishes", () => {
    renderHook(() => useAttendanceBootstrap())

    expect(mockBootstrapShellData).not.toHaveBeenCalled()
    expect(window.facenoxElectron.updateSplashDataStep).not.toHaveBeenCalled()
    expect(useAttendanceStore.getState().isShellReady).toBe(false)
  })

  it("bootstraps the shell and marks it ready on success", async () => {
    useUIStore.setState({ isHydrated: true })
    mockBootstrapShellData.mockResolvedValue(undefined)

    renderHook(() => useAttendanceBootstrap())

    expect(window.facenoxElectron.updateSplashDataStep).toHaveBeenNthCalledWith(1, 8)

    await waitFor(() => {
      expect(useAttendanceStore.getState().isShellReady).toBe(true)
    })

    expect(mockBootstrapShellData).toHaveBeenCalledTimes(1)
    expect(window.facenoxElectron.updateSplashDataStep).toHaveBeenNthCalledWith(2, 9)
    expect(useAttendanceStore.getState().isShellBootstrapping).toBe(false)
    expect(useAttendanceStore.getState().shellBootstrapError).toBeNull()
    expect(useUIStore.getState().error).toBeNull()
  })

  it("captures bootstrap errors and exposes them to the UI store", async () => {
    useUIStore.setState({ isHydrated: true })
    mockBootstrapShellData.mockRejectedValue(new Error("backend offline"))

    renderHook(() => useAttendanceBootstrap())

    await waitFor(() => {
      expect(useAttendanceStore.getState().shellBootstrapError).toBe("backend offline")
    })

    expect(useAttendanceStore.getState().isShellReady).toBe(false)
    expect(useAttendanceStore.getState().isShellBootstrapping).toBe(false)
    expect(useAttendanceStore.getState().isPanelLoading).toBe(false)
    expect(useUIStore.getState().error).toBe("Startup data failed to load: backend offline")
    expect(window.facenoxElectron.updateSplashDataStep).toHaveBeenCalledTimes(1)
    expect(window.facenoxElectron.updateSplashDataStep).toHaveBeenNthCalledWith(1, 8)
  })

  it("stops before mutating final state if the hook unmounts during bootstrap", async () => {
    useUIStore.setState({ isHydrated: true })
    const deferred = createDeferred<void>()
    mockBootstrapShellData.mockImplementation(() => deferred.promise)

    const { unmount } = renderHook(() => useAttendanceBootstrap())

    expect(window.facenoxElectron.updateSplashDataStep).toHaveBeenNthCalledWith(1, 8)

    unmount()

    await act(async () => {
      deferred.resolve()
      await deferred.promise
      await Promise.resolve()
    })

    expect(window.facenoxElectron.updateSplashDataStep).toHaveBeenCalledTimes(1)
    expect(useAttendanceStore.getState().isShellReady).toBe(false)
    expect(useAttendanceStore.getState().shellBootstrapError).toBeNull()
    expect(useUIStore.getState().error).toBeNull()
  })
})
