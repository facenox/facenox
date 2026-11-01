import { beforeEach, describe, expect, it, vi } from "vitest"
import { persistentSettings } from "./PersistentSettingsService"

describe("PersistentSettingsService - Audio Settings", () => {
  let storeData: Record<string, unknown>

  beforeEach(() => {
    storeData = {}
    vi.mocked(window.electronAPI.store.get).mockImplementation(async (key: string) => {
      return storeData[key]
    })
    vi.mocked(window.electronAPI.store.set).mockImplementation(
      async (key: string, val: unknown) => {
        storeData[key] = val
        return true
      },
    )
  })

  it("migrates legacy Default.mp3 to Recognition_Success.wav", async () => {
    storeData["audio"] = {
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/Default.mp3",
    }

    const settings = await persistentSettings.getAudioSettings()
    expect(settings.recognitionSoundUrl).toBe("./assets/sounds/Recognition_Success.wav")
  })

  it("migrates legacy Recognition_Success.mp3 to Recognition_Success.wav", async () => {
    storeData["audio"] = {
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
    }

    const settings = await persistentSettings.getAudioSettings()
    expect(settings.recognitionSoundUrl).toBe("./assets/sounds/Recognition_Success.wav")
  })

  it("preserves valid custom .mp3 sounds without wiping them out", async () => {
    storeData["audio"] = {
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/my_custom_chime.mp3",
    }

    const settings = await persistentSettings.getAudioSettings()
    expect(settings.recognitionSoundUrl).toBe("./assets/sounds/my_custom_chime.mp3")
  })

  it("preserves valid wav presets", async () => {
    storeData["audio"] = {
      recognitionSoundEnabled: true,
      recognitionSoundUrl: "./assets/sounds/Classic_Beep.wav",
    }

    const settings = await persistentSettings.getAudioSettings()
    expect(settings.recognitionSoundUrl).toBe("./assets/sounds/Classic_Beep.wav")
  })
})
