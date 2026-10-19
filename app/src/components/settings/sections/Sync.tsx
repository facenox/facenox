import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

import { useUIStore } from "@/components/main/stores"
import { Modal, QRCodeView, Spinner } from "@/components/common"
import { Tooltip } from "@/components/shared"
import {
  DEFAULT_REMOTE_BASE_URL,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  OFFICIAL_REMOTE_BASE_URL,
  isOfficialCloudUrl,
} from "../../../services/syncDefaults"
import { formatErrorMessage, isOfflineError, parseSyncError } from "./syncErrorUtils.js"

export type RemoteSyncConfig = {
  enabled: boolean
  remoteBaseUrl: string
  organizationId: string
  organizationName: string
  siteId: string
  siteName: string
  deviceId: string
  deviceName: string
  intervalMinutes: number
  lastSyncedAt: string | null
  lastSyncStatus: "idle" | "success" | "error"
  lastSyncMessage: string | null
  connected: boolean
  unsyncedRecordsCount?: number
  unsyncedSessionsCount?: number
}

const defaultConfig: RemoteSyncConfig = {
  enabled: true,
  remoteBaseUrl: DEFAULT_REMOTE_BASE_URL,
  organizationId: "",
  organizationName: "",
  siteId: "",
  siteName: "",
  deviceId: "",
  deviceName: "Facenox Desktop",
  intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  lastSyncedAt: null,
  lastSyncStatus: "idle",
  lastSyncMessage: null,
  connected: false,
  unsyncedRecordsCount: 0,
  unsyncedSessionsCount: 0,
}

function getEffectiveRemoteUrl(url?: string): string {
  const clean = (url || "").trim()
  return !clean || isOfficialCloudUrl(clean) ? OFFICIAL_REMOTE_BASE_URL : clean
}

interface SyncProps {
  onNavigateToDB?: () => void
  onStatusChange?: (config: RemoteSyncConfig | null) => void
}

interface ReversePairingData {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

export function Sync({ onNavigateToDB, onStatusChange }: SyncProps = {}) {
  const setSuccess = useUIStore((state) => state.setSuccess)
  const setError = useUIStore((state) => state.setError)
  const [config, setConfig] = useState<RemoteSyncConfig>(defaultConfig)
  const [remoteBaseUrl, setRemoteBaseUrl] = useState("")
  const [deviceName, setDeviceName] = useState("")
  const [pairingCode, setPairingCode] = useState("")
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_SYNC_INTERVAL_MINUTES)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const [showManualInput, setShowManualInput] = useState(
    typeof process !== "undefined" && process.env?.NODE_ENV === "test",
  )
  const [busyAction, setBusyAction] = useState<
    "saving" | "pairing" | "disconnecting" | "syncing" | null
  >(null)
  const [isDevMode, setIsDevMode] = useState(false)
  const [devModeClicks, setDevModeClicks] = useState(0)

  // Auto-reveal developer mode if a custom URL is already configured
  useEffect(() => {
    if (remoteBaseUrl && !isOfficialCloudUrl(remoteBaseUrl)) {
      setIsDevMode(true)
    }
  }, [remoteBaseUrl])

  // Keyboard shortcut: Ctrl+Shift+D or Cmd+Shift+D to toggle endpoint override
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault()
        setIsDevMode((prev) => {
          const next = !prev
          if (next) setShowAdvanced(true)
          setSuccess(next ? "Custom endpoint unlocked." : "Custom endpoint hidden.")
          return next
        })
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [setSuccess])

  const handleTitleClick = () => {
    const nextClicks = devModeClicks + 1
    if (nextClicks >= 5) {
      setDevModeClicks(0)
      setIsDevMode(true)
      setShowAdvanced(true)
      setSuccess("Custom endpoint unlocked.")
    } else {
      setDevModeClicks(nextClicks)
    }
  }

  // Reverse pairing state
  const [reversePairing, setReversePairing] = useState<ReversePairingData | null>(null)
  const [isInitiating, setIsInitiating] = useState(false)
  const isInitiatingRef = useRef(false)
  const [initiateError, setInitiateError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number>(900)

  const syncFromConfig = useCallback(
    (nextConfig: RemoteSyncConfig) => {
      const nextRemoteBaseUrl = nextConfig.remoteBaseUrl || DEFAULT_REMOTE_BASE_URL

      setConfig(nextConfig)
      setRemoteBaseUrl(isOfficialCloudUrl(nextRemoteBaseUrl) ? "" : nextRemoteBaseUrl)
      setDeviceName(nextConfig.deviceName === "Facenox Desktop" ? "" : nextConfig.deviceName || "")
      setIntervalMinutes(nextConfig.intervalMinutes || DEFAULT_SYNC_INTERVAL_MINUTES)

      if (onStatusChange) {
        onStatusChange(nextConfig)
      }
    },
    [onStatusChange],
  )

  const loadConfig = useCallback(async () => {
    const nextConfig = await window.electronAPI.sync.getConfig()
    syncFromConfig(nextConfig)
  }, [syncFromConfig])

  const startReversePairing = useCallback(
    async (overrideBaseUrl?: string) => {
      if (config.connected) return
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
        if (!res.success || !res.data) {
          setInitiateError(res.error || `Could not connect to ${targetDisplayName}.`)
          setReversePairing(null)
        } else {
          setReversePairing(res.data)
          setSecondsLeft(res.data.expiresIn || 900)
          setInitiateError(null)
        }
      } catch (err) {
        setInitiateError(err instanceof Error ? err.message : "Connection error.")
        setReversePairing(null)
      } finally {
        isInitiatingRef.current = false
        setIsInitiating(false)
      }
    },
    [config.connected, remoteBaseUrl, deviceName],
  )

  // Auto-reconnect when device comes back online
  useEffect(() => {
    if (config.connected) return

    const handleOnline = () => {
      if (isOfflineError(initiateError)) {
        isInitiatingRef.current = false
        void startReversePairing(getEffectiveRemoteUrl(remoteBaseUrl))
      }
    }

    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [config.connected, initiateError, startReversePairing, remoteBaseUrl])

  // Countdown timer for reverse pairing expiry
  useEffect(() => {
    if (!reversePairing || config.connected) return
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
  }, [reversePairing, config.connected, startReversePairing])

  // Polling loop for authorization
  useEffect(() => {
    if (!reversePairing || config.connected) return
    const pollIntervalMs = (reversePairing.interval || 3) * 1000
    let isCancelled = false

    const poll = async () => {
      if (isCancelled || config.connected) return
      try {
        const res = await window.electronAPI.sync.pollDeviceAuthorization({
          remoteBaseUrl: getEffectiveRemoteUrl(remoteBaseUrl),
          deviceCode: reversePairing.deviceCode,
          deviceName,
        })

        if (isCancelled) return

        if (res.status === "approved" && res.config) {
          syncFromConfig(res.config)
          setReversePairing(null)
          setSuccess(res.message || "Device connected.")
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
    reversePairing,
    config.connected,
    remoteBaseUrl,
    deviceName,
    syncFromConfig,
    startReversePairing,
    setSuccess,
  ])

  // Auto-initiate reverse pairing if not connected
  useEffect(() => {
    if (
      !config.connected &&
      !reversePairing &&
      !isInitiating &&
      !isInitiatingRef.current &&
      !initiateError
    ) {
      void startReversePairing()
    }
  }, [config.connected, reversePairing, isInitiating, initiateError, startReversePairing])

  useEffect(() => {
    void loadConfig()

    if (!window.electronAPI?.sync) return
    const unsubscribe = window.electronAPI.sync.onDataChanged(() => {
      void loadConfig()
    })
    return unsubscribe
  }, [loadConfig])

  const handleSave = async () => {
    setError(null)
    setSuccess(null)
    setBusyAction("saving")
    try {
      const nextConfig = await window.electronAPI.sync.updateConfig({
        remoteBaseUrl: remoteBaseUrl.trim(),
        deviceName,
        intervalMinutes,
        enabled: config.connected,
      })
      syncFromConfig(nextConfig)
      if (!nextConfig.connected) {
        setReversePairing(null)
        setInitiateError(null)
        void startReversePairing(getEffectiveRemoteUrl(remoteBaseUrl))
      }
      setSuccess("Cloud sync settings saved.")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save cloud sync settings.")
    } finally {
      setBusyAction(null)
    }
  }

  const handlePair = async () => {
    setError(null)
    setSuccess(null)
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

      syncFromConfig(result.config)
      setPairingCode("")
      if (result.initialSyncSucceeded === false) {
        setError(result.message || "Device connected, but initial sync failed.")
      } else {
        setSuccess(result.message || "Device connected.")
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not connect this desktop.")
    } finally {
      setBusyAction(null)
    }
  }

  const handleDisconnect = async () => {
    setError(null)
    setSuccess(null)
    setBusyAction("disconnecting")
    try {
      const result = await window.electronAPI.sync.disconnectDevice()
      syncFromConfig(result.config)
      setPairingCode("")
      setReversePairing(null)
      if (result.warning) {
        setError(`Disconnected locally, but the cloud returned a warning: ${result.warning}`)
      } else {
        setSuccess("Device disconnected from Facenox Cloud.")
      }
      void startReversePairing()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not disconnect this device.")
    } finally {
      setBusyAction(null)
    }
  }

  const handleManualSync = async () => {
    setError(null)
    setSuccess(null)
    setBusyAction("syncing")
    try {
      const result = await window.electronAPI.sync.triggerNow()
      await loadConfig()
      if (result.success) {
        setSuccess("Sync completed.")
      } else {
        const parsed = parseSyncError(result.message)
        setError(parsed.description || "Manual sync failed.")
      }
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : "Manual sync failed."
      const parsed = parseSyncError(rawMsg)
      setError(parsed.description || "Manual sync failed.")
    } finally {
      setBusyAction(null)
    }
  }

  const effectiveUrl = getEffectiveRemoteUrl(remoteBaseUrl || config.remoteBaseUrl)
  const isCustomServer = !isOfficialCloudUrl(effectiveUrl)
  const serverDisplayName = isCustomServer ? "Custom server" : "Facenox Cloud"
  const isLocalhost = Boolean(
    remoteBaseUrl &&
    /^(https?:\/\/)?(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)(:\d+)?/i.test(remoteBaseUrl.trim()),
  )

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10">
      <motion.div
        layout
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden">
        {/* Elevated Header Row with Connect/Connected Device Details and Actions */}
        <div className="flex items-start justify-between gap-8 border-b border-white/5 pt-6 pb-4">
          <div className="max-w-xl min-w-0 flex-1">
            <h3
              onClick={handleTitleClick}
              className="cursor-default text-sm font-medium text-white/90 select-none">
              {!config.connected ?
                `Connect to ${serverDisplayName}`
              : `Connected to ${serverDisplayName}`}
            </h3>
            <p className="mt-0.5 text-xs text-white/60">
              {!config.connected ?
                <>
                  Connect via QR code or authorize in any browser.{" "}
                  <button
                    type="button"
                    onClick={() => setShowPrivacyModal(true)}
                    className="inline font-medium text-white/45 transition-colors hover:text-white/80 hover:underline">
                    Learn more
                  </button>
                </>
              : <>
                  Attendance records sync automatically.{" "}
                  <button
                    type="button"
                    onClick={() => setShowPrivacyModal(true)}
                    className="inline font-medium text-white/45 transition-colors hover:text-white/80 hover:underline">
                    Privacy & boundaries
                  </button>
                </>
              }
            </p>
          </div>
          <div className="mt-0.5 flex shrink-0 items-center">
            <button
              onClick={() => setShowAdvanced((value) => !value)}
              className="group flex items-center gap-1.5 text-xs font-semibold text-white/45 transition hover:text-white/70">
              <span>{showAdvanced ? "Hide advanced" : "Advanced settings"}</span>
              <i
                className={`fa-solid ${showAdvanced ? "fa-chevron-up" : "fa-chevron-down"} text-[9px]`}
              />
            </button>
          </div>
        </div>

        <motion.div
          layout
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="py-2">
          {/* Connection Actions Row */}
          <motion.div
            layout
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-4 py-4">
            {!config.connected ?
              <motion.div
                layout
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-6 pt-1">
                <AnimatePresence mode="wait">
                  {isInitiating && !reversePairing ?
                    <motion.div
                      key="initiating"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="flex min-h-[290px] flex-col items-center justify-center gap-3 text-center">
                      <Spinner size="md" color="cyan" />
                      <p className="text-xs font-medium text-white/70">
                        Connecting to {serverDisplayName}...
                      </p>
                      <p className="text-[11px] text-white/40">Generating secure pairing code</p>
                    </motion.div>
                  : initiateError ?
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="flex min-h-[290px] flex-col items-center justify-center gap-3 py-6 text-center">
                      {isOfflineError(initiateError) ?
                        <>
                          <div className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50">
                            <i className="fa-solid fa-wifi text-sm text-white/40" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-white/90">Device is offline</p>
                            <p className="max-w-xs text-[11px] leading-relaxed text-white/50">
                              Connect to the internet to link this device with Facenox Cloud.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              isInitiatingRef.current = false
                              void startReversePairing(getEffectiveRemoteUrl(remoteBaseUrl))
                            }}
                            className="mt-1 flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white transition hover:bg-white/10">
                            <i className="fa-solid fa-arrows-rotate text-[10px]" />
                            Check connection
                          </button>
                        </>
                      : <>
                          <div className="flex size-9 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                            <i className="fa-solid fa-circle-exclamation text-sm" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-white/90">
                              Could not initialize cloud pairing
                            </p>
                            <p className="max-w-md text-[11px] break-words text-white/50">
                              {formatErrorMessage(initiateError)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              isInitiatingRef.current = false
                              void startReversePairing(getEffectiveRemoteUrl(remoteBaseUrl))
                            }}
                            className="mt-1 flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white transition hover:bg-white/10">
                            <i className="fa-solid fa-arrows-rotate text-[10px]" />
                            Retry connection
                          </button>
                        </>
                      }
                    </motion.div>
                  : reversePairing ?
                    <motion.div
                      key="reverse-pairing-ready"
                      initial={{ opacity: 0, y: 12, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.96 }}
                      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                      className="flex min-h-[290px] flex-col items-center justify-center py-4 text-center">
                      {/* Centered QR Code with gentle hover */}
                      <div className="group relative transition-transform duration-200 hover:scale-[1.02]">
                        <QRCodeView value={reversePairing.verificationUriComplete} size={156} />
                      </div>

                      {/* Centered Instructions, PIN Capsule & Status with staggered appearance */}
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-5 max-w-sm space-y-3">
                        <p className="text-xs leading-relaxed text-white/70">
                          Connect via QR code, or visit{" "}
                          <a
                            href={
                              reversePairing.verificationUriComplete ||
                              reversePairing.verificationUri
                            }
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-cyan-400 underline-offset-4 transition hover:text-cyan-300 hover:underline">
                            <span>
                              {reversePairing.verificationUri.replace(/^https?:\/\//, "")}
                            </span>
                            <i className="fa-solid fa-arrow-up-right-from-square text-[9px]" />
                          </a>{" "}
                          and enter:
                        </p>

                        {/* Single seamless PIN capsule */}
                        <div className="flex items-center justify-center gap-2">
                          <div className="inline-flex items-center gap-3 rounded-lg bg-white/[0.04] px-4 py-2 font-mono text-2xl font-bold tracking-[0.25em] text-white select-all">
                            <span>{reversePairing.userCode.slice(0, 3)}</span>
                            <span>{reversePairing.userCode.slice(3, 6)}</span>
                          </div>
                          <Tooltip
                            content={copiedPin ? "Copied to clipboard" : "Copy code"}
                            position="top">
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(reversePairing.userCode)
                                setCopiedPin(true)
                                setTimeout(() => setCopiedPin(false), 2000)
                              }}
                              className="flex size-8 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/5 hover:text-white">
                              <i
                                className={`fa-solid ${copiedPin ? "fa-check text-emerald-400" : "fa-copy"} text-xs`}
                              />
                            </button>
                          </Tooltip>
                          <Tooltip content="Refresh code" position="top">
                            <button
                              type="button"
                              onClick={() => void startReversePairing()}
                              disabled={isInitiating}
                              className="flex size-8 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/5 hover:text-white/70 disabled:opacity-40">
                              <i
                                className={`fa-solid fa-arrows-rotate text-xs ${isInitiating ? "fa-spin text-cyan-400" : ""}`}
                              />
                            </button>
                          </Tooltip>
                        </div>

                        {/* Live waiting indicator */}
                        <div className="flex items-center justify-center gap-2 text-xs text-white/40">
                          <span>Waiting for authorization</span>
                          <span className="font-mono text-white/30">
                            ({Math.floor(secondsLeft / 60)}:
                            {(secondsLeft % 60).toString().padStart(2, "0")})
                          </span>
                        </div>
                      </motion.div>
                    </motion.div>
                  : null}
                </AnimatePresence>

                {/* Subtle Collapsible Manual Fallback */}
                <motion.div
                  layout
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="flex justify-center pt-2">
                  <AnimatePresence mode="wait" initial={false}>
                    {!showManualInput ?
                      <motion.button
                        key="toggle-btn"
                        type="button"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        onClick={() => setShowManualInput(true)}
                        className="cursor-pointer text-[11px] text-white/30 transition-colors hover:text-white/60">
                        Have a pairing code from the web dashboard? Enter it here &rarr;
                      </motion.button>
                    : <motion.div
                        key="manual-input"
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="flex max-w-sm items-center gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="ABCD2345"
                          value={pairingCode}
                          onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                          className="h-8 flex-1 rounded border border-white/10 bg-transparent px-3 font-mono text-xs font-semibold tracking-widest text-white uppercase outline-none focus:border-white/20"
                          autoFocus
                        />
                        <button
                          onClick={handlePair}
                          disabled={busyAction !== null || !pairingCode}
                          className="flex h-8 items-center gap-2 rounded border border-white/10 bg-white/5 px-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-40">
                          {busyAction === "pairing" && <Spinner size="xs" color="white" />}
                          Connect
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowManualInput(false)
                            setPairingCode("")
                          }}
                          className="cursor-pointer px-1 text-xs text-white/30 transition hover:text-white/60">
                          Cancel
                        </button>
                      </motion.div>
                    }
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            : <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5 text-xs">
                  {config.lastSyncStatus === "error" ?
                    (() => {
                      const errInfo = parseSyncError(config.lastSyncMessage)
                      const isOfficial = isOfficialCloudUrl(config.remoteBaseUrl)

                      if (errInfo.isPlanQuota) {
                        return (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 font-medium text-amber-400">
                              <span>
                                Plan limit reached ({errInfo.currentPeople ?? 0} /{" "}
                                {errInfo.peopleLimit ?? 0} members)
                              </span>
                              {isOfficial && (
                                <a
                                  href={`${getEffectiveRemoteUrl(config.remoteBaseUrl)}${errInfo.actionUrl || "/pricing"}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-amber-300 underline underline-offset-2 transition hover:text-amber-200">
                                  Upgrade plan to resume ↗
                                </a>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                              {config.unsyncedRecordsCount !== undefined &&
                                config.unsyncedRecordsCount > 0 && (
                                  <span>{config.unsyncedRecordsCount} record(s) queued</span>
                                )}
                              <span>
                                {config.lastSyncedAt ?
                                  `Last synced ${new Date(config.lastSyncedAt).toLocaleString()}`
                                : "No successful sync yet"}
                              </span>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div className="space-y-1">
                          <div className="font-medium text-amber-400/90">
                            <span>
                              {errInfo.title}: {errInfo.description}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                            {config.unsyncedRecordsCount !== undefined &&
                              config.unsyncedRecordsCount > 0 && (
                                <span>{config.unsyncedRecordsCount} record(s) queued</span>
                              )}
                            <span>
                              {config.lastSyncedAt ?
                                `Last synced ${new Date(config.lastSyncedAt).toLocaleString()}`
                              : "No successful sync yet"}
                            </span>
                          </div>
                        </div>
                      )
                    })()
                  : <div className="space-y-1">
                      {(
                        config.unsyncedRecordsCount !== undefined && config.unsyncedRecordsCount > 0
                      ) ?
                        <div className="flex items-center gap-1.5 font-medium text-sky-400">
                          <i className="fa-solid fa-cloud-arrow-up text-[10px]" />
                          <span>{config.unsyncedRecordsCount} record(s) queued for upload</span>
                        </div>
                      : <div className="flex items-center gap-1.5 font-medium text-emerald-400">
                          <i className="fa-solid fa-check text-[10px]" />
                          <span>All records synchronized</span>
                        </div>
                      }
                      <div className="text-[11px] text-white/40">
                        {config.lastSyncedAt ?
                          `Last synced ${new Date(config.lastSyncedAt).toLocaleString()}`
                        : "Ready to sync"}
                      </div>
                    </div>
                  }
                </div>

                <div className="flex shrink-0 items-center gap-2 pt-0.5">
                  <button
                    onClick={handleManualSync}
                    disabled={busyAction !== null}
                    className="flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "syncing" ?
                      <Spinner size="xs" color="white" />
                    : <i className="fa-solid fa-arrows-rotate text-[10px]" />}
                    Sync now
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={busyAction !== null}
                    className="flex items-center gap-1.5 rounded border border-white/10 bg-transparent px-3 py-1.5 text-xs font-medium text-white/50 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "disconnecting" && <Spinner size="xs" color="white" />}
                    Disconnect
                  </button>
                </div>
              </div>
            }
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden">
              <motion.div
                layout
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="mt-4 grid gap-4 border-t border-white/5 pt-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold tracking-widest text-white/45 uppercase">
                    Device ID
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={
                        config.connected && config.deviceId ? config.deviceId : "Not paired yet"
                      }
                      className={`h-8.5 w-full rounded border border-white/10 bg-white/[0.02] px-3 font-mono text-[11px] outline-none select-all ${
                        config.connected && config.deviceId ?
                          "text-white/60"
                        : "text-white/25 italic"
                      }`}
                    />
                    <button
                      type="button"
                      disabled={!config.connected || !config.deviceId}
                      onClick={() => {
                        if (!config.deviceId) return
                        void navigator.clipboard.writeText(config.deviceId)
                        setCopiedId(true)
                        setTimeout(() => setCopiedId(false), 2000)
                      }}
                      title={
                        !config.connected || !config.deviceId ?
                          "Device is not paired to Facenox Cloud"
                        : "Copy Device ID"
                      }
                      className="flex h-8.5 shrink-0 items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-3 text-[11px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 hover:disabled:bg-white/[0.04] hover:disabled:text-white/70">
                      <i
                        className={`fa-solid ${copiedId ? "fa-check text-emerald-400" : "fa-copy"}`}
                      />
                      {copiedId ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <AnimatePresence initial={false}>
                    {isDevMode && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-1.5 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-extrabold tracking-widest text-white/45 uppercase">
                            Custom endpoint
                          </label>
                          {remoteBaseUrl &&
                            !isOfficialCloudUrl(remoteBaseUrl) &&
                            !config.connected && (
                              <button
                                type="button"
                                onClick={() => setRemoteBaseUrl("")}
                                className="cursor-pointer text-[9px] font-bold tracking-wider text-cyan-400 transition-colors hover:text-cyan-300">
                                Reset
                              </button>
                            )}
                        </div>
                        <input
                          type="url"
                          placeholder="Leave empty for Facenox Cloud"
                          value={remoteBaseUrl}
                          disabled={config.connected}
                          onChange={(e) => setRemoteBaseUrl(e.target.value)}
                          className={`h-8.5 w-full rounded border bg-transparent px-3 text-[12px] text-white transition-all duration-200 outline-none focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                            isLocalhost ? "border-amber-400/50" : "border-white/10"
                          }`}
                        />
                        {isLocalhost && (
                          <p className="flex items-center gap-1.5 text-[10px] font-medium text-amber-400/90">
                            <i className="fa-solid fa-triangle-exclamation text-[9px]" />
                            Localhost cannot sync across devices. Leave empty for Facenox Cloud.
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold tracking-widest text-white/45 uppercase">
                      Device name override
                    </label>
                    <input
                      type="text"
                      placeholder="Facenox Desktop"
                      value={deviceName}
                      disabled={config.connected}
                      onChange={(e) => setDeviceName(e.target.value)}
                      className="h-8.5 w-full rounded border border-white/10 bg-transparent px-3 text-[12px] text-white transition-all duration-200 outline-none focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSave}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-white/70 transition-all hover:bg-white/[0.08] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "saving" && <Spinner size="xs" color="white" />}
                    Save configuration
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <DataBoundariesModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        onNavigateToDB={onNavigateToDB}
      />
    </div>
  )
}

interface DataBoundariesModalProps {
  isOpen: boolean
  onClose: () => void
  onNavigateToDB?: () => void
}

function DataBoundariesModal({ isOpen, onClose, onNavigateToDB }: DataBoundariesModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-[520px]"
      title="Data boundaries & privacy">
      <div className="space-y-5 pt-2">
        <p className="text-[12px] leading-relaxed text-white/65">
          Facenox separates data synced with Facenox Cloud from data stored strictly on this device:
        </p>

        <div className="space-y-5 text-xs">
          {/* Cloud Sync Section */}
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-white/90">Shared with Facenox Cloud</div>
            <p className="text-[11px] leading-relaxed text-white/50">
              Member names, roles, attendance logs, device diagnostics, and encrypted biometric face
              vectors (embeddings) are synchronized to Facenox Cloud for backup and reporting.
            </p>
          </div>

          {/* Local Processing Section */}
          <div className="space-y-2">
            <div className="text-[13px] font-semibold text-white/90">Stored locally only</div>
            <p className="text-[11px] leading-relaxed text-white/50">
              Raw camera frames are processed locally and are{" "}
              <strong>never persisted to disk or uploaded</strong>.
            </p>
            <p className="text-[11px] leading-relaxed text-white/50">
              Facenox Cloud stores and transfers biometric vectors strictly in AES-256-GCM encrypted
              form.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          <div>
            {onNavigateToDB && (
              <button
                onClick={() => {
                  onClose()
                  onNavigateToDB()
                }}
                className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 hover:underline">
                Manage data & storage →
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 hover:from-cyan-300 hover:to-cyan-400 active:scale-[0.97]">
            Understood
          </button>
        </div>
      </div>
    </Modal>
  )
}
