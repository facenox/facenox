import { Tray, Menu, app } from "electron"
import path from "path"
import { state } from "../State.js"

export class TrayManager {
  static createTray(): void {
    if (state.tray) return

    const iconPath =
      !app.isPackaged ?
        path.join(app.getAppPath(), "public/icons/logo.png")
      : path.join(process.resourcesPath, "icons/logo.png")

    try {
      const tray = new Tray(iconPath)

      tray.setToolTip("Facenox")

      const contextMenu = Menu.buildFromTemplate([
        {
          label: "Quit",
          click: () => {
            app.quit()
          },
        },
      ])

      tray.setContextMenu(contextMenu)

      tray.on("click", () => {
        this.toggleWindow()
      })

      state.tray = tray
    } catch (e) {
      console.warn("Failed to instantiate Tray:", e)
    }
  }

  static destroyTray(): void {
    if (!state.tray) return

    if (!state.tray.isDestroyed()) {
      state.tray.destroy()
    }

    state.tray = null
  }

  private static toggleWindow(): void {
    if (!state.mainWindow) return

    if (!state.mainWindow.isVisible()) {
      state.mainWindow.show()
      state.mainWindow.focus()
      return
    }

    if (state.mainWindow.isFocused()) {
      state.mainWindow.hide()
    } else {
      state.mainWindow.focus()
    }
  }
}
