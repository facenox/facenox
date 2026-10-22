import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Groups } from "./Groups"
import type { AttendanceGroup } from "@/types/recognition"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  remove: vi.fn(),
}))
vi.mock("@/components/shared", () => ({
  useDialog: () => ({}),
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock("./hooks/useDatabaseManagement", () => ({
  useDatabaseManagement: () => ({ handleDeleteGroup: mocks.remove, deletingGroup: null }),
}))
vi.mock("@/components/group/modals/EditGroup", () => ({
  EditGroup: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    <div data-testid="edit-modal" data-open={isOpen}>
      <button onClick={onClose}>Close edit</button>
    </div>
  ),
}))

describe("Groups directory", () => {
  const groups = [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" },
  ] as AttendanceGroup[]
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockResolvedValue({ connected: false })
    window.electronAPI.sync.getConfig = mocks.getConfig
  })
  it("keeps the modal mounted while closing so its exit animation can run", async () => {
    render(<Groups groups={groups} />)
    const edit = screen.getByRole("button", { name: "Edit Alpha" })
    await waitFor(() => expect(edit).toBeEnabled())
    expect(screen.queryByText("alpha")).not.toBeInTheDocument()
    fireEvent.click(edit)
    expect(screen.getByTestId("edit-modal")).toHaveAttribute("data-open", "true")
    fireEvent.click(screen.getByRole("button", { name: "Close edit" }))
    expect(screen.getByTestId("edit-modal")).toHaveAttribute("data-open", "false")
    fireEvent.click(edit)
    expect(screen.getByTestId("edit-modal")).toHaveAttribute("data-open", "true")
  })
  it("opens the selected group's existing workspace and filters the directory", async () => {
    const open = vi.fn()
    const management = vi.fn()
    render(<Groups groups={groups} onOpenGroup={open} onManagementChange={management} />)
    await waitFor(() => expect(management).toHaveBeenLastCalledWith(true))
    expect(screen.queryByRole("button", { name: "Create group" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Alpha members" }))
    expect(open).toHaveBeenCalledWith(groups[0])
    fireEvent.change(screen.getByRole("searchbox", { name: "Search groups" }), {
      target: { value: "beta" },
    })
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    expect(screen.getByText("Beta")).toBeInTheDocument()
  })
  it("keeps browsing available while organization policy blocks mutations", async () => {
    mocks.getConfig.mockResolvedValue({ connected: true, allowKioskDirectoryManagement: false })
    const management = vi.fn()
    render(<Groups groups={groups} onOpenGroup={vi.fn()} onManagementChange={management} />)
    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalled())
    expect(management).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole("button", { name: "Edit Alpha" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Delete Alpha" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Open Alpha members" })).toBeEnabled()
  })
  it("uses the existing deletion confirmation handler", async () => {
    render(<Groups groups={groups} />)
    const remove = screen.getByRole("button", { name: "Delete Alpha" })
    await waitFor(() => expect(remove).toBeEnabled())
    fireEvent.click(remove)
    expect(mocks.remove).toHaveBeenCalledWith("alpha")
  })
  it("expands search on focus and retains its width while filtering", async () => {
    render(<Groups groups={groups} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Alpha" })).toBeEnabled())
    const search = screen.getByRole("searchbox", { name: "Search groups" })
    expect(search.parentElement).toHaveClass("max-w-[260px]")
    fireEvent.focus(search)
    expect(search.parentElement).toHaveClass("max-w-[320px]")
    fireEvent.change(search, { target: { value: "alpha" } })
    fireEvent.blur(search)
    expect(search.parentElement).toHaveClass("max-w-[320px]")
    fireEvent.change(search, { target: { value: "" } })
    expect(search.parentElement).toHaveClass("max-w-[260px]")
  })
})
