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
  it("searches and changes the standalone attendance timezone", async () => {
    const onAttendanceTimezoneChange = vi.fn()
    render(
      <ClockHealth
        timeHealthState={{ timeHealth: healthyClock, loading: false }}
        onRefreshTimeHealth={vi.fn()}
        attendanceTimeZone="Asia/Manila"
        onAttendanceTimezoneChange={onAttendanceTimezoneChange}
      />,
    )

    expect(screen.getByText("Time & location")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Attendance timezone" }))
    const search = await screen.findByRole("textbox", { name: "Search attendance timezones" })
    fireEvent.change(search, { target: { value: "UTC" } })
    fireEvent.click(await screen.findByRole("option", { name: /UTC/ }))

    expect(onAttendanceTimezoneChange).toHaveBeenCalledWith("UTC")
  })

  it("keeps the Cloud-managed attendance timezone read-only", () => {
    render(
      <ClockHealth
        timeHealthState={{ timeHealth: healthyClock, loading: false }}
        onRefreshTimeHealth={vi.fn()}
        attendanceTimeZone="Asia/Manila"
        onAttendanceTimezoneChange={vi.fn()}
        isPaired
      />,
    )

    expect(screen.getByRole("button", { name: "Attendance timezone" })).toBeDisabled()
    expect(screen.getByText("Managed by your Cloud location.")).toBeInTheDocument()
  })

  it("labels and formats the device clock using the backend zone, independently of attendance", () => {
    render(
      <ClockHealth
        timeHealthState={{
          timeHealth: {
            ...healthyClock,
            time_zone_name: "Asia/Singapore",
            device_time_zone_name: "Asia/Singapore",
            attendance_time_zone_name: "Asia/Manila",
          },
          loading: false,
        }}
        onRefreshTimeHealth={vi.fn()}
        attendanceTimeZone="Asia/Manila"
      />,
    )
    expect(screen.getByText(/\/ Asia\/Singapore \(UTC\+08:00\)/)).toBeInTheDocument()
    expect(screen.queryByText(/\/ Asia\/Manila \(UTC\+08:00\)/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Attendance timezone" })).toHaveTextContent("Manila")
  })

  it("uses the backend zone for both the time and offset, not just its label", () => {
    render(
      <ClockHealth
        timeHealthState={{
          timeHealth: {
            ...healthyClock,
            time_zone_name: "America/New_York",
            device_time_zone_name: "America/New_York",
          },
          loading: false,
        }}
        onRefreshTimeHealth={vi.fn()}
        attendanceTimeZone="Asia/Manila"
      />,
    )
    const time = new Date(healthyClock.current_time_utc).toLocaleString([], {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    })
    expect(screen.getByText(`${time} / America/New_York (UTC-04:00)`)).toBeInTheDocument()
  })

  it("shows timezone advice separately from a successful network clock check", () => {
    const message = "Device America/Phoenix and attendance America/Denver have different DST rules."
    const { rerender } = render(
      <ClockHealth
        timeHealthState={{
          timeHealth: {
            ...healthyClock,
            timezone_mismatch: true,
            attendance_time_zone_name: "America/Denver",
            timezone_warning_message: message,
          },
          loading: false,
        }}
        onRefreshTimeHealth={vi.fn()}
        attendanceTimeZone="America/Denver"
      />,
    )
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText("Network-time check passed")).toBeInTheDocument()
    expect(screen.queryByLabelText("Clock warning")).not.toBeInTheDocument()
    // An old response must not warn about a timezone the user has since changed.
    rerender(
      <ClockHealth
        timeHealthState={{
          timeHealth: {
            ...healthyClock,
            timezone_mismatch: true,
            attendance_time_zone_name: "America/Denver",
            timezone_warning_message: message,
          },
          loading: false,
        }}
        onRefreshTimeHealth={vi.fn()}
        attendanceTimeZone="Asia/Manila"
      />,
    )
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

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

  it("shows a failed refresh instead of the previous successful state", () => {
    render(
      <ClockHealth
        timeHealthState={{
          timeHealth: healthyClock,
          loading: false,
          error: "Clock check failed. Check your connection and try again.",
        }}
        onRefreshTimeHealth={vi.fn()}
      />,
    )
    expect(screen.getByLabelText("Clock check failed")).toBeInTheDocument()
    expect(screen.queryByLabelText("Network-time check passed")).not.toBeInTheDocument()
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
