import type { UpdateInfo } from "@/types/global"
import { persistentSettings } from "./PersistentSettingsService"

class UpdaterService {
  private cachedVersion: string | null = null
  private cachedUpdateInfo: UpdateInfo | null = null
  private lastChecked: Date | null = null
  private initPromise: Promise<void>
  private updateInfoListeners = new Set<(info: UpdateInfo | null) => void>()

  constructor() {
    this.initPromise = this.loadFromStore()
  }

  private emitUpdateInfo(info: UpdateInfo | null) {
    for (const listener of this.updateInfoListeners) {
      try {
        listener(info)
      } catch (error) {
        console.error("[UpdaterService] update listener failed:", error)
      }
    }
  }

  private async loadFromStore() {
    try {
      const info = await persistentSettings.getUpdaterInfo()
      if (info) {
        this.cachedUpdateInfo = info.cachedInfo
        if (info.lastChecked) {
          this.lastChecked = new Date(info.lastChecked)
        }
      }

      // Notify any subscribers that were waiting for initialization.
      this.emitUpdateInfo(this.cachedUpdateInfo)
    } catch (error) {
      console.error("[UpdaterService] Initialization failed:", error)
    }
  }

  async getVersion(): Promise<string> {
    if (this.cachedVersion) {
      return this.cachedVersion
    }

    try {
      const version = await window.electronAPI.updater.getVersion()
      this.cachedVersion = version
      return version
    } catch (error) {
      console.error("[UpdaterService] Failed to get version:", error)
      return "0.0.0"
    }
  }

  async checkForUpdates(force = false): Promise<UpdateInfo> {
    try {
      const updateInfo = await window.electronAPI.updater.checkForUpdates(force)
      this.cachedUpdateInfo = updateInfo
      this.lastChecked = new Date()

      // Persist to disk
      await persistentSettings.setUpdaterInfo({
        cachedInfo: updateInfo,
        lastChecked: this.lastChecked.toISOString(),
      })

      this.emitUpdateInfo(updateInfo)

      return updateInfo
    } catch (error) {
      console.error("[UpdaterService] Failed to check for updates:", error)
      const version = await this.getVersion()
      const fallback: UpdateInfo = {
        currentVersion: version,
        latestVersion: version,
        hasUpdate: false,
        releaseUrl: "",
        releaseNotes: "",
        publishedAt: "",
        downloadUrl: null,
        error: error instanceof Error ? error.message : String(error),
      }

      this.cachedUpdateInfo = fallback
      this.lastChecked = new Date()
      this.emitUpdateInfo(fallback)

      return fallback
    }
  }

  onUpdateInfoChanged(callback: (updateInfo: UpdateInfo | null) => void): () => void {
    this.updateInfoListeners.add(callback)

    // Ensure callback receives the best-known value after store init.
    this.waitForInitialization()
      .then(() => callback(this.cachedUpdateInfo))
      .catch(() => {})

    return () => {
      this.updateInfoListeners.delete(callback)
    }
  }

  getCachedUpdateInfo(): UpdateInfo | null {
    return this.cachedUpdateInfo
  }

  getLastChecked(): Date | null {
    return this.lastChecked
  }

  async waitForInitialization(): Promise<void> {
    return this.initPromise
  }

  async openReleasePage(url?: string): Promise<void> {
    try {
      await window.electronAPI.updater.openReleasePage(url)
    } catch (error) {
      console.error("[UpdaterService] Failed to open release page:", error)

      window.open(url || "https://github.com/facenox/facenox/releases/latest", "_blank")
    }
  }

  onUpdateAvailable(callback: (updateInfo: UpdateInfo) => void): () => void {
    return window.electronAPI.updater.onUpdateAvailable(async (updateInfo) => {
      this.cachedUpdateInfo = updateInfo
      this.lastChecked = new Date()

      // Persist to disk
      await persistentSettings.setUpdaterInfo({
        cachedInfo: updateInfo,
        lastChecked: this.lastChecked.toISOString(),
      })

      this.emitUpdateInfo(updateInfo)

      callback(updateInfo)
    })
  }

  formatPublishedDate(isoDate: string): string {
    if (!isoDate) return ""
    try {
      const date = new Date(isoDate)
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    } catch {
      return isoDate
    }
  }

  parseReleaseNotes(notes: string): string[] {
    if (!notes) return []
    // Split by newlines, filter empty lines, and take first 10 lines
    return notes
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 10)
  }
}

// Singleton instance
export const updaterService = new UpdaterService()
