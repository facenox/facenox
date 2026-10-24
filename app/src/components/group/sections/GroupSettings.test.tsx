import type { ReactNode } from "react"
import { screen, fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GroupSettings } from "./GroupSettings"
import { attendanceManager } from "@/services"
import { createAttendanceGroup } from "@/test/fixtures"

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
    ),
  },
}))

vi.mock("@/services", () => ({
  attendanceManager: {
    updateGroup: vi.fn().mockResolvedValue({}),
    deleteGroup: vi.fn().mockResolvedValue(true),
    getGroups: vi.fn().mockResolvedValue([]),
    getGroupMembers: vi.fn().mockResolvedValue([]),
  },
}))

describe("GroupSettings Component (Two-Tiered Group Scope)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders group name, late tracking, and checkout controls", () => {
    const group = createAttendanceGroup({
      id: "group-1",
      name: "Engineering Team",
      settings: {
        late_threshold_enabled: true,
        class_start_time: "09:00",
        class_end_time: "18:00",
        late_threshold_minutes: 10,
        track_checkout: true,
      },
    })

    render(<GroupSettings group={group} />)

    expect(screen.getByText(/Schedule & Attendance Rules/i)).toBeInTheDocument()
    expect(screen.getByText("Late tracking")).toBeInTheDocument()
    expect(screen.getAllByText("Time in & time out").length).toBeGreaterThan(0)
    expect(screen.getByText("Exact")).toBeInTheDocument()
    expect(screen.getByText("10m")).toBeInTheDocument()
  })

  it("saves updated late threshold when Exact is clicked", async () => {
    const group = createAttendanceGroup({
      id: "group-1",
      name: "Section A",
      settings: {
        late_threshold_enabled: true,
        class_start_time: "08:00",
        class_end_time: null,
        late_threshold_minutes: 15,
        track_checkout: false,
      },
    })

    render(<GroupSettings group={group} />)

    const exactButton = screen.getByText("Exact")
    fireEvent.click(exactButton)

    expect(attendanceManager.updateGroup).toHaveBeenCalledWith("group-1", {
      settings: expect.objectContaining({
        late_threshold_minutes: 0,
      }),
    })
  })

  it("renders departure rules for the time in and time out mode", () => {
    const group = createAttendanceGroup({
      id: "group-2",
      name: "Section B",
      settings: {
        late_threshold_enabled: false,
        class_start_time: "08:00",
        class_end_time: "17:00",
        late_threshold_minutes: 15,
        attendance_mode: "work_hours",
        min_checkout_delay_minutes: 15,
        track_checkout: true,
      },
    })

    render(<GroupSettings group={group} />)

    expect(screen.getAllByText("Time in & time out").length).toBeGreaterThan(1)
    expect(screen.getByText("Scheduled end time:")).toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Time in and time out" })).not.toBeInTheDocument()
  })

  it("shows only mode-relevant rules", () => {
    const attendanceGroup = createAttendanceGroup({
      id: "group-attendance",
      name: "Section A",
      settings: {
        attendance_mode: "attendance",
        late_threshold_enabled: false,
        track_checkout: false,
      },
    })

    const { unmount } = render(<GroupSettings group={attendanceGroup} />)

    expect(screen.getByText("Late tracking")).toBeInTheDocument()
    expect(screen.queryByText("Time in & time out")).not.toBeInTheDocument()

    unmount()

    const visitsGroup = createAttendanceGroup({
      id: "group-visits",
      name: "Gym members",
      settings: {
        attendance_mode: "visits",
        late_threshold_enabled: true,
        track_checkout: true,
        min_checkout_delay_minutes: 15,
      },
    })

    render(<GroupSettings group={visitsGroup} />)

    expect(screen.getByText("Late tracking")).toBeInTheDocument()
    expect(screen.queryByText("Time in & time out")).not.toBeInTheDocument()
    expect(screen.getByText("Visit rules")).toBeInTheDocument()
    expect(screen.getByText("Minimum visit duration:")).toBeInTheDocument()
  })

  it("renders clean Entry & Exit settings with Scheduled end time", async () => {
    const group = createAttendanceGroup({
      id: "group-3",
      name: "Section C",
      settings: {
        late_threshold_enabled: false,
        class_start_time: "08:00",
        class_end_time: "17:00",
        late_threshold_minutes: 15,
        track_checkout: true,
      },
    })

    render(<GroupSettings group={group} />)

    expect(screen.getByText("Scheduled end time:")).toBeInTheDocument()
    expect(screen.queryByText(/Lock Time Out/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/buffer/i)).not.toBeInTheDocument()
  })

  it("renders Danger Zone and allows group deletion with confirmation", async () => {
    const onGroupsChanged = vi.fn()
    const group = createAttendanceGroup({
      id: "group-delete-test",
      name: "Graduating Batch",
      settings: {},
    })

    render(<GroupSettings group={group} onGroupsChanged={onGroupsChanged} />)

    const dangerZoneBtn = screen.getByRole("button", { name: /danger zone/i })
    expect(dangerZoneBtn).toBeInTheDocument()
    fireEvent.click(dangerZoneBtn)

    expect(screen.getByText("Delete this group")).toBeInTheDocument()
    const openDeleteBtn = screen.getByRole("button", { name: /delete group/i })
    expect(openDeleteBtn).toBeInTheDocument()

    // Open confirmation modal
    fireEvent.click(openDeleteBtn)

    expect(screen.getByText(/Existing attendance history is retained/i)).toBeInTheDocument()
    const deleteButtons = screen.getAllByRole("button", { name: "Delete group" })
    const deleteModalBtn = deleteButtons[1]
    expect(deleteModalBtn).toBeDisabled()

    // Type incorrect name
    const input = screen.getByRole("textbox", { name: /confirm deletion/i })
    fireEvent.change(input, { target: { value: "Wrong Name" } })
    expect(deleteModalBtn).toBeDisabled()

    // Type exact matching name
    fireEvent.change(input, { target: { value: "Graduating Batch" } })
    expect(deleteModalBtn).toBeEnabled()

    // Click confirm delete
    fireEvent.click(deleteModalBtn)

    expect(attendanceManager.deleteGroup).toHaveBeenCalledWith("group-delete-test")
  })
})
