import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ContentPanel } from "@/components/settings/ContentPanel"
import { useUIStore } from "@/components/main/stores"
import { useGroupUIStore } from "@/components/group/stores"
import { attendanceManager } from "@/services"
import { DialogProvider } from "@/components/shared/DialogProvider"

const MOTION_PROP_KEYS = new Set([
  "layout",
  "layoutId",
  "variants",
  "initial",
  "animate",
  "exit",
  "transition",
  "custom",
  "whileHover",
  "whileTap",
])

const motionComponentCache = new Map<
  string,
  React.FC<{ children?: ReactNode } & Record<string, unknown>>
>()

function createMotionComponent(tag: string) {
  function MotionTagComponent({ children, ...props }: Record<string, unknown>) {
    const domProps = Object.fromEntries(
      Object.entries(props).filter(([key]) => !MOTION_PROP_KEYS.has(key)),
    )
    const Tag = tag as keyof React.JSX.IntrinsicElements
    return <Tag {...domProps}>{children as ReactNode}</Tag>
  }
  MotionTagComponent.displayName = `motion.${tag}`
  return MotionTagComponent
}

function MockAnimatePresence({ children }: { children: ReactNode }) {
  return <>{children}</>
}
MockAnimatePresence.displayName = "AnimatePresence"

vi.mock("framer-motion", () => ({
  AnimatePresence: MockAnimatePresence,
  motion: new Proxy(
    {},
    {
      get: (_, tag: string) => {
        let Component = motionComponentCache.get(tag)
        if (!Component) {
          Component = createMotionComponent(tag)
          motionComponentCache.set(tag, Component)
        }
        return Component
      },
    },
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
    },
    toggleQuickSetting: vi.fn(),
    audioSettings: {
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
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
    updateAudioSetting: vi.fn(),
    setActiveSection: vi.fn(),
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
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useGroupUIStore.setState({ showCreateGroupModal: false })
    useUIStore.setState({
      antiSpoofDetectionInfoDismissed: false,
      isHydrated: true,
    })
  })

  it("opens and cancels group creation without leaving the directory", async () => {
    vi.spyOn(window.electronAPI.sync, "getConfig").mockResolvedValue({
      connected: false,
    } as Awaited<ReturnType<typeof window.electronAPI.sync.getConfig>>)
    render(
      <DialogProvider>
        <ContentPanel {...baseProps} activeSection="groups" />
      </DialogProvider>,
    )
    const create = screen.getByRole("button", { name: "Create group" })
    await waitFor(() => expect(create).toBeEnabled())
    fireEvent.click(create)
    expect(screen.getByPlaceholderText("Group name")).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "Search groups" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByPlaceholderText("Group name")).not.toBeInTheDocument())
    expect(baseProps.setActiveSection).not.toHaveBeenCalled()
  })

  it("refreshes groups after creation without selecting a different workspace", async () => {
    vi.spyOn(window.electronAPI.sync, "getConfig").mockResolvedValue({
      connected: false,
    } as Awaited<ReturnType<typeof window.electronAPI.sync.getConfig>>)
    const createGroup = vi
      .spyOn(attendanceManager, "createGroup")
      .mockResolvedValue({ id: "new", name: "New group" } as Awaited<
        ReturnType<typeof attendanceManager.createGroup>
      >)
    render(
      <DialogProvider>
        <ContentPanel {...baseProps} activeSection="groups" />
      </DialogProvider>,
    )
    const create = screen.getByRole("button", { name: "Create group" })
    await waitFor(() => expect(create).toBeEnabled())
    fireEvent.click(create)
    fireEvent.change(screen.getByPlaceholderText("Group name"), { target: { value: "New group" } })
    const buttons = screen.getAllByRole("button", { name: "Create group" })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(baseProps.onGroupsChanged).toHaveBeenCalled())
    expect(baseProps.loadSystemData).toHaveBeenCalled()
    expect(baseProps.handleGroupsChanged).not.toHaveBeenCalled()
    expect(baseProps.setActiveSection).not.toHaveBeenCalled()
    createGroup.mockRestore()
  })

  it("shows a one-time modal before enabling anti-spoof detection", () => {
    const updateAttendanceSetting = vi.fn()

    render(<ContentPanel {...baseProps} updateAttendanceSetting={updateAttendanceSetting} />)

    fireEvent.click(screen.getByLabelText("Liveness verification (anti-spoof)"))

    expect(screen.getByText("Before enabling liveness")).toBeInTheDocument()
    expect(screen.getByText("Use balanced lighting")).toBeInTheDocument()
    expect(updateAttendanceSetting).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Enable" }))

    expect(updateAttendanceSetting).toHaveBeenCalledWith({ enableSpoofDetection: true })
  })

  it("navigates between modal sections with footer buttons", async () => {
    const updateAttendanceSetting = vi.fn()

    render(<ContentPanel {...baseProps} updateAttendanceSetting={updateAttendanceSetting} />)

    fireEvent.click(screen.getByLabelText("Liveness verification (anti-spoof)"))

    expect(screen.getByText("Use balanced lighting")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(await screen.findByText("Frame the face properly")).toBeInTheDocument()
    expect(
      await screen.findByAltText(
        "Admin setup slide showing proper face framing and camera distance.",
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(await screen.findByText("Keep the camera clear")).toBeInTheDocument()
    expect(
      await screen.findByAltText(
        "Admin setup slide showing a clear camera lens and sharp face preview for anti-spoof setup.",
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(await screen.findByText("Allow natural movement")).toBeInTheDocument()
    expect(
      await screen.findByAltText(
        "Admin setup slide showing natural face movement and depth for anti-spoof setup.",
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    expect(await screen.findByText("Keep the camera clear")).toBeInTheDocument()
  })

  it("persists the do-not-show-again choice after confirmation", () => {
    const updateAttendanceSetting = vi.fn()

    render(<ContentPanel {...baseProps} updateAttendanceSetting={updateAttendanceSetting} />)

    fireEvent.click(screen.getByLabelText("Liveness verification (anti-spoof)"))
    fireEvent.click(screen.getByLabelText("Don't show this again"))

    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    fireEvent.click(screen.getByRole("button", { name: "Enable" }))

    expect(useUIStore.getState().antiSpoofDetectionInfoDismissed).toBe(true)
    expect(updateAttendanceSetting).toHaveBeenCalledWith({ enableSpoofDetection: true })
  })

  it("enables directly once the info modal has been dismissed", () => {
    const updateAttendanceSetting = vi.fn()
    useUIStore.setState({ antiSpoofDetectionInfoDismissed: true })

    render(<ContentPanel {...baseProps} updateAttendanceSetting={updateAttendanceSetting} />)

    fireEvent.click(screen.getByLabelText("Liveness verification (anti-spoof)"))

    expect(screen.queryByText("Before enabling liveness")).not.toBeInTheDocument()
    expect(updateAttendanceSetting).toHaveBeenCalledWith({ enableSpoofDetection: true })
  })
})

describe("ContentPanel inline group name editing", () => {
  const groupProps = {
    activeSection: "group",
    groupInitialSection: "overview" as const,
    setGroupInitialSection: vi.fn(),
    validInitialGroup: {
      id: "group-1",
      name: "Engineering Team",
      created_at: new Date("2026-01-01T00:00:00Z"),
      is_active: true,
      settings: {},
    },
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
    updateAudioSetting: vi.fn(),
    setActiveSection: vi.fn(),
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
    groupSections: [{ id: "overview" as const, label: "Overview", icon: () => null }],
  }

  it("renders the group name and a pencil edit icon in header", () => {
    render(<ContentPanel {...groupProps} />)
    expect(screen.getByText("Engineering Team")).toBeInTheDocument()
    expect(screen.getByLabelText("Edit group name")).toBeInTheDocument()
  })

  it("switches to inline input when pencil is clicked and cancels on Escape", async () => {
    render(<ContentPanel {...groupProps} />)
    fireEvent.click(screen.getByLabelText("Edit group name"))

    const input = await screen.findByDisplayValue("Engineering Team")
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: "New Team" } })

    const updatedInput = screen.getByDisplayValue("New Team")
    fireEvent.keyDown(updatedInput, { key: "Escape", code: "Escape", keyCode: 27 })

    await waitFor(() => {
      expect(screen.getByText("Engineering Team")).toBeInTheDocument()
      expect(screen.queryByDisplayValue("New Team")).not.toBeInTheDocument()
    })
  })

  it("cancels inline editing when clicking the cancel button", async () => {
    render(<ContentPanel {...groupProps} />)
    fireEvent.click(screen.getByLabelText("Edit group name"))

    const input = await screen.findByDisplayValue("Engineering Team")
    fireEvent.change(input, { target: { value: "New Team" } })
    fireEvent.click(screen.getByLabelText("Cancel"))

    await waitFor(() => {
      expect(screen.getByText("Engineering Team")).toBeInTheDocument()
      expect(screen.queryByDisplayValue("New Team")).not.toBeInTheDocument()
    })
  })

  it("automatically cancels inline edit mode when switching sections", () => {
    const { rerender } = render(<ContentPanel {...groupProps} groupInitialSection="overview" />)
    fireEvent.click(screen.getByLabelText("Edit group name"))

    expect(screen.getByDisplayValue("Engineering Team")).toBeInTheDocument()

    // Switch section to reports
    rerender(<ContentPanel {...groupProps} groupInitialSection="reports" />)

    expect(screen.queryByDisplayValue("Engineering Team")).not.toBeInTheDocument()
    expect(screen.getByText("Engineering Team")).toBeInTheDocument()
  })
})
