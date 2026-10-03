import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { Display } from "./Display"
import { soundEffects } from "@/services/SoundEffectsService"

vi.mock("@/services/SoundEffectsService", () => ({
  soundEffects: {
    preload: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
  },
}))

describe("Display & Audio Settings Section", () => {
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

  it("renders all 4 camera settings and handles toggling", () => {
    const toggleQuickSetting = vi.fn()
    render(
      <Display
        quickSettings={{
          cameraMirrored: true,
          showRecognitionNames: true,
          showTrackingBoxes: true,
          cameraFitCover: false,
        }}
        toggleQuickSetting={toggleQuickSetting}
      />,
    )

    expect(screen.getByText("Mirror View")).toBeInTheDocument()
    expect(screen.getByText("Show Names")).toBeInTheDocument()
    expect(screen.getByText("Show Tracking Boxes")).toBeInTheDocument()
    expect(screen.getByText("Fill Viewport")).toBeInTheDocument()

    const switches = screen.getAllByRole("switch")
    expect(switches.length).toBe(4)

    fireEvent.click(switches[0])
    expect(toggleQuickSetting).toHaveBeenCalledWith("cameraMirrored")

    fireEvent.click(switches[1])
    expect(toggleQuickSetting).toHaveBeenCalledWith("showRecognitionNames")

    fireEvent.click(switches[2])
    expect(toggleQuickSetting).toHaveBeenCalledWith("showTrackingBoxes")

    fireEvent.click(switches[3])
    expect(toggleQuickSetting).toHaveBeenCalledWith("cameraFitCover")
  })

  it("renders Audio Feedback toggle and handles audio settings", () => {
    const onAudioSettingsChange = vi.fn()
    render(
      <Display
        quickSettings={{
          cameraMirrored: true,
          showRecognitionNames: true,
          showTrackingBoxes: true,
          cameraFitCover: false,
        }}
        toggleQuickSetting={vi.fn()}
        audioSettings={{
          recognitionSoundEnabled: true,
          recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
        }}
        onAudioSettingsChange={onAudioSettingsChange}
      />,
    )

    expect(screen.getByText("Audio Feedback")).toBeInTheDocument()
    expect(screen.getByText("Play a sound on successful recognition.")).toBeInTheDocument()

    expect(screen.getByText("Tone:")).toBeInTheDocument()
    const testBtn = screen.getByRole("button", { name: /test recognition sound/i })
    expect(testBtn).toBeInTheDocument()

    fireEvent.click(testBtn)
    expect(soundEffects.play).toHaveBeenCalledWith("./assets/sounds/Recognition_Success.wav")
  })

  it("loads sounds on mount", async () => {
    render(
      <Display
        quickSettings={{
          cameraMirrored: true,
          showRecognitionNames: true,
          showTrackingBoxes: true,
          cameraFitCover: false,
        }}
        toggleQuickSetting={vi.fn()}
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
