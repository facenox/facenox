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
  it("keeps mutations disabled without claiming a policy denial while configuration loads", () => {
    mocks.getConfig.mockReturnValue(new Promise(() => undefined))
    render(<Groups groups={groups} />)
    expect(screen.getByRole("button", { name: "Edit Alpha" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Delete Alpha" })).toBeDisabled()
    expect(screen.queryByText(/Group editing is unavailable/)).not.toBeInTheDocument()
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
  it("transitions between results and no matches without replacing the search field", async () => {
    render(<Groups groups={groups} onOpenGroup={vi.fn()} />)
    const search = screen.getByRole("searchbox", { name: "Search groups" })
    fireEvent.change(search, { target: { value: "no matching group" } })
    expect(await screen.findByRole("heading", { name: "No results found" })).toBeInTheDocument()
    expect(screen.getByText('No groups matched "no matching group".')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText("Alpha")).not.toBeInTheDocument())
    fireEvent.change(search, { target: { value: "" } })
    expect(await screen.findByRole("button", { name: "Open Alpha members" })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "No results found" })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole("searchbox", { name: "Search groups" })).toBe(search)
  })

  it("uses the shared centered empty state inside the remaining results area", async () => {
    render(<Groups groups={groups} />)
    const search = screen.getByRole("searchbox", { name: "Search groups" })
    fireEvent.change(search, { target: { value: "  unknown  " } })
    const heading = await screen.findByRole("heading", { name: "No results found" })
    expect(screen.getByText('No groups matched "unknown".')).toHaveClass("text-xs", "text-white/55")
    const emptyState = heading.parentElement?.parentElement
    expect(emptyState).toHaveClass("flex-1", "items-center", "justify-center", "min-h-[300px]")
    expect(heading).toHaveClass("text-sm", "font-semibold", "text-white/90")
    expect(emptyState?.querySelector(".lucide-ghost")).toHaveClass("size-8")
    const results = emptyState?.parentElement
    expect(results).toHaveClass("flex-1", "min-h-0", "overflow-y-auto")
    expect(results).not.toContainElement(search)
    expect(screen.queryByRole("heading", { name: "No groups yet" })).not.toBeInTheDocument()
  })

  it("shows first-use guidance with the Groups icon when there are no groups", async () => {
    render(<Groups groups={[]} />)
    const heading = screen.getByRole("heading", { name: "No groups yet" })
    expect(await screen.findByText("Create a group to get started.")).toBeInTheDocument()
    expect(heading.parentElement?.parentElement?.querySelector(".lucide-layers")).toHaveClass(
      "size-8",
    )
    expect(screen.queryByRole("heading", { name: "No results found" })).not.toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "Search groups" })).toBeInTheDocument()
  })

  it("does not suggest an unavailable create action when organization policy blocks management", async () => {
    mocks.getConfig.mockResolvedValue({ connected: true, allowKioskDirectoryManagement: false })
    render(<Groups groups={[]} />)
    expect(await screen.findByText(/Group editing is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "No groups yet" })).toBeInTheDocument()
    expect(screen.getByText("No groups are available to browse.")).toBeInTheDocument()
    expect(screen.queryByText("Create a group to get started.")).not.toBeInTheDocument()
  })

  it("clears an unmatched search with Escape without losing the search field", async () => {
    render(<Groups groups={groups} onOpenGroup={vi.fn()} />)
    const search = screen.getByRole("searchbox", { name: "Search groups" })
    fireEvent.change(search, { target: { value: "unknown" } })
    await screen.findByRole("heading", { name: "No results found" })
    fireEvent.keyDown(search, { key: "Escape" })
    expect(search).toHaveValue("")
    expect(await screen.findByRole("button", { name: "Open Alpha members" })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "Search groups" })).toBe(search)
  })

  it("expands search on focus and retains its width while filtering", async () => {
    render(<Groups groups={groups} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit Alpha" })).toBeEnabled())
    const search = screen.getByRole("searchbox", { name: "Search groups" })
    expect(search.parentElement).toHaveClass("max-w-[170px]")
    fireEvent.focus(search)
    expect(search.parentElement).toHaveClass("max-w-[190px]")
    fireEvent.change(search, { target: { value: "alpha" } })
    fireEvent.blur(search)
    expect(search.parentElement).toHaveClass("max-w-[190px]")
    fireEvent.change(search, { target: { value: "" } })
    expect(search.parentElement).toHaveClass("max-w-[170px]")
  })
})
