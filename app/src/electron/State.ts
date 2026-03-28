import { BrowserWindow, Tray } from "electron"

type SplashProgressUpdate = {
  progress: number
}

export const state = {
  mainWindow: null as BrowserWindow | null,
  splashWindow: null as BrowserWindow | null,
  tray: null as Tray | null,
  isQuitting: false,
  startupTotalSteps: 9,
  splashProgress: {
    progress: 0,
  } as SplashProgressUpdate,
  pendingSplashProgress: [] as SplashProgressUpdate[],
  isSplashReady: false,
  isRevealingMainWindow: false,
  maxSplashProgressSeen: 0,
  splashRenderedProgress: 0,
  splashCompletedAt: 0,
  isSplashDataPhaseUnlocked: false,
  pendingDeferredSplashProgress: null as number | null,
  pendingRevealAfterSplashRender: false,
  splashRevealTimeout: null as NodeJS.Timeout | null,
}
