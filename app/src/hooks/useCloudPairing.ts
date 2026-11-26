import { useCallback, useEffect, useRef, useState } from "react"
import { refreshCloudSyncConfig, type CloudConfigStatus } from "@/services/cloudSyncState"
import { isOfflineError } from "@/components/settings/sections/syncErrorUtils"
import {
  DEFAULT_REMOTE_BASE_URL,
  OFFICIAL_REMOTE_BASE_URL,
  isOfficialCloudUrl,
} from "@/services/syncDefaults"

export interface ReversePairingData {
  remoteBaseUrl: string
  deviceName: string
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

export function getEffectiveRemoteUrl(url?: string): string {
  const clean = (url || "").trim()
  return !clean || isOfficialCloudUrl(clean) ? OFFICIAL_REMOTE_BASE_URL : clean
}

interface UseCloudPairingOptions {
  enabled?: boolean
  configReady?: boolean
  pairingConfigDirty?: boolean
  remoteBaseUrl?: string
  deviceName?: string
  connected: boolean
  cloudConfigStatus: CloudConfigStatus
  busyAction: "saving" | "pairing" | "disconnecting" | "syncing" | null
  setBusyAction: (action: "saving" | "pairing" | "disconnecting" | "syncing" | null) => void
  onSuccess?: (message: string) => void
  onError?: (message: string | null) => void
  onConnected?: () => void
}

/**
 * Shared reverse-pairing and manual code-pairing state machine used by both
 * the first-run Cloud onboarding gate and Settings -> Cloud sync.
 */
export function useCloudPairing({
  enabled = true,
  configReady = true,
  pairingConfigDirty = false,
  remoteBaseUrl = DEFAULT_REMOTE_BASE_URL,
  deviceName = "",
  connected,
  cloudConfigStatus,
  busyAction,
  setBusyAction,
  onSuccess,
  onError,
  onConnected,
}: UseCloudPairingOptions) {
  const [reversePairing, setReversePairing] = useState<ReversePairingData | null>(null)
  const [isInitiating, setIsInitiating] = useState(false)
  const [initiateError, setInitiateError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number>(900)
  const [pairingCode, setPairingCode] = useState("")

  const isInitiatingRef = useRef(false)
  const pairingRequestRef = useRef(0)
  const mountedRef = useRef(false)

  useEffect(() => {
    const requestSequence = pairingRequestRef
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestSequence.current += 1
      isInitiatingRef.current = false
    }
  }, [])

  useEffect(() => {
    ++pairingRequestRef.current
    isInitiatingRef.current = false
    setIsInitiating(false)
    setReversePairing(null)
    setInitiateError(null)
  }, [remoteBaseUrl, deviceName])

  useEffect(() => {
    if (cloudConfigStatus !== "ready" || connected || !enabled) {
      ++pairingRequestRef.current
      isInitiatingRef.current = false
      setIsInitiating(false)
      setReversePairing(null)
      if (connected) setInitiateError(null)
    }
  }, [cloudConfigStatus, connected, enabled])

  const loadConfig = useCallback(async () => {
    return refreshCloudSyncConfig()
  }, [])

  const resetPairingState = useCallback(() => {
    setPairingCode("")
    setReversePairing(null)
    setInitiateError(null)
  }, [])

  const startReversePairing = useCallback(
    async (overrideBaseUrl?: string) => {
      if (
        !enabled ||
        !configReady ||
        pairingConfigDirty ||
        busyAction !== null ||
        cloudConfigStatus !== "ready" ||
        connected ||
        isInitiatingRef.current
      ) {
        return
      }
      const request = ++pairingRequestRef.current
      isInitiatingRef.current = true
      setIsInitiating(true)
      setInitiateError(null)
      const targetUrl = getEffectiveRemoteUrl(
        overrideBaseUrl !== undefined ? overrideBaseUrl : remoteBaseUrl,
      )
      const isTargetCustom = !isOfficialCloudUrl(targetUrl)
      const targetDisplayName = isTargetCustom ? "Custom server" : "Facenox Cloud"

      try {
        const res = await window.electronAPI.sync.initiateReversePairing({
          remoteBaseUrl: targetUrl,
          deviceName,
        })
        if (!mountedRef.current || pairingRequestRef.current !== request) return
        if (!res.success || !res.data) {
          setInitiateError(res.error || `Could not connect to ${targetDisplayName}.`)
          setReversePairing(null)
        } else {
          setReversePairing({ ...res.data, remoteBaseUrl: targetUrl, deviceName })
          setSecondsLeft(res.data.expiresIn || 900)
          setInitiateError(null)
        }
      } catch (err) {
        if (!mountedRef.current || pairingRequestRef.current !== request) return
        setInitiateError(err instanceof Error ? err.message : "Connection error.")
        setReversePairing(null)
      } finally {
        if (mountedRef.current && pairingRequestRef.current === request) {
          isInitiatingRef.current = false
          setIsInitiating(false)
        }
      }
    },
    [
      enabled,
      configReady,
      cloudConfigStatus,
      connected,
      remoteBaseUrl,
      deviceName,
      pairingConfigDirty,
      busyAction,
    ],
  )

  useEffect(() => {
    if (!enabled || connected) return

    const handleOnline = () => {
      if (isOfflineError(initiateError)) {
        isInitiatingRef.current = false
        void startReversePairing(getEffectiveRemoteUrl(remoteBaseUrl))
      }
    }

    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [enabled, connected, initiateError, startReversePairing, remoteBaseUrl])

  useEffect(() => {
    if (
      !enabled ||
      !reversePairing ||
      pairingConfigDirty ||
      connected ||
      cloudConfigStatus !== "ready"
    ) {
      return
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          void startReversePairing()
          return 900
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [
    enabled,
    reversePairing,
    pairingConfigDirty,
    connected,
    cloudConfigStatus,
    startReversePairing,
  ])

  useEffect(() => {
    if (
      !enabled ||
      !reversePairing ||
      pairingConfigDirty ||
      connected ||
      cloudConfigStatus !== "ready"
    ) {
      return
    }
    const pollIntervalMs = (reversePairing.interval || 3) * 1000
    let isCancelled = false

    const poll = async () => {
      if (isCancelled || connected) return
      try {
        const res = await window.electronAPI.sync.pollDeviceAuthorization({
          remoteBaseUrl: reversePairing.remoteBaseUrl,
          deviceCode: reversePairing.deviceCode,
          deviceName: reversePairing.deviceName,
        })
        if (isCancelled) return

        if (res.status === "approved" && res.config) {
          const current = await loadConfig()
          if (mountedRef.current && current?.connected) {
            setReversePairing(null)
            onSuccess?.(res.message || "Device connected.")
            onConnected?.()
          }
        } else if (res.status === "expired") {
          void startReversePairing()
        } else if (res.status === "denied") {
          setInitiateError("Device pairing was denied by the administrator.")
          setReversePairing(null)
        }
      } catch {
        // Silent retry on transient network error
      }
    }

    const timer = setInterval(() => {
      void poll()
    }, pollIntervalMs)

    return () => {
      isCancelled = true
      clearInterval(timer)
    }
  }, [
    enabled,
    reversePairing,
    pairingConfigDirty,
    connected,
    cloudConfigStatus,
    loadConfig,
    startReversePairing,
    onSuccess,
    onConnected,
  ])

  useEffect(() => {
    if (
      enabled &&
      configReady &&
      !pairingConfigDirty &&
      busyAction === null &&
      cloudConfigStatus === "ready" &&
      !connected &&
      !reversePairing &&
      !isInitiating &&
      !isInitiatingRef.current &&
      !initiateError
    ) {
      void startReversePairing()
    }
  }, [
    enabled,
    configReady,
    pairingConfigDirty,
    busyAction,
    cloudConfigStatus,
    connected,
    reversePairing,
    isInitiating,
    initiateError,
    startReversePairing,
  ])

  const handlePair = useCallback(async () => {
    onError?.(null)
    onSuccess?.("")
    setBusyAction("pairing")
    try {
      const result = await window.electronAPI.sync.pairDevice({
        remoteBaseUrl: getEffectiveRemoteUrl(remoteBaseUrl),
        pairingCode,
        deviceName,
      })

      if (!result.success || !result.config) {
        throw new Error(result.error || "Connection failed.")
      }

      await loadConfig()
      if (!mountedRef.current) return
      setPairingCode("")
      if (result.initialSyncSucceeded === false) {
        onError?.(result.message || "Device connected, but initial sync failed.")
      } else {
        onSuccess?.(result.message || "Device connected.")
      }
      onConnected?.()
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Could not connect this desktop.")
    } finally {
      setBusyAction(null)
    }
  }, [
    remoteBaseUrl,
    pairingCode,
    deviceName,
    loadConfig,
    setBusyAction,
    onError,
    onSuccess,
    onConnected,
  ])

  return {
    reversePairing,
    isInitiating,
    isInitiatingRef,
    initiateError,
    secondsLeft,
    pairingCode,
    setPairingCode,
    mountedRef,
    loadConfig,
    startReversePairing,
    handlePair,
    resetPairingState,
  }
}
