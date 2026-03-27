import { Tray, Menu, nativeImage, app } from "electron"
import isDev from "../util.js"
import path from "path"
import { fileURLToPath } from "node:url"
import { state } from "../State.js"

const tray_filename = fileURLToPath(import.meta.url)
const tray_dirname = path.dirname(tray_filename)
const FACENOX_TRAY_GUID = "7f6b1d4c-7f86-4c73-a9c1-6c7ef5dd8a52"

export class TrayManager {
  static createTray(): void {
    if (state.tray) return

    const iconPath =
      isDev() ?
        path.join(tray_dirname, "../../public/icons/logo.png")
      : path.join(process.resourcesPath, "icons/logo.png")

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

    const isVisible = state.mainWindow.isVisible()
    const isMinimized = state.mainWindow.isMinimized()
    const isFocused = state.mainWindow.isFocused()

    if (isMinimized || !isVisible) {
      if (isMinimized) state.mainWindow.restore()
      else state.mainWindow.show()

      state.mainWindow.setSkipTaskbar(false)
      state.mainWindow.focus()
      return
    }

    if (isFocused) {
      state.mainWindow.minimize()
      state.mainWindow.setSkipTaskbar(true)
    } else {
      state.mainWindow.focus()
    }
  }
}
