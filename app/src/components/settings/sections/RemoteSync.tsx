import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

import { InfoPopover } from "../../shared/InfoPopover"
import {
  DEFAULT_CLOUD_BASE_URL,
  DEFAULT_SYNC_INTERVAL_MINUTES,
} from "../../../services/cloudSyncDefaults"

type CloudConfig = {
  enabled: boolean
  cloudBaseUrl: string
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
}

type BannerState =
  | { type: "idle" }
  | { type: "success"; message: string }
  | { type: "error"; message: string }

const defaultConfig: CloudConfig = {
  enabled: true,
  cloudBaseUrl: DEFAULT_CLOUD_BASE_URL,
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
}

const pairingSteps = [
  {
    label: "Step 1",
    title: "Generate Code",
    body: (
      <>
        Get a pairing code from the{" "}
        <a
          href="https://facenox.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 underline transition-colors hover:text-cyan-300">
          Management Dashboard
        </a>
        .
      </>
    ),
  },
  {
    label: "Step 2",
    title: "Link Device",
    body: "Enter the code below to link this device.",
  },
  {
    label: "Connected",
    title: "Auto-Sync Active",
    body: "Records and groups will automatically sync in the background.",
  },
]

export function RemoteSync({ onNavigateToDB }: { onNavigateToDB?: () => void }) {
  const [config, setConfig] = useState<CloudConfig>(defaultConfig)
  const [cloudBaseUrl, setCloudBaseUrl] = useState("")
  const [deviceName, setDeviceName] = useState("Facenox Desktop")
  const [pairingCode, setPairingCode] = useState("")
  const [intervalMinutes, setIntervalMinutes] = useState(DEFAULT_SYNC_INTERVAL_MINUTES)
  const [enabled, setEnabled] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busyAction, setBusyAction] = useState<
    "saving" | "pairing" | "disconnecting" | "syncing" | null
  >(null)
  const [banner, setBanner] = useState<BannerState>({ type: "idle" })

  const syncFromConfig = useCallback((nextConfig: CloudConfig) => {
    const nextCloudBaseUrl = nextConfig.cloudBaseUrl || DEFAULT_CLOUD_BASE_URL

    setConfig(nextConfig)
    setCloudBaseUrl(nextCloudBaseUrl === DEFAULT_CLOUD_BASE_URL ? "" : nextCloudBaseUrl)
    setDeviceName(nextConfig.deviceName || "Facenox Desktop")
    setIntervalMinutes(nextConfig.intervalMinutes || DEFAULT_SYNC_INTERVAL_MINUTES)
    setEnabled(nextConfig.enabled)
    setShowAdvanced(nextCloudBaseUrl !== DEFAULT_CLOUD_BASE_URL)
  }, [])

  const loadConfig = useCallback(async () => {
    const nextConfig = await window.electronAPI.sync.getConfig()
    syncFromConfig(nextConfig)
  }, [syncFromConfig])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleSave = async () => {
    setBusyAction("saving")
    setBanner({ type: "idle" })
    try {
      const nextConfig = await window.electronAPI.sync.updateConfig({
        cloudBaseUrl: cloudBaseUrl.trim(),
        deviceName,
        intervalMinutes,
        enabled,
      })
      syncFromConfig(nextConfig)
      setBanner({
        type: "success",
        message:
          nextConfig.connected ?
            "Remote sync settings saved. Auto-sync state updated."
          : "Remote sync settings saved. You can pair this desktop whenever you're ready.",
      })
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Could not save Remote Sync settings.",
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handlePair = async () => {
    setBusyAction("pairing")
    setBanner({ type: "idle" })
    try {
      const result = await window.electronAPI.sync.pairDevice({
        cloudBaseUrl: cloudBaseUrl.trim() || DEFAULT_CLOUD_BASE_URL,
        pairingCode,
        deviceName,
      })

      if (!result.success || !result.config) {
        throw new Error(result.error || "Pairing failed.")
      }

      syncFromConfig(result.config)
      setPairingCode("")
      setBanner({
        type: result.initialSyncSucceeded === false ? "error" : "success",
        message: result.message || "Device paired successfully.",
      })
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Could not pair this desktop.",
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleDisconnect = async () => {
    setBusyAction("disconnecting")
    setBanner({ type: "idle" })
    try {
      const result = await window.electronAPI.sync.disconnectDevice()
      syncFromConfig(result.config)
      setPairingCode("")
      setBanner({
        type: result.warning ? "error" : "success",
        message:
          result.warning ?
            `Disconnected locally, but the dashboard returned a warning: ${result.warning}`
          : "Device disconnected from Management Dashboard.",
      })
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Could not disconnect this device.",
      })
    } finally {
      setBusyAction(null)
    }
  }

  const handleManualSync = async () => {
    setBusyAction("syncing")
    setBanner({ type: "idle" })
    try {
      const result = await window.electronAPI.sync.triggerNow()
      await loadConfig()
      setBanner({
        type: result.success ? "success" : "error",
        message: result.message,
      })
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Manual sync failed.",
      })
    } finally {
      setBusyAction(null)
    }
  }

  const badgeTone = config.connected ? "bg-cyan-500/10 text-cyan-400" : "bg-white/5 text-white/40"

  const syncTone =
    config.lastSyncStatus === "success" ? "text-cyan-400"
    : config.lastSyncStatus === "error" ? "text-red-400"
    : "text-white/50"

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-10 px-10 pt-8 pb-16">
      {banner.type !== "idle" && (
        <div
          className={`flex items-start gap-3 rounded-md px-4 py-3 text-[13px] font-medium ${
            banner.type === "success" ?
              "bg-cyan-500/10 text-cyan-400"
            : "bg-red-500/10 text-red-400"
          }`}>
          <i
            className={`mt-0.5 shrink-0 ${
              banner.type === "success" ?
                "fa-solid fa-circle-check"
              : "fa-solid fa-circle-exclamation"
            }`}
          />
          <span>{banner.message}</span>
        </div>
      )}

      {/* Status & Connection Block */}
      <div className="space-y-8">
        <section>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[14px] font-bold tracking-tight text-white">Status</h2>
              <p className="mt-1 text-[13px] text-white/60">
                {config.connected ?
                  `Linked to: ${config.organizationName || "Unknown org"} – ${config.siteName || "Default Site"}`
                : "Operating strictly on-premise. Remote reporting is currently inactive."}
              </p>
            </div>
            <div className={`rounded-md px-2 py-1 text-[11px] font-semibold ${badgeTone}`}>
              {config.connected ? "Synced" : "Offline Mode"}
            </div>
          </div>

          {config.connected && (
            <div className="flex flex-col gap-1 rounded-md border border-white/[0.05] bg-white/[0.02] p-4 font-mono text-[12px] text-white/50">
              <span>Device: {config.deviceName || "Unnamed desktop"}</span>
              <span>Device ID: {config.deviceId}</span>
            </div>
          )}
        </section>

        {/* Connection & Setup */}
        <section>
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-white">Remote Sync</h2>
              <InfoPopover
                title="Data Privacy"
                description="Remote sync is strictly limited to attendance logs and member names. Face embeddings and biometric data are never uploaded and remain entirely on your local device."
                detailsNode={[
                  <>
                    To backup face data,{" "}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={onNavigateToDB}
                      onKeyDown={(e) => e.key === "Enter" && onNavigateToDB?.()}
                      className="pointer-events-auto cursor-pointer text-amber-400/80 underline underline-offset-2 transition-colors hover:text-amber-300">
                      go to the Database tab
                    </span>{" "}
                    and use the Export tool.
                  </>,
                ]}
              />
            </div>
            <p className="mt-1 text-[13px] text-white/40">
              Link this device to synchronize groups and attendance logs with your dashboard.
            </p>
          </div>

          <div className="space-y-8">
            {!config.connected ?
              <div className="grid gap-6 md:grid-cols-3">
                {pairingSteps.map((step) => (
                  <div className="space-y-1" key={step.title}>
                    <div className="text-[11px] font-semibold text-cyan-400">
                      {step.label.toUpperCase()}
                    </div>
                    <div className="text-[13px] font-medium text-white">{step.title}</div>
                    <div className="text-[12px] font-medium text-white/60">{step.body}</div>
                  </div>
                ))}
              </div>
            : null}

            {!config.connected ?
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <label className="text-[11px] font-medium text-white/30 uppercase">
                      Pairing Code
                    </label>
                    <input
                      type="text"
                      placeholder="ABCD2345"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                      className="h-10 w-full rounded-md border-0 bg-white/5 px-4 font-mono text-[13px] tracking-widest text-white uppercase transition-all outline-none placeholder:tracking-normal placeholder:lowercase focus:bg-white/10 focus:ring-1 focus:ring-white/20"
                    />
                  </div>
                  <button
                    onClick={handlePair}
                    disabled={busyAction !== null || !pairingCode}
                    className="flex h-10 min-w-32 shrink-0 items-center justify-center gap-2 rounded-md bg-cyan-500/10 px-4 text-[12px] font-bold text-cyan-400 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                    <i
                      className={
                        busyAction === "pairing" ?
                          "fa-solid fa-spinner fa-spin"
                        : "fa-solid fa-plug"
                      }
                    />
                    Connect
                  </button>
                </div>
              </>
            : <>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleManualSync}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-transparent px-4 py-2 text-[12px] font-medium text-white/70 transition-all hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                    <i
                      className={
                        busyAction === "syncing" ?
                          "fa-solid fa-spinner fa-spin"
                        : "fa-solid fa-rotate"
                      }
                    />
                    Sync Now
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={busyAction !== null}
                    className="flex items-center gap-2 rounded-md bg-red-500/10 px-4 py-2 text-[12px] font-semibold text-red-500 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                    <i
                      className={
                        busyAction === "disconnecting" ?
                          "fa-solid fa-spinner fa-spin"
                        : "fa-solid fa-link-slash"
                      }
                    />
                    Disconnect Device
                  </button>
                </div>
              </>
            }

            {/* Advanced Toggler */}
            <div>
              <button
                onClick={() => setShowAdvanced((value) => !value)}
                className="group flex items-center gap-1.5 text-[12px] font-medium text-white/30 transition hover:text-white/50">
                {showAdvanced ? "Hide Advanced Settings" : "Show Advanced Settings"}
                <i
                  className={`fa-solid ${showAdvanced ? "fa-chevron-up" : "fa-chevron-down"} text-[10px]`}
                />
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden">
                    <div className="mt-4 space-y-6 rounded-md border border-white/[0.05] p-5">
                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-white/30 uppercase">
                            Custom Server URL
                          </label>
                          <input
                            type="url"
                            placeholder="Leave empty for official sync"
                            value={cloudBaseUrl}
                            disabled={config.connected}
                            onChange={(e) => setCloudBaseUrl(e.target.value)}
                            className="h-9 w-full rounded-md border-0 bg-white/5 px-3 text-[13px] text-white transition-all outline-none focus:bg-white/10 focus:ring-1 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-white/30 uppercase">
                            Device Name Override
                          </label>
                          <input
                            type="text"
                            placeholder="Front Desk Desktop"
                            value={deviceName}
                            disabled={config.connected}
                            onChange={(e) => setDeviceName(e.target.value)}
                            className="h-9 w-full rounded-md border-0 bg-white/5 px-3 text-[13px] text-white transition-all outline-none focus:bg-white/10 focus:ring-1 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>

                      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-white/30 uppercase">
                            Auto-Sync Interval (Mins)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={1440}
                            value={intervalMinutes}
                            onChange={(e) =>
                              setIntervalMinutes(Math.max(1, Number(e.target.value) || 1))
                            }
                            className="h-9 w-full rounded-md border-0 bg-white/5 px-3 text-[13px] text-white transition-all outline-none focus:bg-white/10 focus:ring-1 focus:ring-white/20"
                          />
                        </div>
                        <div className="mt-auto mb-1 flex items-center gap-3">
                          <button
                            onClick={() => setEnabled(!enabled)}
                            className={`premium-switch ${enabled ? "premium-switch-on" : "premium-switch-off"}`}>
                            <div
                              className={`premium-switch-thumb ${enabled ? "premium-switch-thumb-on" : "premium-switch-thumb-off"}`}></div>
                          </button>
                          <span className="text-[13px] font-medium text-white/70">
                            Enable auto-sync
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleSave}
                        disabled={busyAction !== null}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-white/10 px-4 py-2 text-[12px] font-medium text-white transition-all hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40">
                        <i
                          className={
                            busyAction === "saving" ?
                              "fa-solid fa-spinner fa-spin"
                            : "fa-solid fa-gear"
                          }
                        />
                        Save Settings
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {config.connected ?
              <p className={`text-[12px] font-medium ${syncTone}`}>
                {config.lastSyncedAt ?
                  `Last successful sync: ${new Date(config.lastSyncedAt).toLocaleString()}`
                : "No successful sync yet."}
                {config.lastSyncMessage ? ` • ${config.lastSyncMessage}` : ""}
              </p>
            : null}
          </div>
        </section>
      </div>

      <hr className="border-white/5" />

      {/* Scope Disclaimer */}
      <section>
        <div className="mb-4">
          <h2 className="text-[14px] font-semibold text-white">Data Scope</h2>
          <p className="mt-1 text-[13px] text-white/40">
            Understand what is shared when the remote connection is active.
          </p>
        </div>
        <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-white/50 marker:text-white/20">
          <li>Groups, members, and real-time attendance logs are synced.</li>
          <li>Hardware IDs and sync timestamps are stored for admin auditing.</li>
          <li className="text-amber-500/70">
            Raw imagery and face profile vectors are never transmitted.
          </li>
        </ul>
      </section>
    </div>
  )
}
