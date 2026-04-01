import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AttendancePanel } from "@/components/main/components/AttendancePanel"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import {
  createAttendanceGroup,
  createAttendanceMember,
  createAttendanceRecord,
} from "@/test/fixtures"
import { renderWithProviders } from "@/test/utils/renderWithProviders"

vi.mock("@/components/shared", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MemberTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Dropdown: ({
    options,
    value,
    onChange,
    placeholder = "Select...",
  }: {
    options: { value: string | number; label: string }[]
    value: string | number | null | undefined
    onChange: (value: string | null) => void
    placeholder?: string
  }) => (
    <select
      data-testid="mock-dropdown"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

vi.mock("@/components/main/components/ManualEntryModal", () => ({
  ManualEntryModal: () => null,
}))

vi.mock("@/components/main/components/ManualCorrectionModal", () => ({
  ManualCorrectionModal: () => null,
}))

function resetStores() {
  useAttendanceStore.setState({
    currentGroup: null,
    attendanceGroups: [],
    groupMembers: [],
    recentAttendance: [],
    isShellBootstrapping: false,
    isShellReady: true,
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

  useUIStore.setState({
    error: null,
    success: null,
    warning: null,
    showSettings: false,
    groupInitialSection: undefined,
    settingsInitialSection: undefined,
    hasSeenIntro: false,
    isHydrated: true,
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
}

describe("AttendancePanel", () => {
  beforeEach(() => {
    resetStores()
  })

  it("renders the shell skeleton when the shell is not ready", () => {
    useAttendanceStore.setState({ isShellReady: false })

    renderWithProviders(
      <AttendancePanel
        handleSelectGroup={vi.fn()}
        refreshAttendanceData={vi.fn().mockResolvedValue(undefined)}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByTestId("attendance-panel-shell-skeleton")).toBeInTheDocument()
  })

  it("shows the no groups empty state", () => {
    renderWithProviders(
      <AttendancePanel
        handleSelectGroup={vi.fn()}
        refreshAttendanceData={vi.fn().mockResolvedValue(undefined)}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByText("No groups created yet")).toBeInTheDocument()
  })

  it("shows a no results state after an unmatched search", async () => {
    const group = createAttendanceGroup()
    useAttendanceStore.setState({
      attendanceGroups: [group],
      currentGroup: group,
      groupMembers: [createAttendanceMember()],
      recentAttendance: [
        createAttendanceRecord({
          id: "record-1",
          person_id: "person-1",
          timestamp: new Date("2026-04-01T08:00:00.000Z"),
        }),
      ],
    })

    renderWithProviders(
      <AttendancePanel
        handleSelectGroup={vi.fn()}
        refreshAttendanceData={vi.fn().mockResolvedValue(undefined)}
      />,
      { withDialogProvider: false },
    )

    fireEvent.change(screen.getByPlaceholderText("Search name..."), {
      target: { value: "Bob" },
    })

    expect(screen.getByText('No results for "Bob"')).toBeInTheDocument()
  })

  it("reveals additional records after clicking Load More", async () => {
    const group = createAttendanceGroup()
    const now = new Date()
    const baseDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    const members = Array.from({ length: 25 }, (_, index) =>
      createAttendanceMember({
        person_id: `person-${index + 1}`,
        name: `Member ${String(index + 1).padStart(2, "0")}`,
      }),
    )
    const records = members.map((member, index) =>
      createAttendanceRecord({
        id: `record-${index + 1}`,
        person_id: member.person_id,
        timestamp: new Date(`${baseDate}T${String(8 + (index % 10)).padStart(2, "0")}:00:00`),
      }),
    )

    useAttendanceStore.setState({
      attendanceGroups: [group],
      currentGroup: group,
      groupMembers: members,
      recentAttendance: records,
    })

    renderWithProviders(
      <AttendancePanel
        handleSelectGroup={vi.fn()}
        refreshAttendanceData={vi.fn().mockResolvedValue(undefined)}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByRole("button", { name: /Load More \(5 remaining\)/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Load More \(5 remaining\)/ }))

    expect(screen.queryByRole("button", { name: /Load More/ })).not.toBeInTheDocument()
  })

  it("routes the no-members empty state to settings registration", async () => {
    const group = createAttendanceGroup()
    useAttendanceStore.setState({
      attendanceGroups: [group],
      currentGroup: group,
      groupMembers: [],
      recentAttendance: [],
    })

    const { user } = renderWithProviders(
      <AttendancePanel
        handleSelectGroup={vi.fn()}
        refreshAttendanceData={vi.fn().mockResolvedValue(undefined)}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByText("No members in this group yet")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Add Member" }))

    expect(useUIStore.getState().showSettings).toBe(true)
    expect(useUIStore.getState().groupInitialSection).toBe("members")
  })

  it("routes the no-face-data empty state to settings registration", async () => {
    const group = createAttendanceGroup()
    useAttendanceStore.setState({
      attendanceGroups: [group],
      currentGroup: group,
      groupMembers: [createAttendanceMember({ has_face_data: false })],
      recentAttendance: [],
    })

    const { user } = renderWithProviders(
      <AttendancePanel
        handleSelectGroup={vi.fn()}
        refreshAttendanceData={vi.fn().mockResolvedValue(undefined)}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByText("No face biometric data registered yet.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Register Face" }))

    expect(useUIStore.getState().showSettings).toBe(true)
    expect(useUIStore.getState().groupInitialSection).toBe("members")
  })
})
