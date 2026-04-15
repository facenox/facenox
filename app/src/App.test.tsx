import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "@/App"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"

const { mockUseAttendanceBootstrap } = vi.hoisted(() => ({
  mockUseAttendanceBootstrap: vi.fn(),
}))

vi.mock("@/components/window", () => ({
  WindowBar: () => <div>Mock WindowBar</div>,
}))

vi.mock("@/components/main", () => ({
  default: () => <div>Mock Main</div>,
}))

vi.mock("@/components/shared/IntroModal", () => ({
  IntroModal: () => <div>Mock Intro Modal</div>,
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
      showLandmarks: true,
    },
    audioSettings: {
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
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
  beforeEach(() => {
    resetStores()
    mockUseAttendanceBootstrap.mockReset()
  })

  it("keeps the unrevealed shell visible until hydration and shell data are ready", () => {
    render(<App />)

    expect(screen.getByText("Mock WindowBar")).toBeInTheDocument()
    expect(screen.queryByText("Mock Main")).not.toBeInTheDocument()
    expect(screen.queryByText("Mock App Skeleton")).not.toBeInTheDocument()
    expect(window.facenoxElectron.onAppReady).not.toHaveBeenCalled()
    expect(mockUseAttendanceBootstrap).toHaveBeenCalledTimes(1)
  })

  it("shows the intro path and signals app-ready only once when the shell becomes visible", () => {
    useUIStore.setState({ isHydrated: true, hasSeenIntro: false })
    useAttendanceStore.setState({ isShellReady: true, shellBootstrapError: null })

    const { rerender } = render(<App />)

    expect(screen.getByText("Mock WindowBar")).toBeInTheDocument()
    expect(screen.getByText("Mock App Skeleton")).toBeInTheDocument()
    expect(screen.getByText("Mock Intro Modal")).toBeInTheDocument()
    expect(screen.queryByText("Mock Main")).not.toBeInTheDocument()
    expect(window.facenoxElectron.onAppReady).toHaveBeenCalledTimes(1)

    rerender(<App />)

    expect(window.facenoxElectron.onAppReady).toHaveBeenCalledTimes(1)
  })

  it("renders the main app once the intro has already been seen", () => {
    useUIStore.setState({ isHydrated: true, hasSeenIntro: true })
    useAttendanceStore.setState({ isShellReady: true, shellBootstrapError: null })

    render(<App />)

    expect(screen.getByText("Mock Main")).toBeInTheDocument()
    expect(screen.queryByText("Mock App Skeleton")).not.toBeInTheDocument()
    expect(screen.queryByText("Mock Intro Modal")).not.toBeInTheDocument()
    expect(window.facenoxElectron.onAppReady).toHaveBeenCalledTimes(1)
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
    expect(screen.queryByText("Mock Intro Modal")).not.toBeInTheDocument()
    expect(window.facenoxElectron.onAppReady).toHaveBeenCalledTimes(1)
  })
})
