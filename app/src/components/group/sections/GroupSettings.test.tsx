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
  },
}))

vi.mock("@/services", () => ({
  attendanceManager: {
    updateGroup: vi.fn().mockResolvedValue({}),
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
    expect(screen.getByText("Engineering Team")).toBeInTheDocument()
    expect(screen.getByText("Late Tracking")).toBeInTheDocument()
    expect(screen.getByText("Track Departure / Check-Out")).toBeInTheDocument()
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

  it("saves updated departure tracking when checkout toggle is changed", async () => {
    const group = createAttendanceGroup({
      id: "group-2",
      name: "Section B",
      settings: {
        late_threshold_enabled: false,
        class_start_time: "08:00",
        class_end_time: null,
        late_threshold_minutes: 15,
        track_checkout: false,
      },
    })

    render(<GroupSettings group={group} />)

    const switchBtn = screen.getByRole("switch", {
      name: /Enable departure and check-out tracking for this group/i,
    })
    fireEvent.click(switchBtn)

    expect(attendanceManager.updateGroup).toHaveBeenCalledWith("group-2", {
      settings: expect.objectContaining({
        track_checkout: true,
      }),
    })
  })
})
