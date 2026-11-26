import { useEffect, useRef } from "react"
import { WindowBar } from "@/components/window"
import Main from "@/components/main"
import { useUIStore } from "@/components/main/stores/uiStore"
import { useAttendanceStore } from "@/components/main/stores/attendanceStore"
import { IntroModal } from "@/components/shared/IntroModal"
import { DialogProvider } from "@/components/shared"
import { useAttendanceBootstrap } from "@/components/main/hooks/useAttendanceBootstrap"
import { AppSkeleton } from "@/components/shared/AppSkeleton"
import { ErrorBoundary } from "@/components/common/ErrorBoundary"
import { useCloudSyncConfig } from "@/services/cloudSyncState"

function App() {
  const { hasSeenIntro, isHydrated } = useUIStore()
  const { isShellReady, shellBootstrapError, attendanceGroups, systemStats } =
    useAttendanceStore()
  const { config: cloudConfig, status: cloudConfigStatus } = useCloudSyncConfig()
  const hasSignaledAppReadyRef = useRef(false)

  useAttendanceBootstrap()

  const hasExistingLocalData =
    attendanceGroups.length > 0 ||
    (systemStats?.totalMembers ?? 0) > 0 ||
    (systemStats?.totalPersons ?? 0) > 0
  const isCloudConnected = Boolean(cloudConfig?.connected)
  const cloudStatusSettled = cloudConfigStatus !== "loading" || hasExistingLocalData

  const shouldRevealWindow =
    isHydrated &&
    (Boolean(shellBootstrapError) || (isShellReady && (!hasSeenIntro || cloudStatusSettled)))

  const requiresCloudGate =
    !shellBootstrapError &&
    isShellReady &&
    (!hasSeenIntro || (!isCloudConnected && !hasExistingLocalData))

  useEffect(() => {
    if (shouldRevealWindow && !hasSignaledAppReadyRef.current) {
      hasSignaledAppReadyRef.current = true
      window.facenoxElectron?.onAppReady()
    }
  }, [shouldRevealWindow])

  useEffect(() => {
    if (requiresCloudGate) {
      useUIStore.getState().setShowSettings(false)
    }
  }, [requiresCloudGate])

  if (!isHydrated || !shouldRevealWindow) {
    return (
      <div className="electron-window-container bg-[var(--bg-primary)]">
        <WindowBar />
        <div className="app-content-wrapper">
          <div className="h-full overflow-hidden text-white">
            <AppSkeleton />
          </div>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <DialogProvider>
        <div className="electron-window-container bg-[var(--bg-primary)]">
          <WindowBar />
          <div className="app-content-wrapper">
            <div className="h-full overflow-hidden text-white">
              {shellBootstrapError ?
                <Main />
              : requiresCloudGate ?
                <>
                  <AppSkeleton />
                  <IntroModal
                    initialStep={hasSeenIntro ? 2 : 0}
                    allowLocalContinue={hasExistingLocalData}
                  />
                </>
              : <Main />}
            </div>
          </div>
        </div>
      </DialogProvider>
    </ErrorBoundary>
  )
}

export default App
