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

  ipcMain.on("app:ready", () => {
    WindowManager.destroySplash()
    WindowManager.showMainWindow()
  })
}
