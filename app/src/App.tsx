import { useEffect, useRef, useState } from "react"
import { WindowBar } from "@/components/window"
import Main from "@/components/main"
import { useUIStore } from "@/components/main/stores/uiStore"
import { useAttendanceStore } from "@/components/main/stores/attendanceStore"
import { IntroModal } from "@/components/shared/IntroModal"
import { DialogProvider } from "@/components/shared"
import {
  SHELL_REVEAL_TIMEOUT_MS,
  useAttendanceBootstrap,
} from "@/components/main/hooks/useAttendanceBootstrap"
import { AppSkeleton } from "@/components/shared/AppSkeleton"

function App() {
  const { hasSeenIntro, isHydrated } = useUIStore()
  const { isShellReady, shellBootstrapError } = useAttendanceStore()
  const [revealFallbackReached, setRevealFallbackReached] = useState(false)
  const hasSignaledAppReadyRef = useRef(false)

  useAttendanceBootstrap()

  useEffect(() => {
    if (!isHydrated || isShellReady || shellBootstrapError) {
      return
    }

    const timer = setTimeout(() => {
      setRevealFallbackReached(true)
    }, SHELL_REVEAL_TIMEOUT_MS)

    return () => clearTimeout(timer)
  }, [isHydrated, isShellReady, shellBootstrapError])

  const shouldRevealWindow =
    isHydrated && (isShellReady || revealFallbackReached || Boolean(shellBootstrapError))

  useEffect(() => {
    if (shouldRevealWindow && !hasSignaledAppReadyRef.current) {
      hasSignaledAppReadyRef.current = true
      window.facenoxElectron?.onAppReady()
    }
  }, [shouldRevealWindow])

  if (!isHydrated || !shouldRevealWindow) {
    return (
      <div className="electron-window-container bg-[var(--bg-primary)]">
        <WindowBar />
        <div className="flex-1" />
      </div>
    )
  }

  return (
    <DialogProvider>
      <div className="electron-window-container bg-[var(--bg-primary)]">
        <WindowBar />
        <div className="app-content-wrapper">
          <div className="h-full overflow-hidden text-white">
            {shellBootstrapError ?
              <Main />
            : !isShellReady ?
              hasSeenIntro ?
                <Main />
              : <AppSkeleton />
            : hasSeenIntro ?
              <Main />
            : <>
                <AppSkeleton />
                <IntroModal />
              </>
            }
          </div>
        </div>
      </div>
    </DialogProvider>
  )
}

export default App
