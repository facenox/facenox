import { ipcMain } from "electron"
import { state } from "../State.js"
import { WindowManager } from "../window/WindowManager.js"

export function registerWindowHandlers() {
  ipcMain.handle("window:minimize", () => {
    if (state.mainWindow) state.mainWindow.minimize()
    return true
  })

  ipcMain.handle("window:maximize", () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMaximized()) {
        state.mainWindow.unmaximize()
      } else {
        state.mainWindow.maximize()
      }
    }
    return true
  })

  ipcMain.handle("window:close", () => {
    if (state.mainWindow) state.mainWindow.close()
    return true
  })

  ipcMain.on("splash:update-progress", (_event, progress: number) => {
    WindowManager.updateSplashProgress(progress)
  })

  ipcMain.on("splash:update-data-step", (_event, step: number) => {
    WindowManager.updateSplashDataStep(step)
  })

  ipcMain.on("splash:rendered-progress", (_event, progress: number) => {
    WindowManager.handleSplashProgressRendered(progress)
  })

  ipcMain.on("app:ready", () => {
    void WindowManager.revealMainWindowFromSplash()
  })
}
