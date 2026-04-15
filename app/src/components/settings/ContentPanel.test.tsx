import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ContentPanel } from "@/components/settings/ContentPanel"
import { useUIStore } from "@/components/main/stores"

vi.mock("@/components/group/hooks", () => ({
  useGroupModals: () => ({
    openEditGroup: vi.fn(),
  }),
}))

vi.mock("@/components/group/stores", () => ({
  useGroupUIStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      lastRegistrationSource: null,
      lastRegistrationMode: null,
      handleRegistrationBack: vi.fn(),
    }),
  ),
}))

describe("ContentPanel anti-spoof prompt", () => {
  const baseProps = {
    activeSection: "attendance",
    groupInitialSection: undefined,
    setGroupInitialSection: vi.fn(),
    validInitialGroup: null,
    currentGroupMembers: [],
    triggerCreateGroup: 0,
    deselectMemberTrigger: 0,
    setDeselectMemberTrigger: vi.fn(),
    setHasSelectedMember: vi.fn(),
    handleExportHandlersReady: vi.fn(),
    handleAddMemberHandlerReady: vi.fn(),
    handleGroupsChanged: vi.fn(),
    handleGroupBack: vi.fn(),
    quickSettings: {
      cameraMirrored: true,
      showRecognitionNames: true,
      showLandmarks: true,
    },
    toggleQuickSetting: vi.fn(),
    audioSettings: {
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
    },
    attendanceSettings: {
      lateThresholdEnabled: false,
      lateThresholdMinutes: 5,
      classStartTime: "08:00",
      attendanceCooldownSeconds: 8,
      enableSpoofDetection: false,
      maxRecognitionFacesPerFrame: 6,
      trackCheckout: false,
      dataRetentionDays: 0,
    },
    updateAttendanceSetting: vi.fn(),
    dropdownValue: "group-1",
    systemData: {
      totalPersons: null,
      totalMembers: null,
      lastUpdated: "",
    },
    timeHealthState: {
      timeHealth: null,
      loading: false,
    },
    groups: [],
    isLoading: false,
    handleClearDatabase: vi.fn(),
    loadSystemData: vi.fn(),
    onGroupsChanged: vi.fn(),
    members: [],
    reportsExportHandlers: null,
    addMemberHandler: null,
    hasSelectedMember: false,
    dropdownGroups: [],
    groupSections: [],
  } as const

  beforeEach(() => {
    vi.clearAllMocks()
    useUIStore.setState({
      antiSpoofDetectionInfoDismissed: false,
      isHydrated: true,
    })
  })

  it("shows a one-time modal before enabling anti-spoof detection", () => {
    const updateAttendanceSetting = vi.fn()

    render(<ContentPanel {...baseProps} updateAttendanceSetting={updateAttendanceSetting} />)

    fireEvent.click(screen.getByLabelText("Toggle anti-spoof detection"))

    expect(screen.getByText("Check Setup Before Enabling Anti-Spoof")).toBeInTheDocument()
    expect(screen.getByText("Check lighting first")).toBeInTheDocument()
    expect(updateAttendanceSetting).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Enable" }))

    expect(updateAttendanceSetting).toHaveBeenCalledWith({ enableSpoofDetection: true })
  })

  it("navigates between modal sections with arrow controls", async () => {
    const updateAttendanceSetting = vi.fn()

    render(<ContentPanel {...baseProps} updateAttendanceSetting={updateAttendanceSetting} />)

    fireEvent.click(screen.getByLabelText("Toggle anti-spoof detection"))

    expect(screen.getByText("Check lighting first")).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText("Next section"))

    expect(await screen.findByText("Check framing and distance")).toBeInTheDocument()
    expect(
      await screen.findByAltText(
        "Admin setup slide showing proper face framing and camera distance.",
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText("Previous section"))

    expect(await screen.findByText("Check lighting first")).toBeInTheDocument()
  })

  it("persists the do-not-show-again choice after confirmation", () => {
    const updateAttendanceSetting = vi.fn()

    render(<ContentPanel {...baseProps} updateAttendanceSetting={updateAttendanceSetting} />)

    fireEvent.click(screen.getByLabelText("Toggle anti-spoof detection"))
    fireEvent.click(screen.getByLabelText("Don't show this again"))
    fireEvent.click(screen.getByRole("button", { name: "Enable" }))

    expect(useUIStore.getState().antiSpoofDetectionInfoDismissed).toBe(true)
    expect(updateAttendanceSetting).toHaveBeenCalledWith({ enableSpoofDetection: true })
  })

  it("enables directly once the info modal has been dismissed", () => {
    const updateAttendanceSetting = vi.fn()
    useUIStore.setState({ antiSpoofDetectionInfoDismissed: true })

    render(<ContentPanel {...baseProps} updateAttendanceSetting={updateAttendanceSetting} />)

    fireEvent.click(screen.getByLabelText("Toggle anti-spoof detection"))

    expect(screen.queryByText("Check Setup Before Enabling Anti-Spoof")).not.toBeInTheDocument()
    expect(updateAttendanceSetting).toHaveBeenCalledWith({ enableSpoofDetection: true })
  })
})
