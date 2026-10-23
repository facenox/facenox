import { useEffect, useRef } from "react"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { bootstrapShellData } from "@/components/main/hooks/useAttendanceGroups"

export function useAttendanceBootstrap() {
  const isHydrated = useUIStore((state) => state.isHydrated)
  const setError = useUIStore((state) => state.setError)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!isHydrated || startedRef.current) return

    startedRef.current = true

    const { setShellBootstrapping, setShellReady, setShellBootstrapError, setPanelLoading } =
      useAttendanceStore.getState()

    setShellBootstrapping(true)
    setShellReady(false)
    setShellBootstrapError(null)
    window.facenoxElectron?.updateSplashDataStep(8)

    const bootstrap = async () => {
      try {
        await bootstrapShellData()

        window.facenoxElectron?.updateSplashDataStep(9)

        setShellReady(true)
        setShellBootstrapping(false)
      } catch (error) {
        const technicalMessage = error instanceof Error ? error.message : ""
        const message =
          /offline|backend|connect/i.test(technicalMessage) ?
            "Facenox couldn't load your data because the local service is offline. Restart the app and try again."
          : "Facenox couldn't load your data. Restart the app and try again."

        setShellBootstrapError(message)
        setShellReady(false)
        setShellBootstrapping(false)
        setPanelLoading(false)
        setError(message)
      }
    }

    bootstrap().catch(console.error)
  }, [isHydrated, setError])
}
