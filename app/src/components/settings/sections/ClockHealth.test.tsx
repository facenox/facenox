import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ClockHealth } from "./ClockHealth"
import type { AttendanceTimeHealth } from "@/types/recognition"

const healthyClock: AttendanceTimeHealth = {
  source: "backend_monotonic_clock",
  current_time_utc: "2026-10-23T02:00:00Z",
  current_time_local: "2026-10-23T10:00:00+08:00",
  time_zone_name: "Asia/Manila",
  os_clock_drift_seconds: 0,
  online_verification_status: "verified",
}

describe("ClockHealth status", () => {
  it.each(["warning_message", "os_clock_warning"] as const)(
    "prioritizes %s over online verification",
    (field) => {
      render(
        <ClockHealth
          timeHealthState={{
            timeHealth: { ...healthyClock, [field]: "Check this computer's clock." },
            loading: false,
          }}
          onRefreshTimeHealth={vi.fn()}
        />,
      )
      expect(screen.getByText("Check this computer's clock.")).toBeInTheDocument()
      expect(screen.getByLabelText("Clock warning")).toBeInTheDocument()
      expect(screen.queryByLabelText("Network-time check passed")).not.toBeInTheDocument()
    },
  )

  it("keeps a known warning visible during refresh", () => {
    render(
      <ClockHealth
        timeHealthState={{
          timeHealth: {
            ...healthyClock,
            warning_message: "Clock is earlier than recorded attendance.",
          },
          loading: true,
        }}
        onRefreshTimeHealth={vi.fn()}
      />,
    )
    expect(screen.getByText("Clock is earlier than recorded attendance.")).toBeInTheDocument()
    expect(screen.getByLabelText("Clock warning")).toBeInTheDocument()
  })

  it("shows a successful check only without clock warnings", () => {
    render(
      <ClockHealth
        timeHealthState={{ timeHealth: healthyClock, loading: false }}
        onRefreshTimeHealth={vi.fn()}
      />,
    )
    expect(screen.getByLabelText("Network-time check passed")).toBeInTheDocument()
    expect(screen.queryByLabelText("Clock warning")).not.toBeInTheDocument()
  })

  it("explains and explicitly triggers the online check", () => {
    const onRefreshTimeHealth = vi.fn()
    render(
      <ClockHealth
        timeHealthState={{
          timeHealth: { ...healthyClock, online_verification_status: "not_checked" },
          loading: false,
        }}
        onRefreshTimeHealth={onRefreshTimeHealth}
      />,
    )

    expect(
      screen.getByText(/Select Check now to compare it with network time/i),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Check now" }))
    expect(onRefreshTimeHealth).toHaveBeenCalledOnce()
  })
})
