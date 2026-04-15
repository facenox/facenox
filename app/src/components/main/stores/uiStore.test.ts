import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPersistentSettings = {
  getQuickSettings: vi.fn(),
  getAudioSettings: vi.fn(),
  getUIState: vi.fn(),
  setUIState: vi.fn().mockResolvedValue(undefined),
  setQuickSettings: vi.fn().mockResolvedValue(undefined),
  setAudioSettings: vi.fn().mockResolvedValue(undefined),
}

vi.mock("@/services/PersistentSettingsService", () => ({
  persistentSettings: mockPersistentSettings,
}))

async function loadStore() {
  vi.resetModules()
  const module = await import("@/components/main/stores/uiStore")
  return module.useUIStore
}

describe("uiStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPersistentSettings.getQuickSettings.mockResolvedValue({
      cameraMirrored: true,
      showRecognitionNames: true,
      showLandmarks: true,
    })
    mockPersistentSettings.getAudioSettings.mockResolvedValue({
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
    })
    mockPersistentSettings.getUIState.mockResolvedValue({
      hasSeenIntro: false,
      antiSpoofDetectionInfoDismissed: false,
      sidebarCollapsed: false,
      sidebarWidth: 300,
    })
  })

  it("setQuickSettings supports direct objects and updater functions", async () => {
    const useUIStore = await loadStore()
    await waitFor(() => expect(useUIStore.getState().isHydrated).toBe(true))

    useUIStore.getState().setQuickSettings({
      cameraMirrored: false,
      showRecognitionNames: false,
      showLandmarks: false,
    })
    expect(useUIStore.getState().quickSettings).toEqual({
      cameraMirrored: false,
      showRecognitionNames: false,
      showLandmarks: false,
    })

    useUIStore.getState().setQuickSettings((prev) => ({
      ...prev,
      showRecognitionNames: true,
    }))
    expect(useUIStore.getState().quickSettings.showRecognitionNames).toBe(true)
  })

  it("setAudioSettings merges partial values correctly", async () => {
    const useUIStore = await loadStore()
    await waitFor(() => expect(useUIStore.getState().isHydrated).toBe(true))

    useUIStore.getState().setAudioSettings({
      recognitionSoundEnabled: false,
    })

    expect(useUIStore.getState().audioSettings).toEqual({
      recognitionSoundEnabled: false,
      recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
    })
  })

  it("does not persist side effects before hydration", async () => {
    const pending = new Promise<never>(() => undefined)
    mockPersistentSettings.getQuickSettings.mockReturnValue(pending)
    mockPersistentSettings.getAudioSettings.mockReturnValue(pending)
    mockPersistentSettings.getUIState.mockReturnValue(pending)

    const useUIStore = await loadStore()
    useUIStore.getState().setHasSeenIntro(true)
    useUIStore.getState().setAntiSpoofDetectionInfoDismissed(true)
    useUIStore.getState().setSidebarCollapsed(true)
    useUIStore.getState().setQuickSettings({
      cameraMirrored: false,
      showRecognitionNames: false,
      showLandmarks: false,
    })
    useUIStore.getState().setAudioSettings({
      recognitionSoundEnabled: false,
    })

    await Promise.resolve()

    expect(mockPersistentSettings.setUIState).not.toHaveBeenCalled()
    expect(mockPersistentSettings.setQuickSettings).not.toHaveBeenCalled()
    expect(mockPersistentSettings.setAudioSettings).not.toHaveBeenCalled()
  })

  it("persists intro/sidebar/audio/quick settings after hydration", async () => {
    const useUIStore = await loadStore()
    await waitFor(() => expect(useUIStore.getState().isHydrated).toBe(true))

    mockPersistentSettings.setUIState.mockClear()
    mockPersistentSettings.setQuickSettings.mockClear()
    mockPersistentSettings.setAudioSettings.mockClear()

    useUIStore.getState().setHasSeenIntro(true)
    useUIStore.getState().setAntiSpoofDetectionInfoDismissed(true)
    useUIStore.getState().setSidebarCollapsed(true)
    useUIStore.getState().setSidebarWidth(360)
    useUIStore.getState().setQuickSettings({
      cameraMirrored: false,
      showRecognitionNames: false,
      showLandmarks: false,
    })
    useUIStore.getState().setAudioSettings({
      recognitionSoundEnabled: false,
    })

    await waitFor(() => {
      expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
        hasSeenIntro: true,
      })
      expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
        antiSpoofDetectionInfoDismissed: true,
      })
      expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
        sidebarCollapsed: true,
      })
      expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
        sidebarWidth: 360,
      })
      expect(mockPersistentSettings.setQuickSettings).toHaveBeenCalledWith({
        cameraMirrored: false,
        showRecognitionNames: false,
        showLandmarks: false,
      })
      expect(mockPersistentSettings.setAudioSettings).toHaveBeenCalledWith({
        recognitionSoundEnabled: false,
        recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
      })
    })
  })
})
