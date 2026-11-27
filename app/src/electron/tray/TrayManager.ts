import { Tray, Menu, app, nativeImage } from 'electron'
import { state } from '../State.js'
import { getTrayIconPath } from '../iconPaths.js'
import { openReleasePage } from '../updater.js'

export class TrayManager {
  static createTray(): void {
    if (state.tray) return

    try {
      const icon = nativeImage.createFromPath(getTrayIconPath())
      const tray = new Tray(icon)

      tray.setToolTip('Facenox')
      tray.setContextMenu(this.buildMenu(null))

      tray.on('click', () => {
        this.toggleWindow()
      })

      state.tray = tray
    } catch (e) {
      console.warn('Failed to instantiate Tray:', e)
    }
  }

  static setUpdateAvailable(version: string | null): void {
    if (!state.tray || state.tray.isDestroyed()) return

    if (version) {
      state.tray.setToolTip(`Facenox - Update v${version} available`)
    } else {
      state.tray.setToolTip('Facenox')
    }

    state.tray.setContextMenu(this.buildMenu(version))
  }

  private static buildMenu(version: string | null): Electron.Menu {
    const items: Electron.MenuItemConstructorOptions[] = []

    if (version) {
      items.push({
        label: `Update v${version} Available`,
        click: () => {
          void openReleasePage().catch((error) => {
            console.warn('Could not open the Facenox download page.', error)
          })
        }
      })
      items.push({ type: 'separator' })
    }

    items.push({
      label: 'Show Facenox',
      click: () => this.showWindow()
    })

    items.push({
      label: 'Quit',
      click: () => {
        app.quit()
      }
    })

    return Menu.buildFromTemplate(items)
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

  private static showWindow(): void {
    if (!state.mainWindow) return
    state.mainWindow.show()
    state.mainWindow.focus()
  }
}
