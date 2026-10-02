import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { Notifications } from "./Notifications"
import { soundEffects } from "@/services/SoundEffectsService"

vi.mock("@/services/SoundEffectsService", () => ({
  soundEffects: {
    preload: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
  },
}))

describe("Notifications Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.electronAPI = {
      ...window.electronAPI,
      assets: {
        listRecognitionSounds: vi.fn().mockResolvedValue([
          { fileName: "Recognition_Success.wav", url: "./assets/sounds/Recognition_Success.wav" },
          { fileName: "Gentle_Bell.wav", url: "./assets/sounds/Gentle_Bell.wav" },
        ]),
      },
    } as unknown as typeof window.electronAPI
  })

  it("renders Audio Feedback toggle and handles toggling", () => {
    const onAudioSettingsChange = vi.fn()
    render(
      <Notifications
        audioSettings={{
          recognitionSoundEnabled: true,
          recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
        }}
        onAudioSettingsChange={onAudioSettingsChange}
      />,
    )

    expect(screen.getByText("Audio Feedback")).toBeInTheDocument()
    expect(screen.getByText("Play a sound on successful recognition.")).toBeInTheDocument()

    const switchBtn = screen.getByRole("switch")
    fireEvent.click(switchBtn)
    expect(onAudioSettingsChange).toHaveBeenCalledWith({
      recognitionSoundEnabled: false,
    })
  })

  it("shows Tone selector and test button when Audio Feedback is enabled", async () => {
    const onAudioSettingsChange = vi.fn()
    render(
      <Notifications
        audioSettings={{
          recognitionSoundEnabled: true,
          recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
        }}
        onAudioSettingsChange={onAudioSettingsChange}
      />,
    )

    expect(screen.getByText("Tone:")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /test recognition sound/i })).toBeInTheDocument()

    // Clicking test sound triggers soundEffects.play
    const testBtn = screen.getByRole("button", { name: /test recognition sound/i })
    fireEvent.click(testBtn)
    expect(soundEffects.play).toHaveBeenCalledWith("./assets/sounds/Recognition_Success.wav")
  })

  it("hides Tone selector when Audio Feedback is disabled", () => {
    render(
      <Notifications
        audioSettings={{
          recognitionSoundEnabled: false,
          recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
        }}
        onAudioSettingsChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Mute all recognition sounds.")).toBeInTheDocument()
    expect(screen.queryByText("Tone:")).not.toBeInTheDocument()
  })

  it("loads sounds from electronAPI on mount", async () => {
    render(
      <Notifications
        audioSettings={{
          recognitionSoundEnabled: true,
          recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
        }}
        onAudioSettingsChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(window.electronAPI.assets.listRecognitionSounds).toHaveBeenCalled()
    })
  })
})
