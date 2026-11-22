import { ipcMain } from "electron"
import { checkForUpdates, getCurrentVersion, openReleasePage } from "../updater.js"
import { TrayManager } from "../tray/TrayManager.js"

export function registerUpdaterHandlers() {
  ipcMain.handle("updater:check-for-updates", async (_event, force?: boolean) => {
    try {
      const result = await checkForUpdates(force)
      TrayManager.setUpdateAvailable(result.hasUpdate ? result.latestVersion : null)
      return result
    } catch (error) {
      console.error("[Updater] Update check failed:", error)
      return {
        currentVersion: getCurrentVersion(),
        latestVersion: getCurrentVersion(),
        hasUpdate: false,
        error: String(error),
      }
    }
  })

  ipcMain.handle("updater:get-version", () => {
    return getCurrentVersion()
  })

  ipcMain.handle("updater:open-release-page", async (_event, url?: string) => {
    await openReleasePage(url)
    return true
  })
}
