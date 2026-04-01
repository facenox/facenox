import type { ReactNode } from "react"
import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Registration } from "@/components/group/sections/Registration"
import { useGroupUIStore } from "@/components/group/stores"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures"
import { renderWithProviders } from "@/test/utils/renderWithProviders"

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

vi.mock("@/components/group/sections/registration/CameraQueue", () => ({
  CameraQueue: () => <div>Mock Camera Queue</div>,
}))

vi.mock("@/components/group/sections/registration/BulkRegistration", () => ({
  BulkRegistration: () => <div>Mock Bulk Registration</div>,
}))

vi.mock("@/components/group/sections", async () => {
  const actual = await vi.importActual<typeof import("@/components/group/sections")>(
    "@/components/group/sections",
  )
  return {
    ...actual,
    FaceCapture: ({ initialSource }: { initialSource: string }) => (
      <div>Mock Face Capture ({initialSource})</div>
    ),
  }
})

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

describe("Registration", () => {
  beforeEach(() => {
    resetGroupUIStore()
  })

  it("shows the empty state when the group has no members", () => {
    renderWithProviders(
      <Registration
        group={createAttendanceGroup()}
        members={[]}
        onRefresh={vi.fn()}
        onAddMember={vi.fn()}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByText("No members in this group yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Member" })).toBeInTheDocument()
  })

  it("lets the user choose a registration source", async () => {
    const { user } = renderWithProviders(
      <Registration
        group={createAttendanceGroup()}
        members={[createAttendanceMember({ person_id: "member-1", name: "Alice" })]}
        onRefresh={vi.fn()}
      />,
      { withDialogProvider: false },
    )

    await user.click(screen.getByRole("button", { name: /Camera/i }))
    expect(useGroupUIStore.getState().lastRegistrationSource).toBe("camera")
    expect(useGroupUIStore.getState().lastRegistrationMode).toBeNull()
  })

  it("renders the bulk upload path for upload + bulk mode", () => {
    useGroupUIStore.setState({
      lastRegistrationSource: "upload",
      lastRegistrationMode: "bulk",
    })

    renderWithProviders(
      <Registration
        group={createAttendanceGroup()}
        members={[createAttendanceMember({ person_id: "member-1", name: "Alice" })]}
        onRefresh={vi.fn()}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByText("Mock Bulk Registration")).toBeInTheDocument()
  })

  it("renders the camera queue path for camera + queue mode", () => {
    useGroupUIStore.setState({
      lastRegistrationSource: "camera",
      lastRegistrationMode: "queue",
    })

    renderWithProviders(
      <Registration
        group={createAttendanceGroup()}
        members={[createAttendanceMember({ person_id: "member-1", name: "Alice" })]}
        onRefresh={vi.fn()}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByText("Mock Camera Queue")).toBeInTheDocument()
  })

  it("renders the face capture path for single mode and maps camera to live", () => {
    useGroupUIStore.setState({
      lastRegistrationSource: "camera",
      lastRegistrationMode: "single",
    })

    renderWithProviders(
      <Registration
        group={createAttendanceGroup()}
        members={[createAttendanceMember({ person_id: "member-1", name: "Alice" })]}
        onRefresh={vi.fn()}
      />,
      { withDialogProvider: false },
    )

    expect(screen.getByText("Mock Face Capture (live)")).toBeInTheDocument()
  })
})
