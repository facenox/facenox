import { useCallback, useEffect, useState } from "react"

import { Tooltip } from "@/components/shared"
import { DEFAULT_CLOUD_BASE_URL, DEFAULT_SYNC_INTERVAL_MINUTES } from "@/services/cloudSyncDefaults"

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
  enabled: false,
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
    title: "Generate a pairing code",
    body: "Sign in to Facenox Cloud, choose the site, and create a short-lived pairing code.",
  },
  {
    label: "Step 2",
    title: "Paste the code here",
    body: "For the hosted beta, the cloud server address is already set in Facenox Desktop.",
  },
  {
    label: "Step 3",
    title: "Connect and sync",
    body: "This desktop stores its device token locally and starts the first snapshot sync.",
  },
] as const

export function CloudSync() {
  const [config, setConfig] = useState<CloudConfig>(defaultConfig)
  const [cloudBaseUrl, setCloudBaseUrl] = useState(DEFAULT_CLOUD_BASE_URL)
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
    setCloudBaseUrl(nextCloudBaseUrl)
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
        cloudBaseUrl,
        deviceName,
        intervalMinutes,
        enabled,
      })
      syncFromConfig(nextConfig)
      setBanner({
        type: "success",
        message:
          nextConfig.connected ?
            "Advanced cloud settings saved. Auto-sync state updated."
          : "Advanced cloud settings saved. You can pair this desktop whenever you're ready.",
      })
    } catch (error) {
      setBanner({
        type: "error",
        message: error instanceof Error ? error.message : "Could not save Cloud Beta settings.",
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
        cloudBaseUrl: cloudBaseUrl || DEFAULT_CLOUD_BASE_URL,
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
            `Disconnected locally, but the cloud returned a warning: ${result.warning}`
          : "Device disconnected from Facenox Cloud.",
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

  const statusTone =
    config.connected ? "border-cyan-500/20 text-cyan-300" : "border-white/10 text-white/60"
  const syncTone =
    config.lastSyncStatus === "success" ? "text-cyan-300"
    : config.lastSyncStatus === "error" ? "text-red-400"
    : "text-white/50"

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col space-y-8 p-10">
      <div className={`border-y px-0 py-4 ${statusTone}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.24em] uppercase">
              {config.connected ? "Connected" : "Not Connected"}
            </div>
            <div className="mt-1 text-sm">
              {config.connected ?
                `${config.organizationName || "Unknown org"} - ${config.siteName || "Unknown site"}`
              : "This desktop is still local-only until you connect it to Facenox Cloud."}
            </div>
          </div>
          <div className="rounded-full border border-current/20 px-3 py-1 text-[10px] font-semibold tracking-[0.22em] uppercase">
            {config.connected ? "Cloud Linked" : "Local Only"}
          </div>
        </div>
        {config.connected && (
          <div className="mt-3 grid gap-1 text-[11px] text-white/50 sm:grid-cols-2">
            <span>Device: {config.deviceName || "Unnamed desktop"}</span>
            <span>Device ID: {config.deviceId}</span>
          </div>
        )}
      </div>

      {banner.type !== "idle" && (
        <div
          className={`flex items-start gap-3 border-l-2 px-4 py-1 text-xs ${
            banner.type === "success" ?
              "border-cyan-400 text-cyan-300"
            : "border-red-400 text-red-400"
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

      <section className="space-y-6 pt-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-link text-sm text-cyan-400" />
            <h4 className="text-base font-semibold text-white">Connect this desktop</h4>
            <Tooltip
              content="Cloud Beta sync does not upload face embeddings or raw face images. Biometric matching stays local on this desktop. To move biometric profiles between devices, use encrypted backup and restore."
              position="bottom">
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/30 transition hover:text-cyan-300">
                <i className="fa-solid fa-circle-info text-[11px]" />
              </button>
            </Tooltip>
          </div>
          <p className="text-sm text-white/45">
            For the hosted beta, normal users only need a pairing code. Server URL is an advanced
            override for custom deployments.
          </p>
        </div>

        <div className="space-y-6">
          {!config.connected ?
            <div className="grid gap-4 md:grid-cols-3">
              {pairingSteps.map((step, index) => (
                <div className="space-y-2 border-l border-white/10 pl-4" key={step.title}>
                  <div className="text-[10px] font-semibold tracking-[0.24em] text-cyan-300 uppercase">
                    0{index + 1}
                  </div>
                  <div className="text-sm font-semibold text-white">{step.title}</div>
                  <div className="text-[11px] leading-relaxed text-white/50">{step.body}</div>
                </div>
              ))}
            </div>
          : null}

          {!config.connected ?
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 space-y-2">
                  <span className="text-[11px] font-medium text-white/30">Pairing Code</span>
                  <input
                    type="text"
                    placeholder="ABCD2345"
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                    className="h-10 w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 text-xs tracking-[0.18em] text-white uppercase transition-all outline-none focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5"
                  />
                </label>
                <button
                  onClick={handlePair}
                  disabled={busyAction !== null || !pairingCode}
                  className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 text-[11px] font-bold tracking-wider text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                  <i
                    className={
                      busyAction === "pairing" ?
                        "fa-solid fa-circle-notch fa-spin"
                      : "fa-solid fa-plug"
                    }
                  />
                  Connect
                </button>
              </div>
              <div className="text-[11px] text-white/35">
                Advanced settings are only for staging, self-hosted deployments, or custom device
                labels.
              </div>
            </>
          : <>
              <div className="grid gap-5 border-y border-white/8 py-4 text-xs text-white/60 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] tracking-[0.22em] text-white/30 uppercase">
                    Organization
                  </div>
                  <div className="text-white">
                    {config.organizationName || config.organizationId}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] tracking-[0.22em] text-white/30 uppercase">
                    Site
                  </div>
                  <div className="text-white">{config.siteName || config.siteId}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleManualSync}
                  disabled={busyAction !== null}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-bold tracking-wider text-white/70 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                  <i
                    className={
                      busyAction === "syncing" ?
                        "fa-solid fa-circle-notch fa-spin"
                      : "fa-solid fa-rotate"
                    }
                  />
                  Sync Now
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={busyAction !== null}
                  className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-red-300 transition-all hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40">
                  <i
                    className={
                      busyAction === "disconnecting" ?
                        "fa-solid fa-circle-notch fa-spin"
                      : "fa-solid fa-link-slash"
                    }
                  />
                  Disconnect Device
                </button>
              </div>
            </>
          }

          <button
            onClick={() => setShowAdvanced((value) => !value)}
            className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-white/45 uppercase transition hover:text-white/70">
            <i className={`fa-solid ${showAdvanced ? "fa-chevron-up" : "fa-chevron-down"}`} />
            {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
          </button>

          {showAdvanced ?
            <div className="space-y-4 border-l border-white/10 pl-4">
              <div className="text-[11px] leading-relaxed text-white/45">
                Change these only if you need a custom server URL, a clearer device label, or a
                different background sync schedule.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[11px] font-medium text-white/30">Custom Server URL</span>
                  <input
                    type="url"
                    placeholder={DEFAULT_CLOUD_BASE_URL}
                    value={cloudBaseUrl}
                    disabled={config.connected}
                    onChange={(e) => setCloudBaseUrl(e.target.value)}
                    className="h-10 w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 text-xs text-white transition-all outline-none focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <div className="text-[11px] text-white/35">
                    Leave this unchanged unless you&apos;re connecting to a self-hosted or custom
                    deployment.
                  </div>
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-medium text-white/30">Device Name</span>
                  <input
                    type="text"
                    placeholder="Front Desk Desktop"
                    value={deviceName}
                    disabled={config.connected}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="h-10 w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 text-xs text-white transition-all outline-none focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <label className="space-y-2">
                  <span className="text-[11px] font-medium text-white/30">Auto-Sync Interval</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value) || 1))}
                    className="h-10 w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 text-xs text-white transition-all outline-none focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5"
                  />
                </label>
                <label className="mt-auto flex items-center gap-3 border border-white/10 px-4 py-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="h-4 w-4 accent-cyan-500"
                  />
                  Enable background auto-sync
                </label>
              </div>

              <button
                onClick={handleSave}
                disabled={busyAction !== null}
                className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                <i
                  className={
                    busyAction === "saving" ?
                      "fa-solid fa-circle-notch fa-spin"
                    : "fa-solid fa-gear"
                  }
                />
                Save Advanced Settings
              </button>
            </div>
          : null}

          {config.connected ?
            <p className={`text-[11px] ${syncTone}`}>
              {config.lastSyncedAt ?
                `Last successful sync: ${new Date(config.lastSyncedAt).toLocaleString()}`
              : "No successful sync yet."}
              {config.lastSyncMessage ? ` ${config.lastSyncMessage}` : ""}
            </p>
          : null}
        </div>
      </section>

      <section className="space-y-4 border-t border-white/8 pt-6">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-cloud text-sm text-cyan-400" />
          <h4 className="text-base font-semibold text-white">What goes to cloud</h4>
        </div>
        <ul className="space-y-3 text-sm leading-relaxed text-white/50">
          <li>Groups, members, attendance records, and sessions from this desktop.</li>
          <li>Device identity, sync status, and admin-facing reporting data.</li>
          <li>Cloud Beta sync does not send face embeddings or raw face images.</li>
          <li>
            Biometric matching stays local. To move biometric profiles, use encrypted backup and
            restore.
          </li>
        </ul>
      </section>
    </div>
  )
}
