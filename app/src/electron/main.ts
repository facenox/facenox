import { app, protocol, BrowserWindow, nativeTheme, powerMonitor, net } from "electron"
import path from "path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { backendService } from "./backendService.js"
import { startBackgroundUpdateCheck } from "./updater.js"
import isDev from "./util.js"
import { state } from "./State.js"
// This file provides geometric window shape utilities for rounded corners on Windows.
import { WindowManager } from "./window/WindowManager.js"
import { TrayManager } from "./tray/TrayManager.js"
import { registerAllHandlers } from "./ipc/index.js"
import { syncManager } from "./managers/BackgroundSyncManager.js"
import { autoExportManager } from "./managers/AutoExportManager.js"

const main_filename = fileURLToPath(import.meta.url)
const main_dirname = path.dirname(main_filename)
const FACENOX_APP_ID = "com.facenox.app"

if (isDev()) {
  app.setName("Facenox-dev")
} else {
  app.setName("Facenox")
}

if (process.platform === "win32") {
  app.setAppUserModelId(FACENOX_APP_ID)
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.warn("[Main] Another instance is already running. Quitting...")
  app.quit()
  process.exit(0)
}

app.on("second-instance", () => {
  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.show()
    state.mainWindow.focus()
  }
})

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark"
  registerAllHandlers()
  const unsubscribeStartupProgress = backendService.onStartupProgress((update) => {
    state.startupTotalSteps = update.totalSteps
    WindowManager.updateSplashProgress(update.progress)
  })

  // Custom protocol for static file access using modern protocol.handle and net.fetch
  protocol.handle("app", (request) => {
    try {
      const urlObj = new URL(request.url)
      const relativeUrl = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ""))

      let baseDir: string
      if (isDev()) {
        baseDir = path.join(main_dirname, "../../public")
      } else {
        const appPath = app.getAppPath()
        baseDir = path.join(appPath, "dist-react")
      }

      const resolvedBaseDir = path.resolve(baseDir)
      const resolvedFilePath = path.resolve(resolvedBaseDir, relativeUrl)

      if (
        resolvedFilePath !== resolvedBaseDir &&
        !resolvedFilePath.startsWith(resolvedBaseDir + path.sep)
      ) {
        return new Response("Access Denied", { status: 403 })
      }

      return net.fetch(pathToFileURL(resolvedFilePath).toString())
    } catch {
      return new Response("Not Found", { status: 404 })
    }
  })

  WindowManager.createSplashWindow()

  // Warm background services sequentially to prevent CPU/IO thrashing.
  let backendReady = false
  try {
    await backendService.start()

    const maxWaitTime = 30000
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      const readiness = await backendService.checkReadiness()
      if (readiness.ready) {
        backendReady = true
        break
      }
      await new Promise((r) => setTimeout(r, 250))
    }

    if (!backendReady) {
      throw new Error("Backend readiness synchronization timed out.")
    }
  } catch (e) {
    console.error("[Main] Backend initialization failed:", e)

    // Destroy splash to reveal the blocking system modal dialog.
    WindowManager.destroySplash()

    const { dialog } = await import("electron")
    const { response } = await dialog.showMessageBox({
      type: "error",
      title: "FACENOX Startup Error",
      message: "Failed to start background services.",
      detail: e instanceof Error ? e.message : "An unknown error occurred during backend startup.",
      buttons: ["Retry", "Quit"],
    })

    if (response === 0) {
      app.relaunch()
      app.exit(0)
    } else {
      app.quit()
    }
    return
  }

  // Advance splash state to stage 7 (backend hot) and spawn background syncing.
  WindowManager.updateSplashProgress(WindowManager.progressFromStep(7))
  WindowManager.unlockSplashDataPhase()
  syncManager.start()
  autoExportManager.start()

  // Instantiate Chromium window only after CPU-bound backend boot sequence ends.
  WindowManager.createWindow()

  // Wait for compositor ready before unlocking transition handshakes.
  await new Promise<void>((resolve) => {
    state.mainWindow?.once("ready-to-show", () => resolve())
  })

  // Listen for OS resume events to notify renderer for drift corrections and restore backend readiness
  powerMonitor.on("resume", async () => {
    await backendService.checkReadiness().catch(() => {})
    void autoExportManager.checkAndRunExport().catch(() => {})
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send("system:resume")
    }
  })

  TrayManager.createTray()

  if (!isDev()) {
    startBackgroundUpdateCheck(state.mainWindow, 60000, (version) =>
      TrayManager.setUpdateAvailable(version),
    )
  }

  unsubscribeStartupProgress()
})

function cleanup() {
  if (state.isQuitting) return
  state.isQuitting = true
  TrayManager.destroyTray()
  console.log("[Main] Stopping backend...")
  backendService.killSync()
}

app.on("before-quit", (event) => {
  if (!state.isQuitting) {
    event.preventDefault()
    cleanup()
    setImmediate(() => app.exit(0))
  }
})

app.on("activate", () => {
  if (state.mainWindow === null) {
    WindowManager.createWindow()
    const win = state.mainWindow as BrowserWindow | null
    win?.once("ready-to-show", () => WindowManager.showMainWindow())
  } else if (state.mainWindow && !state.mainWindow.isVisible()) {
    state.mainWindow.show()
  }
})
