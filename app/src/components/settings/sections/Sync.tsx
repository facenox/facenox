import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

import { useUIStore } from "@/components/main/stores"
import { Modal } from "@/components/common"
import {
  DEFAULT_REMOTE_BASE_URL,
  DEFAULT_SYNC_INTERVAL_MINUTES,
} from "../../../services/syncDefaults"
import { updaterService } from "@/services"

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

interface SyncProps {
  onNavigateToDB?: () => void
  onStatusChange?: (config: RemoteSyncConfig | null) => void
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
  const [busyAction, setBusyAction] = useState<
    "saving" | "pairing" | "disconnecting" | "syncing" | null
  >(null)

  const syncFromConfig = useCallback(
    (nextConfig: RemoteSyncConfig) => {
      const nextRemoteBaseUrl = nextConfig.remoteBaseUrl || DEFAULT_REMOTE_BASE_URL

      setConfig(nextConfig)
      setRemoteBaseUrl(nextRemoteBaseUrl === DEFAULT_REMOTE_BASE_URL ? "" : nextRemoteBaseUrl)
      setDeviceName(nextConfig.deviceName === "Facenox Desktop" ? "" : nextConfig.deviceName || "")
      setIntervalMinutes(nextConfig.intervalMinutes || DEFAULT_SYNC_INTERVAL_MINUTES)
      setShowAdvanced(nextRemoteBaseUrl !== DEFAULT_REMOTE_BASE_URL)

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
      if (result.warning) {
        setError(`Disconnected locally, but the cloud returned a warning: ${result.warning}`)
      } else {
        setSuccess("Device disconnected from Facenox Cloud.")
      }
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
        setSuccess(result.message)
      } else {
        setError("Manual sync failed. Check the log below for details.")
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Manual sync failed.")
    } finally {
      setBusyAction(null)
    }
  }

  const syncTone =
    config.lastSyncStatus === "success" ? "text-cyan-400/90"
    : config.lastSyncStatus === "error" ? "text-red-400"
    : "text-white/45"

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10">
      <div className="overflow-hidden">
        {/* Elevated Header Row with Connect/Connected Device Details and Actions */}
        <div className="flex items-start justify-between gap-4 border-b border-white/5 pt-6 pb-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-white/90">
              {!config.connected ? "Connect to Facenox Cloud" : "Connected to Facenox Cloud"}
            </h3>
            {!config.connected ?
              <p className="mt-0.5 text-xs text-white/65">
                Generate a pairing code in{" "}
                <a
                  href="https://app.facenox.com"
                  onClick={(e) => {
                    e.preventDefault()
                    updaterService.openReleasePage("https://app.facenox.com")
                  }}
                  className="text-white transition-colors hover:underline">
                  Facenox Cloud
                </a>{" "}
                and enter it below to connect this device.
              </p>
            : config.remoteBaseUrl && config.remoteBaseUrl !== DEFAULT_REMOTE_BASE_URL ?
              <p className="mt-0.5 text-xs text-white/65">
                Device connected. Attendance records are syncing automatically to custom server:{" "}
                <span className="font-mono text-[11px] text-white/80 underline select-all">
                  {config.remoteBaseUrl}
                </span>
              </p>
            : <p className="mt-0.5 text-xs text-white/65">
                Device connected. Attendance records are syncing automatically with Facenox Cloud.
              </p>
            }
          </div>
          <div className="mt-0.5 flex shrink-0 flex-col items-end gap-3">
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="text-[10px] font-extrabold tracking-[0.12em] text-cyan-400/90 uppercase transition-colors hover:text-cyan-300">
              View Privacy & Boundaries
            </button>
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
              <div className="space-y-4">
                <div className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <label className="text-[10px] font-extrabold tracking-widest text-white/40 uppercase">
                      Pairing Code
                    </label>
                    <input
                      type="text"
                      placeholder="ABCD2345"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                      className="h-9 w-full rounded border border-white/10 bg-transparent px-4 text-center font-mono text-[13px] font-semibold tracking-[0.25em] text-white uppercase transition-all duration-200 outline-none placeholder:text-center placeholder:tracking-[0.1em] placeholder:text-white/20 placeholder:lowercase focus:border-white/20"
                    />
                  </div>
                  <button
                    onClick={handlePair}
                    disabled={busyAction !== null || !pairingCode}
                    className="flex h-9 min-w-28 shrink-0 items-center justify-center gap-2 rounded border border-white/10 bg-[rgba(22,28,36,0.62)] px-4 text-xs font-semibold text-white/70 transition-all hover:bg-[rgba(22,28,36,0.85)] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "pairing" && <i className="fa-solid fa-spinner fa-spin" />}
                    Connect
                  </button>
                </div>
              </div>
            : <div className="space-y-4">
                <div className="flex justify-between gap-4 font-mono text-[11px] text-white/40">
                  <div className="space-y-0.5">
                    <div>Device: {config.deviceName || "Facenox Desktop"}</div>
                    <div>Hardware ID: {config.deviceId}</div>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <div className={syncTone}>
                      {config.lastSyncedAt ?
                        `Last sync: ${new Date(config.lastSyncedAt).toLocaleString()}`
                      : "No successful sync yet."}
                    </div>
                    {config.lastSyncMessage && <div>{config.lastSyncMessage}</div>}
                    {config.unsyncedRecordsCount !== undefined && config.unsyncedRecordsCount > 0 ?
                      <div className="mt-1 flex items-center justify-end gap-1.5 font-semibold text-amber-400/90">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
                        </span>
                        <span>{config.unsyncedRecordsCount} record(s) queued</span>
                      </div>
                    : <div className="mt-1 flex items-center justify-end gap-1.5 font-medium text-cyan-400/90">
                        <i className="fa-solid fa-circle-check text-[10px]" />
                        <span>All synced</span>
                      </div>
                    }
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    onClick={handleManualSync}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 rounded border border-white/10 bg-transparent px-4 py-1.5 text-[11.5px] font-medium text-white/70 transition-all hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "syncing" && <i className="fa-solid fa-spinner fa-spin" />}
                    Sync Now
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 rounded border border-red-500/20 bg-red-500/[0.03] px-4 py-1.5 text-[11.5px] font-semibold text-red-400 transition-all hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40">
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
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold tracking-widest text-white/45 uppercase">
                        Custom Server URL
                      </label>
                      {remoteBaseUrl &&
                        remoteBaseUrl.trim() !== DEFAULT_REMOTE_BASE_URL &&
                        !config.connected && (
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

                <div className="pt-2">
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
