import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Attendance } from "./Attendance"
import type { AttendanceSettings } from "../types"

describe("Attendance Retention Policy (Unified Constrained Control)", () => {
  const baseSettings: AttendanceSettings = {
    lateThresholdEnabled: false,
    lateThresholdMinutes: 15,
    classStartTime: "08:00",
    attendanceCooldownSeconds: 60,
    enableSpoofDetection: false,
    maxRecognitionFacesPerFrame: 6,
    trackCheckout: false,
    dataRetentionDays: 0,
  }

  it("renders inline cloud plan window badge and allows independent local retention edits when paired", () => {
    const onDataRetentionChange = vi.fn()
    render(
      <Attendance
        attendanceSettings={{
          ...baseSettings,
          dataRetentionDays: 14,
          cloudRetentionDays: 30,
        }}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={onDataRetentionChange}
        isPaired={true}
      />,
    )

    // Single cohesive Retention Policy setting exists
    expect(screen.getByText("Retention policy")).toBeInTheDocument()
    // No redundant ghost row
    expect(screen.queryByText("Cloud Data Retention")).not.toBeInTheDocument()

    // Cloud plan ceiling badge is displayed inline
    expect(screen.getByText(/Cloud plan: 30d window/i)).toBeInTheDocument()

    // Local input is NOT disabled
    const input = screen.getByDisplayValue("14") as HTMLInputElement
    expect(input).not.toBeDisabled()

    // Changing to a valid value
    fireEvent.change(input, { target: { value: "7" } })
    expect(onDataRetentionChange).toHaveBeenCalledWith(7)

    // Changing beyond cloud window does NOT clamp local retention
    fireEvent.change(input, { target: { value: "60" } })
    expect(onDataRetentionChange).toHaveBeenCalledWith(60)
  })

  it.each([1, 45, 400])("shows the exact retention period of %i days", (days) => {
    render(
      <Attendance
        attendanceSettings={{ ...baseSettings, dataRetentionDays: days }}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        `Delete local attendance records older than ${days} ${days === 1 ? "day" : "days"} automatically. Member profiles and enrolled face data are unchanged.`,
      ),
    ).toBeInTheDocument()
  })

  it("preserves disabled automatic cleanup under a capped cloud plan", () => {
    const onDataRetentionChange = vi.fn()
    render(
      <Attendance
        attendanceSettings={{
          ...baseSettings,
          dataRetentionDays: 0,
          cloudRetentionDays: 30,
        }}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={onDataRetentionChange}
        isPaired={true}
      />,
    )

    // Local automatic cleanup remains disabled regardless of cloud plan
    const switchEl = screen.getByRole("switch", { name: "Retention policy" })
    expect(switchEl).toHaveAttribute("aria-checked", "false")
    expect(
      screen.getByText(
        "Automatic cleanup is off. Local attendance records are kept until you delete them.",
      ),
    ).toBeInTheDocument()

    // Turning on the switch activates cleanup with capped plan ceiling (30 days)
    fireEvent.click(switchEl)
    expect(onDataRetentionChange).toHaveBeenCalledWith(30)
  })

  it("allows enabling and disabling automatic cleanup with an unlimited cloud plan", () => {
    const onDataRetentionChange = vi.fn()
    render(
      <Attendance
        attendanceSettings={{
          ...baseSettings,
          dataRetentionDays: 0,
          cloudRetentionDays: -1,
        }}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={onDataRetentionChange}
        isPaired={true}
      />,
    )

    expect(screen.getByText(/Cloud plan: Unlimited/i)).toBeInTheDocument()
    const switchEl = screen.getByRole("switch", { name: "Retention policy" })
    expect(switchEl).toHaveAttribute("aria-checked", "false")

    // Enabling sets default to 90 days
    fireEvent.click(switchEl)
    expect(onDataRetentionChange).toHaveBeenCalledWith(90)
  })

  it("renders clean standalone controls without cloud badges when unpaired", () => {
    const onDataRetentionChange = vi.fn()
    render(
      <Attendance
        attendanceSettings={{
          ...baseSettings,
          dataRetentionDays: 0,
        }}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={onDataRetentionChange}
        isPaired={false}
      />,
    )

    expect(screen.getByText("Retention policy")).toBeInTheDocument()
    expect(screen.queryByText(/Cloud plan/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cloud Data Retention/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Standalone")).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "Automatic cleanup is off. Local attendance records are kept until you delete them.",
      ),
    ).toBeInTheDocument()
    const switchEl = screen.getByRole("switch", { name: "Retention policy" })
    expect(switchEl).toHaveAttribute("aria-checked", "false")
  })

  it("allows toggling off retention policy and using presets when active", () => {
    const onDataRetentionChange = vi.fn()
    render(
      <Attendance
        attendanceSettings={{
          ...baseSettings,
          dataRetentionDays: 90,
        }}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={onDataRetentionChange}
        isPaired={false}
      />,
    )

    // Preset button 30d
    const btn30 = screen.getByRole("button", { name: "30d" })
    fireEvent.click(btn30)
    expect(onDataRetentionChange).toHaveBeenCalledWith(30)

    // Custom input
    const input = screen.getByLabelText("Custom retention days") as HTMLInputElement
    fireEvent.change(input, { target: { value: "45" } })
    expect(onDataRetentionChange).toHaveBeenCalledWith(45)

    // Toggling switch off
    const switchEl = screen.getByRole("switch", { name: "Retention policy" })
    expect(switchEl).toHaveAttribute("aria-checked", "true")
    fireEvent.click(switchEl)
    expect(onDataRetentionChange).toHaveBeenCalledWith(0)
  })
})

describe("Global General Preferences Controls", () => {
  const baseSettings: AttendanceSettings = {
    lateThresholdEnabled: false,
    lateThresholdMinutes: 15,
    classStartTime: "08:00",
    attendanceCooldownSeconds: 60,
    enableSpoofDetection: false,
    maxRecognitionFacesPerFrame: 5,
    trackCheckout: false,
    dataRetentionDays: 0,
  }

  it("renders Global Settings cleanly without redundant Scan Cooldown slider", () => {
    render(
      <Attendance
        attendanceSettings={baseSettings}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={vi.fn()}
      />,
    )

    expect(screen.queryByText("Scan Cooldown")).not.toBeInTheDocument()
    expect(screen.getByText("Auto-start scanning")).toBeInTheDocument()
    expect(screen.getByText("Recognition limit")).toBeInTheDocument()
  })

  it("renders Liveness Verification toggle and toggles spoof detection", () => {
    const onSpoofToggle = vi.fn()
    render(
      <Attendance
        attendanceSettings={baseSettings}
        onSpoofDetectionToggle={onSpoofToggle}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Liveness verification")).toBeInTheDocument()
    expect(screen.getByText("Standard face recognition only.")).toBeInTheDocument()

    const livenessSwitch = screen.getByRole("switch", {
      name: "Liveness verification (anti-spoof)",
    })
    fireEvent.click(livenessSwitch)
    expect(onSpoofToggle).toHaveBeenCalledWith(true)
  })

  it("renders Recognition Limit and handles face count changes", () => {
    const onMaxFacesChange = vi.fn()
    render(
      <Attendance
        attendanceSettings={baseSettings}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={onMaxFacesChange}
        onDataRetentionChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Recognition limit")).toBeInTheDocument()
    expect(screen.getByText("Limit the number of faces recognized per frame.")).toBeInTheDocument()

    const faceBtn10 = screen.getByRole("button", { name: "10" })
    fireEvent.click(faceBtn10)
    expect(onMaxFacesChange).toHaveBeenCalledWith(10)
  })

  it("renders Administrator PIN Lock toggle and controls", () => {
    render(
      <Attendance
        attendanceSettings={baseSettings}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Administrator PIN lock")).toBeInTheDocument()
    expect(
      screen.getByText("PIN lock is disabled. Anyone can access settings."),
    ).toBeInTheDocument()
  })

  it("renders Auto-start Scanning toggle and toggles setting", () => {
    render(
      <Attendance
        attendanceSettings={baseSettings}
        onSpoofDetectionToggle={vi.fn()}
        onMaxRecognitionFacesChange={vi.fn()}
        onDataRetentionChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Auto-start scanning")).toBeInTheDocument()
    const switchBtn = screen.getByRole("switch", { name: "Auto-start scanning on launch" })
    expect(switchBtn).toBeInTheDocument()
    fireEvent.click(switchBtn)
  })
})
