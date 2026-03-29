import { Tray, Menu, nativeImage, app } from "electron"
import path from "path"
import { state } from "../State.js"

const FACENOX_TRAY_GUID = "7f6b1d4c-7f86-4c73-a9c1-6c7ef5dd8a52"

export class TrayManager {
  static createTray(): void {
    if (state.tray) return

    const iconPath =
      !app.isPackaged ?
        path.join(app.getAppPath(), "public/icons/logo.png")
      : path.join(app.getAppPath(), "out/renderer/icons/logo.png")

    let image
    try {
      image = nativeImage.createFromPath(iconPath)
      if (image.isEmpty()) throw new Error("Icon image is empty")
    } catch (e) {
      console.warn("Failed to load tray icon:", e)
      return
    }

    const tray = new Tray(image.resize({ width: 16, height: 16 }), FACENOX_TRAY_GUID)
    tray.setToolTip("Facenox")

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Quit",
        click: () => {
          state.isQuitting = true
          app.quit()
        },
      },
    ])

    tray.setContextMenu(contextMenu)

    tray.on("click", () => {
      this.toggleWindow()
    })

    state.tray = tray
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
