import { BrowserWindow, Tray } from "electron"

type SplashProgressUpdate = {
  progress: number
  detail?: string
}

export const state = {
  mainWindow: null as BrowserWindow | null,
  splashWindow: null as BrowserWindow | null,
  tray: null as Tray | null,
  isQuitting: false,
  startupTotalSteps: 9,
  splashProgress: {
    progress: 0,
    detail: "Starting",
  } as SplashProgressUpdate,
  pendingSplashProgress: [] as SplashProgressUpdate[],
  isSplashReady: false,
  isRevealingMainWindow: false,
  maxSplashProgressSeen: 0,
  splashRenderedProgress: 0,
  splashShownAt: 0,
  isSplashDataPhaseUnlocked: false,
  pendingDeferredSplashProgress: null as SplashProgressUpdate | null,
  pendingRevealAfterSplashRender: false,
  splashRevealTimeout: null as NodeJS.Timeout | null,
  splashRevealSafetyTimeout: null as NodeJS.Timeout | null,
  rendererReadyTimeout: null as NodeJS.Timeout | null,
}
