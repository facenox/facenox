import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "@/App"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { createFacenoxElectronMock } from "@/test/mocks/electron"

const { mockUseAttendanceBootstrap, mockUseCloudSyncConfig } = vi.hoisted(() => ({
  mockUseAttendanceBootstrap: vi.fn(),
  mockUseCloudSyncConfig: vi.fn(),
}))

vi.mock("@/components/window", () => ({
  WindowBar: () => <div>Mock WindowBar</div>,
}))

vi.mock("@/components/main", () => ({
  default: () => <div>Mock Main</div>,
}))

vi.mock("@/components/shared/IntroModal", () => ({
  IntroModal: ({
    initialStep = 0,
    allowLocalContinue = false,
  }: {
    initialStep?: number
    allowLocalContinue?: boolean
  }) => (
    <div>
      Mock Intro Modal (step={initialStep}, local={String(allowLocalContinue)})
    </div>
  ),
}))

vi.mock("@/components/shared/AppSkeleton", () => ({
  AppSkeleton: () => <div>Mock App Skeleton</div>,
}))

vi.mock("@/components/shared", () => ({
  DialogProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("@/components/main/hooks/useAttendanceBootstrap", () => ({
  useAttendanceBootstrap: () => mockUseAttendanceBootstrap(),
}))

vi.mock("@/services/cloudSyncState", () => ({
  useCloudSyncConfig: () => mockUseCloudSyncConfig(),
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
    antiSpoofDetectionInfoDismissed: false,
    isHydrated: false,
    sidebarCollapsed: false,
    sidebarWidth: 300,
    quickSettings: {
      cameraMirrored: true,
      showRecognitionNames: true,
    },
    audioSettings: {
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
    },
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

describe("App", () => {
  let bridge: ReturnType<typeof createFacenoxElectronMock>
  beforeEach(() => {
    bridge = createFacenoxElectronMock()
    window.facenoxElectron = bridge
    resetStores()
    mockUseAttendanceBootstrap.mockReset()
    mockUseCloudSyncConfig.mockReturnValue({
      config: { connected: true },
      status: "ready",
      error: null,
    })
  })

  it("keeps the unrevealed shell visible until hydration and shell data are ready", () => {
    render(<App />)

    expect(screen.getByText("Mock WindowBar")).toBeInTheDocument()
    expect(screen.queryByText("Mock Main")).not.toBeInTheDocument()
    expect(screen.getByText("Mock App Skeleton")).toBeInTheDocument()
    expect(bridge.onAppReady).not.toHaveBeenCalled()
    expect(mockUseAttendanceBootstrap).toHaveBeenCalledTimes(1)
  })

  it("shows the intro path and signals app-ready only once when the shell becomes visible", () => {
    useUIStore.setState({ isHydrated: true, hasSeenIntro: false })
    useAttendanceStore.setState({ isShellReady: true, shellBootstrapError: null })

    const { rerender } = render(<App />)

    expect(screen.getByText("Mock WindowBar")).toBeInTheDocument()
    expect(screen.getByText("Mock App Skeleton")).toBeInTheDocument()
    expect(screen.getByText(/Mock Intro Modal/)).toBeInTheDocument()
    expect(screen.queryByText("Mock Main")).not.toBeInTheDocument()
    expect(bridge.onAppReady).toHaveBeenCalledTimes(1)

    rerender(<App />)

    expect(bridge.onAppReady).toHaveBeenCalledTimes(1)
  })

  it("renders the main app once the intro has been seen and the device is paired", () => {
    useUIStore.setState({ isHydrated: true, hasSeenIntro: true })
    useAttendanceStore.setState({ isShellReady: true, shellBootstrapError: null })

    render(<App />)

    expect(screen.getByText("Mock Main")).toBeInTheDocument()
    expect(screen.queryByText("Mock App Skeleton")).not.toBeInTheDocument()
    expect(screen.queryByText(/Mock Intro Modal/)).not.toBeInTheDocument()
    expect(bridge.onAppReady).toHaveBeenCalledTimes(1)
  })

  it("gates unpaired fresh installs on Cloud pairing even if intro was previously marked seen", () => {
    mockUseCloudSyncConfig.mockReturnValue({
      config: { connected: false },
      status: "ready",
      error: null,
    })
    useUIStore.setState({ isHydrated: true, hasSeenIntro: true })
    useAttendanceStore.setState({ isShellReady: true, shellBootstrapError: null })

    render(<App />)

    expect(screen.getByText("Mock Intro Modal (step=2, local=false)")).toBeInTheDocument()
    expect(screen.queryByText("Mock Main")).not.toBeInTheDocument()
  })

  it("preserves access for existing beta installations with local data when unpaired", () => {
    // Legacy pre-Cloud beta users have local data but were NEVER paired (no dataOrigin set).
    // wasEverPaired=false means allowLocalContinue remains true → main app renders.
    mockUseCloudSyncConfig.mockReturnValue({
      config: { connected: false, wasEverPaired: false },
      status: "ready",
      error: null,
    })
    useUIStore.setState({ isHydrated: true, hasSeenIntro: true })
    useAttendanceStore.setState({
      isShellReady: true,
      shellBootstrapError: null,
      systemStats: { totalPersons: 1, totalMembers: 1, lastUpdated: "2026-11-26T00:00:00Z" },
    })

    render(<App />)

    expect(screen.getByText("Mock Main")).toBeInTheDocument()
    expect(screen.queryByText(/Mock Intro Modal/)).not.toBeInTheDocument()
  })

  it("re-gates Cloud connection when a previously-paired device is unpaired even with local data", () => {
    // Post-v1 bypass path: user paired → created data → unpaired.
    // wasEverPaired=true means allowLocalContinue=false → Cloud gate re-appears.
    mockUseCloudSyncConfig.mockReturnValue({
      config: { connected: false, wasEverPaired: true },
      status: "ready",
      error: null,
    })
    useUIStore.setState({ isHydrated: true, hasSeenIntro: true })
    useAttendanceStore.setState({
      isShellReady: true,
      shellBootstrapError: null,
      systemStats: { totalPersons: 1, totalMembers: 1, lastUpdated: "2026-11-26T00:00:00Z" },
    })

    render(<App />)

    // Despite local data existing, Cloud gate must show because device was previously paired.
    expect(screen.getByText("Mock Intro Modal (step=2, local=false)")).toBeInTheDocument()
    expect(screen.queryByText("Mock Main")).not.toBeInTheDocument()
  })

  it("reveals the main app when bootstrap failed but the shell should still open", () => {
    useUIStore.setState({ isHydrated: true, hasSeenIntro: false })
    useAttendanceStore.setState({
      isShellReady: false,
      shellBootstrapError: "Startup failed",
    })

    render(<App />)

    expect(screen.getByText("Mock Main")).toBeInTheDocument()
    expect(screen.queryByText("Mock App Skeleton")).not.toBeInTheDocument()
    expect(screen.queryByText(/Mock Intro Modal/)).not.toBeInTheDocument()
    expect(bridge.onAppReady).toHaveBeenCalledTimes(1)
  })
})
