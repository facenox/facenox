import { BrowserWindow, dialog, shell, app } from "electron"
import path from "path"
import { fileURLToPath } from "node:url"
import isDev from "../util.js"
import { state } from "../State.js"
import { persistentStore } from "../persistentStore.js"
import { getWindowIconPath } from "../iconPaths.js"

const window_filename = fileURLToPath(import.meta.url)
const window_dirname = path.dirname(window_filename)
const FINAL_SPLASH_HOLD_MS = 300

export class WindowManager {
  static progressFromStep(step: number, totalSteps = state.startupTotalSteps): number {
    const safeTotalSteps = Math.max(1, totalSteps)
    const safeStep = Math.max(0, Math.min(step, safeTotalSteps))
    return Math.round((safeStep / safeTotalSteps) * 100)
  }

  static createSplashWindow(): BrowserWindow {
    state.startupTotalSteps = 9
    state.splashProgress = {
      progress: 0,
    }
    state.pendingSplashProgress = [state.splashProgress]
    state.isSplashReady = false
    state.isRevealingMainWindow = false
    state.maxSplashProgressSeen = 0
    state.splashRenderedProgress = 0
    state.splashCompletedAt = 0
    state.isSplashDataPhaseUnlocked = false
    state.pendingDeferredSplashProgress = null
    state.pendingRevealAfterSplashRender = false
    state.splashRevealTimeout = null

    const splash = new BrowserWindow({
      width: 300,
      height: 280,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      center: true,
      backgroundColor: "#00000000",
      icon: getWindowIconPath(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(window_dirname, "../preload/preload.js"),
      },
    })

    const splashPath =
      isDev() ?
        path.join(app.getAppPath(), "out", "main", "splash.html")
      : path.join(window_dirname, "splash.html")
    splash.loadFile(splashPath)
    splash.webContents.once("did-finish-load", () => {
      state.isSplashReady = true
      const initialUpdate =
        state.pendingSplashProgress[state.pendingSplashProgress.length - 1] ?? state.splashProgress

      state.pendingSplashProgress = []
      splash.webContents.send("splash:progress", initialUpdate)
      if (!splash.isDestroyed()) {
        splash.show()
      }
    })

    state.splashWindow = splash
    return splash
  }

  static destroySplash(): void {
    if (state.splashWindow && !state.splashWindow.isDestroyed()) {
      state.splashWindow.destroy()
      state.splashWindow = null
    }
    if (state.splashRevealTimeout) {
      clearTimeout(state.splashRevealTimeout)
      state.splashRevealTimeout = null
    }
    state.pendingSplashProgress = []
    state.isSplashReady = false
    state.isRevealingMainWindow = false
    state.maxSplashProgressSeen = 0
    state.splashRenderedProgress = 0
    state.splashCompletedAt = 0
    state.isSplashDataPhaseUnlocked = false
    state.pendingDeferredSplashProgress = null
    state.pendingRevealAfterSplashRender = false
  }

  static updateSplashProgress(progress: number): void {
    const clampedProgress = Math.max(0, Math.min(100, progress))

    if (clampedProgress < state.maxSplashProgressSeen) {
      return
    }

    const update = {
      progress: clampedProgress,
    }

    state.splashProgress = update
    state.maxSplashProgressSeen = clampedProgress

    if (!state.splashWindow || state.splashWindow.isDestroyed()) {
      return
    }

    if (!state.isSplashReady) {
      state.pendingSplashProgress.push(update)
      return
    }

    state.splashWindow.webContents.send("splash:progress", update)
  }

  static updateSplashDataStep(step: number): void {
    const clampedProgress = WindowManager.progressFromStep(step)

    if (!state.isSplashDataPhaseUnlocked) {
      state.pendingDeferredSplashProgress = clampedProgress
      return
    }

    WindowManager.updateSplashProgress(clampedProgress)
  }

  static unlockSplashDataPhase(): void {
    if (state.isSplashDataPhaseUnlocked) {
      return
    }

    state.isSplashDataPhaseUnlocked = true

    if (!state.pendingDeferredSplashProgress) {
      return
    }

    const deferredProgress = state.pendingDeferredSplashProgress
    state.pendingDeferredSplashProgress = null
    WindowManager.updateSplashProgress(deferredProgress)
  }

  static handleSplashProgressRendered(progress: number): void {
    const clampedProgress = Math.max(0, Math.min(100, progress))
    state.splashRenderedProgress = Math.max(state.splashRenderedProgress, clampedProgress)
    if (state.splashRenderedProgress >= 100 && state.splashCompletedAt === 0) {
      state.splashCompletedAt = Date.now()
    }

    if (state.pendingRevealAfterSplashRender && state.splashRenderedProgress >= 100) {
      WindowManager.scheduleSplashRevealAfterCompletion()
    }
  }

  private static finalizeSplashReveal(): void {
    WindowManager.destroySplash()
    WindowManager.showMainWindow()
  }

  private static scheduleSplashRevealAfterCompletion(): void {
    if (state.splashRevealTimeout) {
      return
    }

    const completedAt = state.splashCompletedAt || Date.now()
    const elapsed = Date.now() - completedAt
    const remainingDelay = Math.max(0, FINAL_SPLASH_HOLD_MS - elapsed)

    state.pendingRevealAfterSplashRender = false
    state.splashRevealTimeout = setTimeout(() => {
      state.splashRevealTimeout = null
      WindowManager.finalizeSplashReveal()
    }, remainingDelay)
  }

  static async revealMainWindowFromSplash(): Promise<void> {
    if (state.isRevealingMainWindow) {
      return
    }

    state.isRevealingMainWindow = true
    if (
      state.splashWindow &&
      !state.splashWindow.isDestroyed() &&
      state.maxSplashProgressSeen >= 100 &&
      state.splashRenderedProgress < 100
    ) {
      state.pendingRevealAfterSplashRender = true
      return
    }

    if (
      state.splashWindow &&
      !state.splashWindow.isDestroyed() &&
      state.splashRenderedProgress >= 100
    ) {
      WindowManager.scheduleSplashRevealAfterCompletion()
      return
    }

    WindowManager.finalizeSplashReveal()
  }

  static createWindow(): void {
    const mainWindow = new BrowserWindow({
      width: 1280,
      height: 600,
      minWidth: 800,
      minHeight: 500,
      maxWidth: 3840,
      maxHeight: 2160,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(window_dirname, "../preload/preload.js"),
        webgl: true,
        zoomFactor: 1.0,
        devTools: isDev(),
      },
      titleBarStyle: "hidden",
      transparent: false,
      backgroundColor: "#000000",
      icon: getWindowIconPath(),
    })

    state.mainWindow = mainWindow

    // Load content
    if (isDev() && process.env.ELECTRON_RENDERER_URL) {
      mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      mainWindow.loadFile(path.join(window_dirname, "../renderer/index.html"))
    }

    mainWindow.once("ready-to-show", () => {
      // Intentionally left blank or can be removed if nothing else is inside
    })

    mainWindow.on("maximize", () => {
      mainWindow.webContents.send("window:maximized")
      if (process.platform === "win32") {
        mainWindow.setResizable(false)
      }
    })

    mainWindow.on("unmaximize", () => {
      if (process.platform === "win32") {
        mainWindow.setResizable(true)
      }
      mainWindow.webContents.send("window:unmaximized")
    })

    let isHandlingClose = false
    mainWindow.on("close", (event) => {
      if (state.isQuitting) return
      if (isHandlingClose) {
        event.preventDefault()
        return
      }

      event.preventDefault()

      const dismissed = Boolean(persistentStore.get("ui.closeToTrayNoticeDismissed"))
      if (dismissed) {
        mainWindow.hide()
        return
      }

      isHandlingClose = true
      void dialog
        .showMessageBox(mainWindow, {
          type: "info",
          title: "Facenox is running in the background",
          message: "Facenox will keep running in your system tray.",
          detail:
            "You can fully close the app by right-clicking the tray icon and selecting 'Quit'.",
          buttons: ["Keep running", "Quit"],
          defaultId: 0,
          cancelId: 0,
          checkboxLabel: "Don't show this reminder again",
          checkboxChecked: false,
          noLink: true,
        })
        .then(({ response, checkboxChecked }) => {
          if (checkboxChecked) {
            persistentStore.set("ui.closeToTrayNoticeDismissed", true)
          }

          if (response === 1) {
            state.isQuitting = true
            app.quit()
            return
          }

          mainWindow.hide()
        })
        .finally(() => {
          isHandlingClose = false
        })
    })

    mainWindow.on("closed", () => {
      state.mainWindow = null
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http"))
        shell.openExternal(url).catch((err) => {
          console.warn("Failed to open external URL:", err)
        })
      return { action: "deny" }
    })
  }

  static showMainWindow(): void {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.setZoomLevel(0)
      state.mainWindow.show()
      state.mainWindow.focus()
      if (process.platform === "win32") {
        try {
          state.mainWindow.moveTop()
        } catch (error) {
          console.warn("Could not move window to top:", error)
        }
      }
    }
  }
}
