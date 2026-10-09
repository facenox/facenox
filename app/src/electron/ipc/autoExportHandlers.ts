import { ipcMain, dialog, shell } from "electron"
import { autoExportManager, type AutoExportConfig } from "../managers/AutoExportManager.js"
import { state } from "../State.js"

export function registerAutoExportHandlers() {
  ipcMain.handle("auto-export:get-config", () => {
    return autoExportManager.getConfig()
  })

  ipcMain.handle("auto-export:update-config", (_event, updates: Partial<AutoExportConfig>) => {
    return autoExportManager.updateConfig(updates)
  })

  ipcMain.handle("auto-export:trigger-now", async (_event, targetDate?: string) => {
    return autoExportManager.triggerExport(targetDate)
  })

  ipcMain.handle("auto-export:select-directory", async () => {
    const window = state.mainWindow
    const currentConfig = autoExportManager.getConfig()
    const defaultPath = currentConfig.directory || autoExportManager.getDefaultExportDirectory()

    const result = await dialog.showOpenDialog(window ?? undefined, {
      title: "Select Directory for Scheduled Reports",
      defaultPath,
      properties: ["openDirectory", "createDirectory"],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null }
    }

    const selectedPath = result.filePaths[0]
    autoExportManager.updateConfig({ directory: selectedPath })
    return { canceled: false, path: selectedPath }
  })

  ipcMain.handle("auto-export:open-directory", async () => {
    const config = autoExportManager.getConfig()
    const targetDir = config.directory || autoExportManager.getDefaultExportDirectory()
    await shell.openPath(targetDir)
    return { success: true, path: targetDir }
  })
}
