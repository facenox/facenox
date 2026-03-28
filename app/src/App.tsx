import { useEffect, useRef } from "react"
import { WindowBar } from "@/components/window"
import Main from "@/components/main"
import { useUIStore } from "@/components/main/stores/uiStore"
import { useAttendanceStore } from "@/components/main/stores/attendanceStore"
import { IntroModal } from "@/components/shared/IntroModal"
import { DialogProvider } from "@/components/shared"
import { useAttendanceBootstrap } from "@/components/main/hooks/useAttendanceBootstrap"
import { AppSkeleton } from "@/components/shared/AppSkeleton"

function App() {
  const { hasSeenIntro, isHydrated } = useUIStore()
  const { isShellReady, shellBootstrapError } = useAttendanceStore()
  const hasSignaledAppReadyRef = useRef(false)

  useAttendanceBootstrap()

  const shouldRevealWindow = isHydrated && (isShellReady || Boolean(shellBootstrapError))

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
