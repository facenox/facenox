import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import Main from "./index"
import { useAttendanceBootstrap } from "./hooks/useAttendanceBootstrap"
import { useAttendanceStore, useUIStore, useCameraStore } from "./stores"
import { useGroupStore } from "@/components/group/stores"
import { GroupManager } from "@/services/attendance/GroupManager"
import { MemberManager } from "@/services/attendance/MemberManager"
import { RecordManager } from "@/services/attendance/RecordManager"
import { AttendancePanel } from "./components/AttendancePanel"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures"
import type { HttpClient } from "@/services/attendance/HttpClient"
import type { AttendanceMember } from "@/types/recognition"

const { manager, backend, settings, startCamera, stopCamera, noop, sidebar } = vi.hoisted(() => ({
  manager: {
    getSettings: vi.fn(),
    getGroups: vi.fn(),
    getGroupMembers: vi.fn(),
    getMembers: vi.fn(),
    getRecords: vi.fn(),
    getAttendanceStats: vi.fn(),
    getTimeHealth: vi.fn(),
  },
  backend: { getDatabaseStats: vi.fn() },
  settings: {
    getUIState: vi.fn(async () => ({ selectedGroupId: "A" })),
    setUIState: vi.fn(async () => {}),
    setQuickSettings: vi.fn(async () => {}),
    setAudioSettings: vi.fn(async () => {}),
    getQuickSettings: vi.fn(async () => ({
      autoStartScan: false,
      cameraMirrored: false,
      showRecognitionNames: true,
    })),
    getAudioSettings: vi.fn(async () => ({
      recognitionSoundEnabled: false,
      recognitionSoundUrl: null,
    })),
    getSecuritySettings: vi.fn(async () => ({})),
  },
  startCamera: vi.fn(),
  stopCamera: vi.fn(),
  noop: () => {},
  sidebar: vi.fn(),
}))
vi.mock("@/services", () => ({ attendanceManager: manager, backendService: backend }))
vi.mock("@/services/AttendanceManager", () => ({ attendanceManager: manager }))
vi.mock("@/services/PersistentSettingsService", () => ({ persistentSettings: settings }))
vi.mock("@/services/SoundEffectsService", () => ({ soundEffects: { preload: () => {} } }))
vi.mock("./hooks", async () => ({
  useAttendanceGroups: (await import("./hooks/useAttendanceGroups")).useAttendanceGroups,
  useStreamState: () => {},
  useVideoStream: () => ({ captureFrame: noop, getCameraDevices: noop }),
  useOverlayRendering: () => ({ animate: noop, resetOverlayRefs: noop }),
  useFaceDetection: () => {},
  useFaceRecognition: () => ({ performFaceRecognition: noop }),
  useFaceTracking: () => ({ calculateAngleConsistencyRef: { current: noop } }),
  useBackendService: () => ({ initializeWebSocket: noop }),
  useCameraControl: () => ({ startCamera, stopCamera }),
}))
vi.mock("./components/Sidebar", () => ({ Sidebar: (props: unknown) => sidebar(props) }))
vi.mock("./components/MainModals", () => ({ MainModals: () => null }))
vi.mock("./components/CooldownOverlay", () => ({ CooldownOverlay: () => null }))
vi.mock("./components/ManualEntryModal", () => ({ ManualEntryModal: () => null }))
vi.mock("./components/ManualCorrectionModal", () => ({ ManualCorrectionModal: () => null }))
vi.mock("@/components/shared", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MemberTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Dropdown: ({
    options,
    value,
  }: {
    options: { value: string; label: string }[]
    value: string
  }) => (
    <select value={value} onChange={() => {}}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}))

const groupA = createAttendanceGroup({ id: "A", name: "Group A" })
const groupB = createAttendanceGroup({ id: "B", name: "Group B" })
const enrolledA = createAttendanceMember({ group_id: "A", name: "Enrolled A", has_face_data: true })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
function Startup() {
  useAttendanceBootstrap()
  const ready = useAttendanceStore((s) => s.isShellReady)
  const error = useAttendanceStore((s) => s.shellBootstrapError)
  return ready || error ? <Main /> : <div>Startup pending</div>
}
beforeEach(() => {
  vi.clearAllMocks()
  sidebar.mockReturnValue(null)
  Object.assign(window.facenoxElectron!, {
    onMinimize: vi.fn(() => noop),
    onRestore: vi.fn(() => noop),
  })
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(useGroupStore.getState(), "fetchOverviewData").mockResolvedValue(undefined)
  manager.getSettings.mockResolvedValue({})
  manager.getGroups.mockResolvedValue([groupA, groupB])
  manager.getGroupMembers.mockResolvedValue([enrolledA])
  manager.getMembers.mockResolvedValue([enrolledA])
  manager.getRecords.mockResolvedValue([])
  manager.getAttendanceStats.mockResolvedValue({ total_members: 1 })
  manager.getTimeHealth.mockResolvedValue(null)
  backend.getDatabaseStats.mockResolvedValue({ total_persons: 1 })
  settings.getUIState.mockResolvedValue({ selectedGroupId: "A" })
  useAttendanceStore.setState({
    currentGroup: null,
    attendanceGroups: [],
    groupMembers: [],
    recentAttendance: [],
    isShellReady: false,
    isShellBootstrapping: true,
    shellBootstrapError: null,
    isPanelLoading: false,
    isPanelRefreshing: false,
    isPanelSwitchPending: false,
    panelDataError: null,
    timeHealth: null,
    showGroupManagement: false,
  })
  useGroupStore.setState({ selectedGroup: null, groups: [], members: [] })
  useCameraStore.setState({
    isStreaming: false,
    isVideoLoading: false,
    selectedCamera: "fake",
    cameraDevices: [
      { deviceId: "fake", label: "Fake camera", kind: "videoinput" } as MediaDeviceInfo,
    ],
  })
  useUIStore.setState({
    isHydrated: true,
    showSettings: false,
    pendingCloudSetup: false,
    error: null,
    success: null,
    warning: null,
    quickSettings: { autoStartScan: false, cameraMirrored: false, showRecognitionNames: true },
    audioSettings: { recognitionSoundEnabled: false, recognitionSoundUrl: null },
  })
})
afterEach(() => {
  vi.useRealTimers()
})

it("does not show an empty-enrollment prompt while existing enrolled members are loading", async () => {
  const pending = deferred<AttendanceMember[]>()
  manager.getGroupMembers.mockReturnValue(pending.promise)
  render(<Startup />)
  await waitFor(() =>
    expect(manager.getGroupMembers).toHaveBeenCalledWith("A", { throwOnError: true }),
  )
  expect(useAttendanceStore.getState().isShellReady).toBe(true)
  expect(useAttendanceStore.getState().isPanelLoading).toBe(true)
  expect(screen.queryByText("Add and enroll at least one member to start scanning.")).toBeNull()
  expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled()
  await act(async () => {
    pending.resolve([enrolledA])
    await pending.promise
  })
  expect(screen.queryByText("Add and enroll at least one member to start scanning.")).toBeNull()
  expect(screen.getByRole("button", { name: "Start scan" })).toBeEnabled()
})

it("clears the previous group's eligibility and enrollment banner immediately on selection", async () => {
  const membersA = [
    enrolledA,
    createAttendanceMember({ group_id: "A", has_face_data: false }),
    createAttendanceMember({ group_id: "A", has_face_data: false }),
  ]
  useAttendanceStore.setState({
    currentGroup: groupA,
    attendanceGroups: [groupA, groupB],
    groupMembers: membersA,
    isShellReady: true,
  })
  const pendingB = deferred<AttendanceMember[]>()
  manager.getGroupMembers.mockImplementation((id: string) =>
    id === "A" ? Promise.resolve(membersA) : pendingB.promise,
  )
  render(
    <>
      <Main />
      <AttendancePanel handleSelectGroup={async () => {}} refreshAttendanceData={async () => {}} />
    </>,
  )
  await waitFor(() => expect(screen.getByRole("button", { name: "Start scan" })).toBeEnabled())
  vi.useFakeTimers()
  act(() => window.dispatchEvent(new CustomEvent("selectGroup", { detail: { group: groupB } })))
  expect(useAttendanceStore.getState().currentGroup?.id).toBe("B")
  expect(useAttendanceStore.getState().isPanelSwitchPending).toBe(true)
  expect(useAttendanceStore.getState().groupMembers).toEqual([])
  expect(screen.queryByText("2 members need face enrollment")).toBeNull()
  expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120)
  })
  expect(screen.queryByText("Add and enroll at least one member to start scanning.")).toBeNull()
  expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled()
  await act(async () => {
    pendingB.resolve([])
    await pendingB.promise
  })
  expect(
    screen.getByText("Add and enroll at least one member to start scanning."),
  ).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Start scan" })).toBeDisabled()
})

it("shows a bootstrap error without clearing the remembered group when group lookup fails", async () => {
  const http = { get: vi.fn().mockRejectedValue(new Error("HTTP 503")) }
  const actual = new GroupManager(http as unknown as HttpClient, { groups: "/groups" })
  manager.getGroups.mockImplementation((options) => actual.getGroups(options))
  useAttendanceStore.setState({ currentGroup: groupA, attendanceGroups: [groupA] })
  render(<Startup />)
  await waitFor(() => expect(useAttendanceStore.getState().shellBootstrapError).toBeTruthy())
  expect(screen.queryByText("Create a group to start scanning.")).toBeNull()
  expect(screen.getByText("Attendance data couldn't be loaded.")).toBeInTheDocument()
  expect(useAttendanceStore.getState().attendanceGroups).toEqual([groupA])
  expect(useAttendanceStore.getState().currentGroup).toEqual(groupA)
  expect(settings.setUIState).not.toHaveBeenCalledWith({ selectedGroupId: null })
})

it.each(["selected group", "all groups"])(
  "shows a data error instead of a no-members state for %s",
  async (mode) => {
    const http = { get: vi.fn().mockRejectedValue(new Error("HTTP 503")) }
    if (mode === "selected group") {
      const actual = new GroupManager(http as unknown as HttpClient, { groups: "/groups" })
      manager.getGroupMembers.mockImplementation((id: string, options) =>
        actual.getGroupMembers(id, options),
      )
    } else {
      settings.getUIState.mockResolvedValue({ selectedGroupId: "all" })
      const actual = new MemberManager(http as unknown as HttpClient, { members: "/members" })
      manager.getMembers.mockImplementation((options) => actual.getMembers(options))
    }
    render(<Startup />)
    await waitFor(() => expect(useAttendanceStore.getState().panelDataError).toBeTruthy())
    expect(screen.queryByText("Add and enroll at least one member to start scanning.")).toBeNull()
    expect(screen.getByText("Attendance data couldn't be loaded.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start scan" })).toBeDisabled()
    expect(useAttendanceStore.getState().isShellReady).toBe(true)
    expect(useUIStore.getState().error).toBeNull()
  },
)

it("shows a failed record load instead of a successful empty attendance panel", async () => {
  const http = { get: vi.fn().mockRejectedValue(new Error("HTTP 503")) }
  const actual = new RecordManager(
    http as unknown as HttpClient,
    { records: "/records" },
    () => "",
    noop,
    noop,
  )
  manager.getRecords.mockImplementation((filters, options) => actual.getRecords(filters, options))
  render(
    <>
      <Startup />
      <AttendancePanel handleSelectGroup={async () => {}} refreshAttendanceData={async () => {}} />
    </>,
  )
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument())
  expect(screen.queryByText("No records for this period")).toBeNull()
  expect(screen.queryByText("This group has no members")).toBeNull()
  expect(useUIStore.getState().error).toBeNull()
})

it("Space cannot bypass missing-enrollment or loading checks", () => {
  useAttendanceStore.setState({
    currentGroup: groupA,
    attendanceGroups: [groupA],
    isShellReady: true,
  })
  render(<Main />)
  fireEvent.keyDown(window, { code: "Space" })
  expect(startCamera).not.toHaveBeenCalled()
})

it("auto-start waits for member data and starts once when enrollment is confirmed", async () => {
  const pending = deferred<AttendanceMember[]>()
  manager.getGroupMembers.mockReturnValue(pending.promise)
  useAttendanceStore.setState({
    currentGroup: groupA,
    attendanceGroups: [groupA],
    isShellReady: true,
  })
  useUIStore.setState({
    quickSettings: { ...useUIStore.getState().quickSettings, autoStartScan: true },
  })
  render(<Main />)
  expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled()
  expect(startCamera).not.toHaveBeenCalled()
  await act(async () => {
    pending.resolve([enrolledA])
    await pending.promise
  })
  expect(startCamera).toHaveBeenCalledTimes(1)
  act(() =>
    useAttendanceStore.setState({ groupMembers: [...useAttendanceStore.getState().groupMembers] }),
  )
  expect(startCamera).toHaveBeenCalledTimes(1)
})

it("retries an initial member-load failure without flashing an empty prompt", async () => {
  sidebar.mockImplementation((props) => <AttendancePanel {...props} />)
  manager.getGroupMembers.mockRejectedValueOnce(new Error("HTTP 503"))
  render(<Startup />)
  await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument())
  const pending = deferred<AttendanceMember[]>()
  manager.getGroupMembers.mockReturnValue(pending.promise)
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled())
  expect(screen.queryByText("Add and enroll at least one member to start scanning.")).toBeNull()
  await act(async () => {
    pending.resolve([enrolledA])
    await pending.promise
  })
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
  expect(screen.getByRole("button", { name: "Start scan" })).toBeEnabled()
})

it("keeps Space blocked after confirming there are no enrolled members", async () => {
  manager.getGroupMembers.mockResolvedValue([
    createAttendanceMember({ group_id: "A", has_face_data: false }),
  ])
  render(<Startup />)
  await waitFor(() =>
    expect(screen.getByText("Enroll at least one member to start scanning.")).toBeInTheDocument(),
  )
  fireEvent.keyDown(window, { code: "Space" })
  expect(startCamera).not.toHaveBeenCalled()
})

it("auto-start stays idle when a successful member load contains no enrolled faces", async () => {
  manager.getGroupMembers.mockResolvedValue([])
  useUIStore.setState({
    quickSettings: { ...useUIStore.getState().quickSettings, autoStartScan: true },
  })
  render(<Startup />)
  await waitFor(() =>
    expect(
      screen.getByText("Add and enroll at least one member to start scanning."),
    ).toBeInTheDocument(),
  )
  expect(startCamera).not.toHaveBeenCalled()
})

it("auto-start waits for a camera device even after enrolled members finish loading", async () => {
  const devices = useCameraStore.getState().cameraDevices
  useCameraStore.setState({ cameraDevices: [] })
  useUIStore.setState({
    quickSettings: { ...useUIStore.getState().quickSettings, autoStartScan: true },
  })
  render(<Startup />)
  await waitFor(() => expect(useAttendanceStore.getState().groupMembers).toEqual([enrolledA]))
  expect(startCamera).not.toHaveBeenCalled()
  act(() => useCameraStore.setState({ cameraDevices: devices }))
  expect(startCamera).toHaveBeenCalledTimes(1)
})

it("Space starts scanning when data is ready, and Stop stays usable if data later fails", async () => {
  render(<Startup />)
  await waitFor(() => expect(screen.getByRole("button", { name: "Start scan" })).toBeEnabled())
  fireEvent.keyDown(window, { code: "Space" })
  expect(startCamera).toHaveBeenCalledTimes(1)
  act(() => {
    useCameraStore.setState({ isStreaming: true })
    useAttendanceStore.setState({ panelDataError: "Unable to load attendance data. Try again." })
  })
  fireEvent.click(screen.getByRole("button", { name: "Stop" }))
  expect(stopCamera).toHaveBeenCalled()
})

it("keeps the create-group message for a genuinely empty database", async () => {
  manager.getGroups.mockResolvedValue([])
  render(<Startup />)
  await waitFor(() =>
    expect(screen.getByText("Create a group to start scanning.")).toBeInTheDocument(),
  )
  expect(screen.getByRole("button", { name: "Start scan" })).toBeDisabled()
  expect(manager.getGroupMembers).not.toHaveBeenCalled()
})

it("loads All Groups before enabling scanning without inserting the virtual group into the list", async () => {
  settings.getUIState.mockResolvedValue({ selectedGroupId: "all" })
  const pending = deferred<AttendanceMember[]>()
  manager.getMembers.mockReturnValue(pending.promise)
  render(<Startup />)
  await waitFor(() => expect(manager.getMembers).toHaveBeenCalledWith({ throwOnError: true }))
  expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled()
  expect(screen.queryByText("Add and enroll at least one member to start scanning.")).toBeNull()
  await act(async () => {
    pending.resolve([enrolledA])
    await pending.promise
  })
  expect(screen.getByRole("button", { name: "Start scan" })).toBeEnabled()
  expect(useAttendanceStore.getState().attendanceGroups.map((group) => group.id)).toEqual([
    "A",
    "B",
  ])
  expect(manager.getGroupMembers).not.toHaveBeenCalled()
})

it.each(["no members", "no enrolled members"])(
  "keeps the appropriate prompt after a successful load with %s",
  async (mode) => {
    manager.getGroupMembers.mockResolvedValue(
      mode === "no members" ?
        []
      : [createAttendanceMember({ group_id: "A", has_face_data: false })],
    )
    render(<Startup />)
    const message =
      mode === "no members" ?
        "Add and enroll at least one member to start scanning."
      : "Enroll at least one member to start scanning."
    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument())
    await waitFor(() => expect(useAttendanceStore.getState().isPanelLoading).toBe(false))
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start scan" })).toBeDisabled()
  },
)
