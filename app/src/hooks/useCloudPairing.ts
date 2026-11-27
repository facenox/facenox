import { useCallback, useEffect, useRef, useState } from 'react'
import { refreshCloudSyncConfig, type CloudConfigStatus } from '@/services/cloudSyncState'
import { isOfflineError } from '@/components/settings/sections/syncErrorUtils'
import { DEFAULT_REMOTE_BASE_URL, OFFICIAL_REMOTE_BASE_URL, isOfficialCloudUrl } from '@/services/syncDefaults'

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
  const clean = (url || '').trim()
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
  busyAction: 'saving' | 'pairing' | 'disconnecting' | 'syncing' | null
  setBusyAction: (action: 'saving' | 'pairing' | 'disconnecting' | 'syncing' | null) => void
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
  deviceName = '',
  connected,
  cloudConfigStatus,
  busyAction,
  setBusyAction,
  onSuccess,
  onError,
  onConnected
}: UseCloudPairingOptions) {
  const [reversePairing, setReversePairing] = useState<ReversePairingData | null>(null)
  const [isInitiating, setIsInitiating] = useState(false)
  const [initiateError, setInitiateError] = useState<string | null>(null)
  const [retryCooldownSeconds, setRetryCooldownSeconds] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState<number>(900)
  const [pairingCode, setPairingCode] = useState('')

  const isInitiatingRef = useRef(false)
  const pairingRequestRef = useRef(0)
  const mountedRef = useRef(false)
  const isPollingRef = useRef(false)
  const manualPairingInFlightRef = useRef(false)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const onConnectedRef = useRef(onConnected)

  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
    onConnectedRef.current = onConnected
  }, [onSuccess, onError, onConnected])

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
    setRetryCooldownSeconds(0)
  }, [remoteBaseUrl, deviceName])

  useEffect(() => {
    if (retryCooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setRetryCooldownSeconds((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [retryCooldownSeconds])

  useEffect(() => {
    if (cloudConfigStatus !== 'ready' || connected || !enabled) {
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
    setPairingCode('')
    setReversePairing(null)
    setInitiateError(null)
    setRetryCooldownSeconds(0)
  }, [])

  const startReversePairing = useCallback(
    async (overrideBaseUrl?: string, options?: { forceNew?: boolean }) => {
      if (
        !enabled ||
        !configReady ||
        pairingConfigDirty ||
        busyAction !== null ||
        cloudConfigStatus !== 'ready' ||
        connected ||
        isInitiatingRef.current
      ) {
        return
      }
      const request = ++pairingRequestRef.current
      isInitiatingRef.current = true
      setIsInitiating(true)
      setInitiateError(null)
      const targetUrl = getEffectiveRemoteUrl(overrideBaseUrl !== undefined ? overrideBaseUrl : remoteBaseUrl)
      const isTargetCustom = !isOfficialCloudUrl(targetUrl)
      const targetDisplayName = isTargetCustom ? 'Custom server' : 'Facenox Cloud'

      try {
        const requestPayload: { remoteBaseUrl: string; deviceName: string; forceNew?: boolean } = {
          remoteBaseUrl: targetUrl,
          deviceName
        }
        if (options?.forceNew) {
          requestPayload.forceNew = true
        }
        const res = await window.electronAPI.sync.initiateReversePairing(requestPayload)
        if (!mountedRef.current || pairingRequestRef.current !== request) return
        if (!res.success || !res.data) {
          setInitiateError(res.error || `Could not connect to ${targetDisplayName}.`)
          setRetryCooldownSeconds(
            typeof res.retryAfterSeconds === 'number' && res.retryAfterSeconds > 0 ?
              Math.ceil(res.retryAfterSeconds)
            : 0
          )
          setReversePairing(null)
        } else {
          setReversePairing({ ...res.data, remoteBaseUrl: targetUrl, deviceName })
          setSecondsLeft(res.data.expiresIn || 900)
          setInitiateError(null)
          setRetryCooldownSeconds(0)
        }
      } catch (err) {
        if (!mountedRef.current || pairingRequestRef.current !== request) return
        setInitiateError(err instanceof Error ? err.message : 'Connection error.')
        setRetryCooldownSeconds(0)
        setReversePairing(null)
      } finally {
        if (mountedRef.current && pairingRequestRef.current === request) {
          isInitiatingRef.current = false
          setIsInitiating(false)
        }
      }
    },
    [enabled, configReady, cloudConfigStatus, connected, remoteBaseUrl, deviceName, pairingConfigDirty, busyAction]
  )

  useEffect(() => {
    if (!enabled || connected) return

    const handleOnline = () => {
      if (isOfflineError(initiateError)) {
        isInitiatingRef.current = false
        void startReversePairing(getEffectiveRemoteUrl(remoteBaseUrl))
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [enabled, connected, initiateError, startReversePairing, remoteBaseUrl])

  useEffect(() => {
    if (!enabled || !reversePairing || pairingConfigDirty || connected || cloudConfigStatus !== 'ready') {
      return
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [enabled, reversePairing, pairingConfigDirty, connected, cloudConfigStatus])

  useEffect(() => {
    if (
      secondsLeft === 0 &&
      enabled &&
      reversePairing &&
      !pairingConfigDirty &&
      !connected &&
      cloudConfigStatus === 'ready'
    ) {
      void startReversePairing(undefined, { forceNew: true })
    }
  }, [secondsLeft, enabled, reversePairing, pairingConfigDirty, connected, cloudConfigStatus, startReversePairing])

  useEffect(() => {
    if (!enabled || !reversePairing || pairingConfigDirty || connected || cloudConfigStatus !== 'ready') {
      return
    }
    const baseIntervalMs = (reversePairing.interval || 3) * 1000
    let currentIntervalMs = baseIntervalMs
    let isCancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const scheduleNext = (delayMs: number) => {
      if (isCancelled) return
      timer = setTimeout(() => {
        void poll()
      }, delayMs)
    }

    const poll = async () => {
      if (isCancelled || isPollingRef.current || manualPairingInFlightRef.current) {
        scheduleNext(currentIntervalMs)
        return
      }
      isPollingRef.current = true
      let nextDelayMs = currentIntervalMs
      try {
        const res = await window.electronAPI.sync.pollDeviceAuthorization({
          remoteBaseUrl: reversePairing.remoteBaseUrl,
          deviceCode: reversePairing.deviceCode,
          deviceName: reversePairing.deviceName
        })

        // Handle approval even if sync:data-changed flipped `connected` while initial sync ran.
        if (res.status === 'approved' && res.config) {
          const current = await loadConfig()
          if (mountedRef.current && current?.connected) {
            setReversePairing(null)
            if (res.initialSyncSucceeded === false) {
              onErrorRef.current?.(res.message || 'Device connected, but the initial sync failed.')
            } else {
              onSuccessRef.current?.(res.message || 'Device connected.')
            }
            onConnectedRef.current?.()
          }
          return
        }

        if (isCancelled) return

        if (res.status === 'expired' || res.status === 'claimed') {
          void startReversePairing(undefined, { forceNew: true })
          return
        }
        if (res.status === 'denied') {
          setInitiateError('Device pairing was denied by the administrator.')
          setReversePairing(null)
          return
        }
        if (res.status === 'error') {
          setInitiateError(res.error || 'Could not verify device authorization.')
          setReversePairing(null)
          return
        }
        if (res.slowDown) {
          currentIntervalMs = Math.min(15_000, currentIntervalMs + 3_000)
          const retryMs = res.retryAfterSeconds ? res.retryAfterSeconds * 1000 : 0
          nextDelayMs = Math.min(60_000, Math.max(currentIntervalMs, retryMs))
        } else if (currentIntervalMs > baseIntervalMs) {
          currentIntervalMs = Math.max(baseIntervalMs, currentIntervalMs - 2_000)
          nextDelayMs = currentIntervalMs
        }
      } catch {
        // Silent retry on transient network error
      } finally {
        isPollingRef.current = false
      }
      scheduleNext(nextDelayMs)
    }

    scheduleNext(currentIntervalMs)

    return () => {
      isCancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, reversePairing, pairingConfigDirty, connected, cloudConfigStatus, loadConfig, startReversePairing])

  useEffect(() => {
    if (
      enabled &&
      configReady &&
      !pairingConfigDirty &&
      busyAction === null &&
      cloudConfigStatus === 'ready' &&
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
    startReversePairing
  ])

  const handlePair = useCallback(async () => {
    if (manualPairingInFlightRef.current) return
    manualPairingInFlightRef.current = true
    onErrorRef.current?.(null)
    onSuccessRef.current?.('')
    setBusyAction('pairing')
    try {
      const result = await window.electronAPI.sync.pairDevice({
        remoteBaseUrl: getEffectiveRemoteUrl(remoteBaseUrl),
        pairingCode,
        deviceName
      })

      if (!result.success || !result.config) {
        throw new Error(result.error || 'Connection failed.')
      }

      await loadConfig()
      if (!mountedRef.current) return
      setPairingCode('')
      if (result.initialSyncSucceeded === false) {
        onErrorRef.current?.(result.message || 'Device connected, but initial sync failed.')
      } else {
        onSuccessRef.current?.(result.message || 'Device connected.')
      }
      onConnectedRef.current?.()
    } catch (error) {
      onErrorRef.current?.(error instanceof Error ? error.message : 'Could not connect this desktop.')
    } finally {
      manualPairingInFlightRef.current = false
      setBusyAction(null)
    }
  }, [remoteBaseUrl, pairingCode, deviceName, loadConfig, setBusyAction])

  return {
    reversePairing,
    isInitiating,
    isInitiatingRef,
    initiateError,
    retryCooldownSeconds,
    secondsLeft,
    pairingCode,
    setPairingCode,
    mountedRef,
    loadConfig,
    startReversePairing,
    handlePair,
    resetPairingState
  }
}
