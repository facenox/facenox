import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

import { useUIStore } from "@/components/main/stores"
import { Modal, QRCodeView } from "@/components/common"
import {
  DEFAULT_REMOTE_BASE_URL,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  isOfficialCloudUrl,
} from "../../../services/syncDefaults"

type RemoteSyncConfig = {
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

function formatErrorMessage(err: string | null): string {
  if (!err) return ""
  if (err.includes("<!DOCTYPE") || err.includes("<html") || err.includes("<head")) {
    return "Server returned an unexpected HTML response. Please verify that your cloud server is running and reachable."
  }
  return err
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
      setShowAdvanced(!isOfficialCloudUrl(nextRemoteBaseUrl))

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
      if (config.connected || isInitiatingRef.current) return
      isInitiatingRef.current = true
      setIsInitiating(true)
      setInitiateError(null)
      const targetUrl =
        (overrideBaseUrl !== undefined ? overrideBaseUrl : remoteBaseUrl).trim() ||
        DEFAULT_REMOTE_BASE_URL
      try {
        const res = await window.electronAPI.sync.initiateReversePairing({
          remoteBaseUrl: targetUrl,
          deviceName,
        })
        if (!res.success || !res.data) {
          setInitiateError(res.error || "Could not connect to Facenox Cloud.")
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
          remoteBaseUrl: remoteBaseUrl.trim() || DEFAULT_REMOTE_BASE_URL,
          deviceCode: reversePairing.deviceCode,
          deviceName,
        })

        if (isCancelled) return

        if (res.status === "approved" && res.config) {
          syncFromConfig(res.config)
          setReversePairing(null)
          setSuccess(res.message || "Device connected to Facenox Cloud!")
        } else if (res.status === "expired") {
          void startReversePairing()
        } else if (res.status === "denied") {
          setInitiateError("Device pairing was denied by the cloud administrator.")
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
        void startReversePairing(nextConfig.remoteBaseUrl)
      }
      setSuccess(
        nextConfig.connected ?
          "Cloud sync settings saved. Auto-sync state updated."
        : "Cloud sync settings saved. You can connect this desktop whenever you're ready.",
      )
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
        remoteBaseUrl: remoteBaseUrl.trim() || DEFAULT_REMOTE_BASE_URL,
        pairingCode,
        deviceName,
      })

      if (!result.success || !result.config) {
        throw new Error(result.error || "Connection failed.")
      }

      syncFromConfig(result.config)
      setPairingCode("")
      if (result.initialSyncSucceeded === false) {
        setError(result.message || "Device connected.")
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
        setSuccess("Sync completed successfully.")
      } else {
        setError(result.message || "Manual sync failed.")
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Manual sync failed.")
    } finally {
      setBusyAction(null)
    }
  }

  const isCustomServer = !isOfficialCloudUrl(config.remoteBaseUrl)

  const syncTone =
    config.lastSyncStatus === "success" ? "text-white/60"
    : config.lastSyncStatus === "error" ? "text-red-400"
    : "text-white/45"

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10">
      <div className="overflow-hidden">
        {/* Elevated Header Row with Connect/Connected Device Details and Actions */}
        <div className="flex items-start justify-between gap-8 border-b border-white/5 pt-6 pb-4">
          <div className="max-w-xl min-w-0 flex-1">
            <h3 className="text-sm font-medium text-white/90">
              {!config.connected ?
                isCustomServer ?
                  "Connect to Custom Server"
                : "Connect to Facenox Cloud"
              : isCustomServer ?
                "Connected to Custom Server"
              : "Connected to Facenox Cloud"}
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
              <span>{showAdvanced ? "Hide Advanced" : "Advanced Settings"}</span>
              <i
                className={`fa-solid ${showAdvanced ? "fa-chevron-up" : "fa-chevron-down"} text-[9px]`}
              />
            </button>
          </div>
        </div>

        <div className="py-2">
          {/* Connection Actions Row */}
          <div className="flex flex-col gap-4 py-4">
            {!config.connected ?
              <div className="space-y-6 pt-1">
                <AnimatePresence mode="wait">
                  {isInitiating && !reversePairing ?
                    <motion.div
                      key="initiating"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="flex min-h-[290px] flex-col items-center justify-center gap-3 text-center">
                      <i className="fa-solid fa-spinner fa-spin text-xl text-cyan-400" />
                      <p className="text-xs font-medium text-white/70">
                        Connecting to Facenox Cloud...
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
                        onClick={() => void startReversePairing()}
                        className="mt-1 flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs text-white transition hover:bg-white/10">
                        <i className="fa-solid fa-arrows-rotate text-[10px]" />
                        Retry Connection
                      </button>
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
                          <span className="font-semibold text-cyan-400">
                            {reversePairing.verificationUri.replace(/^https?:\/\//, "")}
                          </span>{" "}
                          and enter:
                        </p>

                        {/* Single seamless PIN capsule */}
                        <div className="flex items-center justify-center gap-2">
                          <div className="inline-flex items-center gap-3 rounded-lg bg-white/[0.04] px-4 py-2 font-mono text-2xl font-bold tracking-[0.25em] text-white select-all">
                            <span>{reversePairing.userCode.slice(0, 3)}</span>
                            <span>{reversePairing.userCode.slice(3, 6)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(reversePairing.userCode)
                              setCopiedPin(true)
                              setTimeout(() => setCopiedPin(false), 2000)
                            }}
                            title={copiedPin ? "Copied to clipboard!" : "Copy Code"}
                            className="flex size-8 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/5 hover:text-white">
                            <i
                              className={`fa-solid ${copiedPin ? "fa-check text-emerald-400" : "fa-copy"} text-xs`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => void startReversePairing()}
                            disabled={isInitiating}
                            title="Refresh Code"
                            className="flex size-8 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/5 hover:text-white/70 disabled:opacity-40">
                            <i
                              className={`fa-solid fa-arrows-rotate text-xs ${isInitiating ? "fa-spin text-cyan-400" : ""}`}
                            />
                          </button>
                        </div>

                        {/* Live waiting indicator */}
                        <div className="flex items-center justify-center gap-1.5 text-xs text-white/40">
                          <span>Waiting for authorization</span>
                          <span className="text-white/20">·</span>
                          <span className="font-mono text-white/30">
                            {Math.floor(secondsLeft / 60)}:
                            {(secondsLeft % 60).toString().padStart(2, "0")}
                          </span>
                        </div>
                      </motion.div>
                    </motion.div>
                  : null}
                </AnimatePresence>

                {/* Subtle Collapsible Manual Fallback */}
                <div className="flex justify-center pt-2">
                  {!showManualInput ?
                    <button
                      type="button"
                      onClick={() => setShowManualInput(true)}
                      className="cursor-pointer text-[11px] text-white/30 transition-colors hover:text-white/60">
                      Have a pairing code from the web dashboard? Enter it here &rarr;
                    </button>
                  : <div className="flex max-w-sm items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="ABCD2345"
                        value={pairingCode}
                        onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                        className="h-8 flex-1 rounded border border-white/10 bg-transparent px-3 font-mono text-xs font-semibold tracking-widest text-white uppercase outline-none focus:border-white/20"
                      />
                      <button
                        onClick={handlePair}
                        disabled={busyAction !== null || !pairingCode}
                        className="h-8 rounded border border-white/10 bg-white/5 px-3 text-xs font-medium text-white transition hover:bg-white/10 disabled:opacity-40">
                        {busyAction === "pairing" ?
                          <i className="fa-solid fa-spinner fa-spin" />
                        : "Connect"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowManualInput(false)}
                        className="cursor-pointer px-1 text-xs text-white/30 transition hover:text-white/60">
                        Cancel
                      </button>
                    </div>
                  }
                </div>
              </div>
            : <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 text-xs">
                  {config.unsyncedRecordsCount !== undefined && config.unsyncedRecordsCount > 0 ?
                    <div className="flex items-center gap-2 font-semibold text-amber-400/90">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-[1px] bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-[1px] bg-amber-500"></span>
                      </span>
                      <span>{config.unsyncedRecordsCount} record(s) queued</span>
                    </div>
                  : config.lastSyncStatus === "error" ?
                    <div className="flex items-center gap-1.5 font-medium text-red-400">
                      <i className="fa-solid fa-circle-exclamation text-[11px]" />
                      <span>{config.lastSyncMessage || "Sync error"}</span>
                    </div>
                  : <div className="flex items-center gap-1.5 font-medium text-emerald-400">
                      <i className="fa-solid fa-check text-[11px]" />
                      <span>All synced</span>
                    </div>
                  }
                  <div className={`text-xs ${syncTone}`}>
                    {config.lastSyncedAt ?
                      `Last sync: ${new Date(config.lastSyncedAt).toLocaleString()}`
                    : "No successful sync yet."}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleManualSync}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 rounded border border-white/10 bg-transparent px-4 py-1.5 text-xs font-medium text-white/70 transition-all hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "syncing" ?
                      <i className="fa-solid fa-spinner fa-spin" />
                    : <i className="fa-solid fa-arrows-rotate text-[11px]" />}
                    Sync Now
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/[0.03] px-4 py-1.5 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "disconnecting" && (
                      <i className="fa-solid fa-spinner fa-spin" />
                    )}
                    Disconnect
                  </button>
                </div>
              </div>
            }
          </div>
        </div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="overflow-hidden">
              <div className="mt-4 grid gap-4 border-t border-white/5 pt-4">
                {config.connected && config.deviceId && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold tracking-widest text-white/45 uppercase">
                      Hardware ID
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={config.deviceId}
                        className="h-8.5 w-full rounded border border-white/10 bg-white/[0.02] px-3 font-mono text-[11px] text-white/60 outline-none select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(config.deviceId)
                          setCopiedId(true)
                          setTimeout(() => setCopiedId(false), 2000)
                        }}
                        className="flex h-8.5 shrink-0 items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-3 text-[11px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
                        <i
                          className={`fa-solid ${copiedId ? "fa-check text-emerald-400" : "fa-copy"}`}
                        />
                        {copiedId ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold tracking-widest text-white/45 uppercase">
                        Custom Server URL
                      </label>
                      {remoteBaseUrl && !isOfficialCloudUrl(remoteBaseUrl) && !config.connected && (
                        <button
                          type="button"
                          onClick={() => setRemoteBaseUrl("")}
                          className="cursor-pointer text-[9px] font-bold tracking-wider text-cyan-400 transition-colors hover:text-cyan-300">
                          Reset to Default
                        </button>
                      )}
                    </div>
                    <input
                      type="url"
                      placeholder="Leave empty for official sync"
                      value={remoteBaseUrl}
                      disabled={config.connected}
                      onChange={(e) => setRemoteBaseUrl(e.target.value)}
                      className="h-8.5 w-full rounded border border-white/10 bg-transparent px-3 text-[12px] text-white transition-all duration-200 outline-none focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold tracking-widest text-white/45 uppercase">
                      Device Name Override
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
                    className="flex items-center gap-2 rounded border border-white/10 bg-[rgba(22,28,36,0.62)] px-4 py-1.5 text-xs font-semibold text-white/70 transition-all hover:bg-[rgba(22,28,36,0.85)] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "saving" && <i className="fa-solid fa-spinner fa-spin" />}
                    Save Configuration
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
      title="Data Boundaries & Privacy">
      <div className="space-y-5 pt-2">
        <p className="text-[12px] leading-relaxed text-white/65">
          To maintain security and compliance, Facenox clearly separates what information is shared
          with Facenox Cloud versus what remains strictly on your local device:
        </p>

        <div className="space-y-5 text-xs">
          {/* Cloud Sync Section */}
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-white/90">Shared with Facenox Cloud</div>
            <p className="text-[11px] leading-relaxed text-white/50">
              Employee names, roles, attendance logs, device diagnostics, and encrypted biometric
              face vectors (embeddings) are synchronized to Facenox Cloud for backup and reporting.
            </p>
          </div>

          {/* Local Processing Section */}
          <div className="space-y-2">
            <div className="text-[13px] font-semibold text-white/90">Stored Locally Only</div>
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
                Manage Local Database →
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 active:scale-[0.97]">
            Understood
          </button>
        </div>
      </div>
    </Modal>
  )
}
