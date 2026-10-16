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
    expect(screen.getByText("Retention Policy")).toBeInTheDocument()
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

  it("preserves 0 (forever) locally even when paired under a capped cloud plan", () => {
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

    // Local dataRetentionDays remains 0 (forever) regardless of cloud plan
    const input = screen.getByDisplayValue("0") as HTMLInputElement
    expect(input).not.toBeDisabled()
    expect(screen.getByText("forever")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Keep all local attendance logs forever. Member profiles and face data are never deleted.",
      ),
    ).toBeInTheDocument()

    // Clearing input and blurring resets to 0 (forever)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.blur(input)
    expect(onDataRetentionChange).toHaveBeenCalledWith(0)
  })

  it("allows setting 0 (forever) when paired with unlimited cloud plan", () => {
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
    expect(screen.getByText("forever")).toBeInTheDocument()

    const input = screen.getByDisplayValue("0") as HTMLInputElement
    expect(input).not.toBeDisabled()

    fireEvent.change(input, { target: { value: "90" } })
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

    expect(screen.getByText("Retention Policy")).toBeInTheDocument()
    expect(screen.queryByText(/Cloud plan/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cloud Data Retention/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Standalone")).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "Keep all local attendance logs forever. Member profiles and face data are never deleted.",
      ),
    ).toBeInTheDocument()
    const input = screen.getByDisplayValue("0") as HTMLInputElement
    expect(input).not.toBeDisabled()
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
    expect(screen.getByText("Auto-start Scanning")).toBeInTheDocument()
    expect(screen.getByText("Recognition Limit")).toBeInTheDocument()
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

    expect(screen.getByText("Liveness Verification")).toBeInTheDocument()
    expect(
      screen.getByText("Anti-spoofing is disabled. Run passive face recognition only."),
    ).toBeInTheDocument()

    const livenessSwitch = screen.getByRole("switch", {
      name: "Liveness Verification (Anti-Spoof)",
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

    expect(screen.getByText("Recognition Limit")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Limit the maximum number of faces recognized per frame to optimize performance.",
      ),
    ).toBeInTheDocument()

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

    expect(screen.getByText("Administrator PIN Lock")).toBeInTheDocument()
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

    expect(screen.getByText("Auto-start Scanning")).toBeInTheDocument()
    const switchBtn = screen.getByRole("switch", { name: "Auto-start Scanning on Launch" })
    expect(switchBtn).toBeInTheDocument()
    fireEvent.click(switchBtn)
  })
})
