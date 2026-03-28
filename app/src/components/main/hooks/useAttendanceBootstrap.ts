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
    let cancelled = false

    const { setShellBootstrapping, setShellReady, setShellBootstrapError, setPanelLoading } =
      useAttendanceStore.getState()

    setShellBootstrapping(true)
    setShellReady(false)
    setShellBootstrapError(null)
    window.facenoxElectron?.updateSplashDataStep(8)

    const bootstrap = async () => {
      try {
        await bootstrapShellData()

        if (cancelled) return

        window.facenoxElectron?.updateSplashDataStep(9)

        setShellReady(true)
        setShellBootstrapping(false)
      } catch (error) {
        if (cancelled) return

        const message =
          error instanceof Error ? error.message : "Failed to load startup attendance data."

        setShellBootstrapError(message)
        setShellReady(false)
        setShellBootstrapping(false)
        setPanelLoading(false)
        setError(`Startup data failed to load: ${message}`)
      }
    }

    bootstrap().catch(console.error)

    return () => {
      cancelled = true
    }
  }, [isHydrated, setError])
}
