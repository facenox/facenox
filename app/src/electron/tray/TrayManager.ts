import { Tray, Menu, nativeImage, app } from "electron"
import isDev from "../util.js"
import path from "path"
import { fileURLToPath } from "node:url"
import { state } from "../State.js"

const tray_filename = fileURLToPath(import.meta.url)
const tray_dirname = path.dirname(tray_filename)

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

    const tray = new Tray(image.resize({ width: 16, height: 16 }))
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
