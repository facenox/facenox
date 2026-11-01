import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { MainModals } from "./MainModals"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { createAttendanceGroup } from "@/test/fixtures"
import type { AttendanceGroup } from "@/types/recognition"

vi.mock("@/services", () => ({ attendanceManager: {} }))
vi.mock("@/components/common", () => ({ PinPromptModal: () => null }))
vi.mock("./DeleteConfirmationModal", () => ({ DeleteConfirmationModal: () => null }))
vi.mock("@/components/group/modals/CreateGroup", () => ({
  CreateGroup: ({
    isOpen,
    onSuccess,
  }: {
    isOpen: boolean
    onSuccess: (group: AttendanceGroup) => void
  }) =>
    isOpen ?
      <button onClick={() => onSuccess(createAttendanceGroup({ id: "B" }))}>
        Create test group
      </button>
    : null,
}))
vi.mock("@/components/settings", () => ({
  Settings: ({ onGroupSelect }: { onGroupSelect: (group: AttendanceGroup) => void }) => (
    <>
      <button onClick={() => onGroupSelect(createAttendanceGroup({ id: "B" }))}>
        Select test group
      </button>
      <button onClick={() => onGroupSelect(createAttendanceGroup({ id: "all" }))}>
        Select all groups
      </button>
    </>
  ),
}))
vi.mock("@/services/PersistentSettingsService", () => ({
  persistentSettings: {
    getQuickSettings: vi.fn(async () => ({})),
    getAudioSettings: vi.fn(async () => ({})),
    getUIState: vi.fn(async () => ({})),
    getSecuritySettings: vi.fn(async () => ({})),
    setUIState: vi.fn(async () => {}),
  },
}))

beforeEach(() => {
  const group = createAttendanceGroup({ id: "A" })
  useAttendanceStore.setState({
    currentGroup: group,
    attendanceGroups: [group],
    showDeleteConfirmation: false,
  })
})

it.each(["create", "select", "all"])(
  "loads authoritative panel data after a modal's %s group action",
  (mode) => {
    useAttendanceStore.setState({ showGroupManagement: mode === "create" })
    useUIStore.setState({ showSettings: mode !== "create" })
    const reload = vi.fn(async () => {})
    render(
      <MainModals
        confirmDeleteGroup={() => {}}
        cancelDeleteGroup={() => {}}
        loadAttendanceDataRef={{ current: reload }}
      />,
    )
    fireEvent.click(
      screen.getByRole("button", {
        name:
          mode === "create" ? "Create test group"
          : mode === "all" ? "Select all groups"
          : "Select test group",
      }),
    )
    expect(useAttendanceStore.getState().currentGroup?.id).toBe(mode === "all" ? "all" : "B")
    expect(useAttendanceStore.getState().attendanceGroups.some((group) => group.id === "all")).toBe(
      false,
    )
    expect(reload).toHaveBeenCalledTimes(1)
  },
)
