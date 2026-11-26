import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Members } from "./Members"
import { refreshCloudSyncConfig } from "@/services/cloudSyncState"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures/attendance"
import { createSyncConfig } from "@/test/mocks/electron"
import { renderWithProviders } from "@/test/utils/renderWithProviders"

describe("Members directory policy gating", () => {
  const group = createAttendanceGroup({ id: "group-1", name: "Engineering" })
  const enrolledMember = createAttendanceMember({
    person_id: "p-1",
    name: "Alice Reyes",
    group_id: "group-1",
    has_face_data: true,
  })
  const unenrolledMember = createAttendanceMember({
    person_id: "p-2",
    name: "Bob Santos",
    group_id: "group-1",
    has_face_data: false,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.electronAPI.sync.getConfig).mockResolvedValue(
      createSyncConfig({ connected: true, allowKioskDirectoryManagement: true }),
    )
  })

  it("hides destructive member actions and bulk remove when kiosk directory management is locked, while preserving enrollment", async () => {
    vi.mocked(window.electronAPI.sync.getConfig).mockResolvedValue({
      ...createSyncConfig({ connected: true }),
      allowKioskDirectoryManagement: false,
      policyReady: true,
    })

    renderWithProviders(
      <Members
        group={group}
        members={[enrolledMember, unenrolledMember]}
        onMembersChange={vi.fn()}
        onEdit={vi.fn()}
        onAdd={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText("Alice Reyes")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Re-enroll member" })).toBeInTheDocument()
    })

    expect(screen.queryByRole("button", { name: "Edit member" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove enrollment" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove member" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Enroll" })).toBeInTheDocument()

    // Select all -> Bulk Enroll stays available, Bulk Remove does not
    fireEvent.click(screen.getByRole("button", { name: "Select all" }))
    expect(screen.getByText("2 selected")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove (2)" })).not.toBeInTheDocument()
    expect(screen.getByText(/Enroll \(2\)/)).toBeInTheDocument()
  })

  it("re-renders MemberRow immediately when directory policy flips from unlocked to locked", async () => {
    vi.mocked(window.electronAPI.sync.getConfig).mockResolvedValue({
      ...createSyncConfig({ connected: true }),
      allowKioskDirectoryManagement: true,
      policyReady: true,
    })

    renderWithProviders(
      <Members
        group={group}
        members={[enrolledMember]}
        onMembersChange={vi.fn()}
        onEdit={vi.fn()}
        onAdd={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit member" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Remove enrollment" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Remove member" })).toBeInTheDocument()
    })

    vi.mocked(window.electronAPI.sync.getConfig).mockResolvedValue({
      ...createSyncConfig({ connected: true }),
      allowKioskDirectoryManagement: false,
      policyReady: true,
    })
    await refreshCloudSyncConfig()

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Edit member" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Remove enrollment" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Remove member" })).not.toBeInTheDocument()
    })

    expect(screen.getByRole("button", { name: "Re-enroll member" })).toBeInTheDocument()
  })

  it("hides the empty-state Add member CTA when directory management is locked", async () => {
    vi.mocked(window.electronAPI.sync.getConfig).mockResolvedValue({
      ...createSyncConfig({ connected: true }),
      allowKioskDirectoryManagement: false,
      policyReady: true,
    })

    renderWithProviders(
      <Members
        group={group}
        members={[]}
        onMembersChange={vi.fn()}
        onEdit={vi.fn()}
        onAdd={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByText("Add and remove members from Facenox Cloud to manage this group."),
      ).toBeInTheDocument()
    })

    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument()
  })
})
