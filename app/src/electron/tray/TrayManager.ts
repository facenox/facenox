import { Tray, Menu, app, nativeImage } from "electron"
import { state } from "../State.js"
import { getTrayIconPath } from "../iconPaths.js"

export class TrayManager {
  static createTray(): void {
    if (state.tray) return

    try {
      const icon = nativeImage.createFromPath(getTrayIconPath())
      const tray = new Tray(icon)

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
