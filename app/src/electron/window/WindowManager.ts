import { BrowserWindow, dialog, shell, app } from "electron"
import path from "path"
import { fileURLToPath } from "node:url"
import isDev from "../util.js"
import { state } from "../State.js"
import { persistentStore } from "../persistentStore.js"
import { getWindowIconPath } from "../iconPaths.js"

const window_filename = fileURLToPath(import.meta.url)
const window_dirname = path.dirname(window_filename)
const MIN_SPLASH_VISIBLE_MS = 450
const RENDERER_READY_TIMEOUT_MS = 30_000

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
      detail: "Starting",
    }
    state.pendingSplashProgress = [state.splashProgress]
    state.isSplashReady = false
    state.isRevealingMainWindow = false
    state.maxSplashProgressSeen = 0
    state.splashRenderedProgress = 0
    state.splashShownAt = 0
    state.isSplashDataPhaseUnlocked = false
    state.pendingDeferredSplashProgress = null
    state.pendingRevealAfterSplashRender = false
    state.splashRevealTimeout = null
    state.splashRevealSafetyTimeout = null
    state.rendererReadyTimeout = null

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
        preload: path.join(window_dirname, "../preload/preload-splash.js"),
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
        state.splashShownAt = Date.now()
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
    if (state.splashRevealSafetyTimeout) {
      clearTimeout(state.splashRevealSafetyTimeout)
      state.splashRevealSafetyTimeout = null
    }
    if (state.rendererReadyTimeout) {
      clearTimeout(state.rendererReadyTimeout)
      state.rendererReadyTimeout = null
    }
    state.pendingSplashProgress = []
    state.isSplashReady = false
    state.isRevealingMainWindow = false
    state.maxSplashProgressSeen = 0
    state.splashRenderedProgress = 0
    state.splashShownAt = 0
    state.isSplashDataPhaseUnlocked = false
    state.pendingDeferredSplashProgress = null
    state.pendingRevealAfterSplashRender = false
  }

  static updateSplashProgress(progress: number, detail?: string): void {
    const clampedProgress = Math.max(0, Math.min(100, progress))

    if (clampedProgress < state.maxSplashProgressSeen) {
      return
    }

    const update = {
      progress: clampedProgress,
      ...(detail?.trim() ? { detail: detail.trim() } : {}),
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

  static updateSplashDataStep(step: number, detail?: string): void {
    const update = {
      progress: WindowManager.progressFromStep(step),
      ...(detail?.trim() ? { detail: detail.trim() } : {}),
    }

    if (!state.isSplashDataPhaseUnlocked) {
      state.pendingDeferredSplashProgress = update
      return
    }

    WindowManager.updateSplashProgress(update.progress, update.detail)
  }

  static unlockSplashDataPhase(): void {
    if (state.isSplashDataPhaseUnlocked) {
      return
    }

    state.isSplashDataPhaseUnlocked = true

    if (state.pendingDeferredSplashProgress === null) {
      return
    }

    const deferredUpdate = state.pendingDeferredSplashProgress
    state.pendingDeferredSplashProgress = null
    WindowManager.updateSplashProgress(deferredUpdate.progress, deferredUpdate.detail)
  }

  static handleSplashProgressRendered(progress: number): void {
    const clampedProgress = Math.max(0, Math.min(100, progress))
    state.splashRenderedProgress = Math.max(state.splashRenderedProgress, clampedProgress)

    if (state.pendingRevealAfterSplashRender && state.splashRenderedProgress >= 100) {
      WindowManager.scheduleSplashRevealAfterCompletion()
    }
  }

  private static finalizeSplashReveal(): void {
    if (state.splashRevealSafetyTimeout) {
      clearTimeout(state.splashRevealSafetyTimeout)
      state.splashRevealSafetyTimeout = null
    }
    if (state.splashRevealTimeout) {
      clearTimeout(state.splashRevealTimeout)
      state.splashRevealTimeout = null
    }
    if (state.rendererReadyTimeout) {
      clearTimeout(state.rendererReadyTimeout)
      state.rendererReadyTimeout = null
    }
    WindowManager.showMainWindow()
    setTimeout(() => {
      WindowManager.destroySplash()
    }, 100)
  }

  private static scheduleSplashRevealAfterCompletion(): void {
    state.pendingRevealAfterSplashRender = false
    if (state.splashRevealTimeout) {
      clearTimeout(state.splashRevealTimeout)
      state.splashRevealTimeout = null
    }
    const elapsed = state.splashShownAt > 0 ? Date.now() - state.splashShownAt : 0
    const remaining = Math.max(0, MIN_SPLASH_VISIBLE_MS - elapsed)
    if (remaining === 0) {
      WindowManager.finalizeSplashReveal()
      return
    }

    state.splashRevealTimeout = setTimeout(() => {
      state.splashRevealTimeout = null
      WindowManager.finalizeSplashReveal()
    }, remaining)
  }

  static startRendererReadyWatchdog(timeoutMs = RENDERER_READY_TIMEOUT_MS): void {
    if (state.isRevealingMainWindow) {
      return
    }

    if (state.rendererReadyTimeout) {
      clearTimeout(state.rendererReadyTimeout)
    }

    state.rendererReadyTimeout = setTimeout(() => {
      state.rendererReadyTimeout = null
      if (state.isRevealingMainWindow || !state.mainWindow || state.mainWindow.isDestroyed()) {
        return
      }

      console.warn("[WindowManager] Renderer startup timed out. Revealing the loading shell.")
      WindowManager.updateSplashProgress(100, "Opening Facenox")
      void WindowManager.revealMainWindowFromSplash()
    }, timeoutMs)
  }

  static async revealMainWindowFromSplash(): Promise<void> {
    if (state.isRevealingMainWindow) {
      return
    }

    state.isRevealingMainWindow = true
    if (state.rendererReadyTimeout) {
      clearTimeout(state.rendererReadyTimeout)
      state.rendererReadyTimeout = null
    }

    state.splashRevealSafetyTimeout = setTimeout(() => {
      console.warn("[WindowManager] Splash reveal handshake timed out. Forcing show.")
      WindowManager.finalizeSplashReveal()
    }, 2000)

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

  static createWindow(): Promise<void> {
    const mainWindow = new BrowserWindow({
      title: "Facenox",
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
        backgroundThrottling: false,
      },
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 12, y: 10 },
      transparent: false,
      backgroundColor: "#000000",
      icon: getWindowIconPath(),
    })

    state.mainWindow = mainWindow

    const readyToShow = new Promise<void>((resolve) => {
      mainWindow.once("ready-to-show", () => resolve())
    })

    if (isDev() && process.env.ELECTRON_RENDERER_URL) {
      mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      mainWindow.loadFile(path.join(window_dirname, "../renderer/index.html"))
    }

    mainWindow.on("maximize", () => {
      mainWindow.webContents.send("window:maximized")
    })

    mainWindow.on("unmaximize", () => {
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
          title: "Running in the background",
          message: "Facenox will continue running in the system tray.",
          detail: "Right-click the tray icon and select 'Quit' to exit completely.",
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

    return readyToShow
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
