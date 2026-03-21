import { useCallback, useEffect, useState } from "react"

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
    config.connected ?
      "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
    : "border-white/10 bg-white/5 text-white/60"
  const syncTone =
    config.lastSyncStatus === "success" ? "text-cyan-300"
    : config.lastSyncStatus === "error" ? "text-red-400"
    : "text-white/50"

  return (
    <div className="max-w-auto space-y-8 p-10">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-white">Cloud Beta</h3>
        <p className="max-w-2xl text-xs leading-relaxed text-white/50">
          Facenox Desktop stays local-first. Cloud Beta adds shared reports, device status, and
          admin visibility without moving biometric templates or raw face data off this machine.
        </p>
      </div>

      <div className={`rounded-lg border px-4 py-4 ${statusTone}`}>
        <div className="mb-2 flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.24em] uppercase">
              {config.connected ? "Connected" : "Not Connected"}
            </div>
            <div className="mt-1 text-xs">
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
          <div className="grid gap-1 text-[11px] text-white/60 sm:grid-cols-2">
            <span>Device: {config.deviceName || "Unnamed desktop"}</span>
            <span>Device ID: {config.deviceId}</span>
          </div>
        )}
      </div>

      {banner.type !== "idle" && (
        <div
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-xs ${
            banner.type === "success" ?
              "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
            : "border-red-500/20 bg-red-500/10 text-red-400"
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

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
        <div className="border-b border-white/6 px-6 py-5">
          <div className="mb-1 flex items-center gap-2">
            <i className="fa-solid fa-link text-sm text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">Connect this desktop</h4>
          </div>
          <p className="text-xs text-white/50">
            For the hosted beta, normal users only need a pairing code. Server URL is an advanced
            override for custom deployments.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {!config.connected ?
            <div className="grid gap-3 md:grid-cols-3">
              {pairingSteps.map((step) => (
                <div
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4"
                  key={step.title}>
                  <div className="text-[10px] font-semibold tracking-[0.24em] text-cyan-300 uppercase">
                    {step.label}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{step.title}</div>
                  <div className="mt-2 text-[11px] leading-relaxed text-white/50">{step.body}</div>
                </div>
              ))}
            </div>
          : null}

          {!config.connected ?
            <>
              <label className="space-y-2">
                <span className="text-[11px] font-medium text-white/30">Pairing Code</span>
                <input
                  type="text"
                  placeholder="ABCD2345"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                  className="h-10 w-full max-w-sm rounded-lg border border-white/10 bg-white/5 px-4 text-xs tracking-[0.18em] text-white uppercase transition-all outline-none focus:border-cyan-500/30 focus:bg-white/10 focus:ring-4 focus:ring-cyan-500/10"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handlePair}
                  disabled={busyAction !== null || !pairingCode}
                  className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                  <i
                    className={
                      busyAction === "pairing" ?
                        "fa-solid fa-circle-notch fa-spin"
                      : "fa-solid fa-plug"
                    }
                  />
                  Connect to Facenox Cloud
                </button>
                <span className="text-[11px] text-white/40">
                  Advanced settings are only for staging, self-hosted, or special device labels.
                </span>
              </div>
            </>
          : <>
              <div className="grid gap-3 text-xs text-white/60 sm:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                  <div className="mb-1 text-[11px] tracking-[0.22em] text-white/30 uppercase">
                    Organization
                  </div>
                  <div className="text-white">
                    {config.organizationName || config.organizationId}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
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
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold tracking-wider text-white/70 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
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

          <div className="rounded-lg border border-white/8 bg-black/20 px-4 py-3 text-[11px] text-white/45">
            Hosted cloud default:
            <span className="ml-2 text-cyan-300">{DEFAULT_CLOUD_BASE_URL}</span>
          </div>

          <button
            onClick={() => setShowAdvanced((value) => !value)}
            className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-white/45 uppercase transition hover:text-white/70">
            <i className={`fa-solid ${showAdvanced ? "fa-chevron-up" : "fa-chevron-down"}`} />
            {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
          </button>

          {showAdvanced ?
            <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="text-[11px] leading-relaxed text-white/45">
                Change these only if you need a custom server URL, a clearer device label, or a
                different background sync schedule.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[11px] font-medium text-white/30">Server URL</span>
                  <input
                    type="url"
                    placeholder={DEFAULT_CLOUD_BASE_URL}
                    value={cloudBaseUrl}
                    disabled={config.connected}
                    onChange={(e) => setCloudBaseUrl(e.target.value)}
                    className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-4 text-xs text-white transition-all outline-none focus:border-cyan-500/30 focus:bg-white/10 focus:ring-4 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[11px] font-medium text-white/30">Device Name</span>
                  <input
                    type="text"
                    placeholder="Front Desk Desktop"
                    value={deviceName}
                    disabled={config.connected}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-4 text-xs text-white transition-all outline-none focus:border-cyan-500/30 focus:bg-white/10 focus:ring-4 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
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
                    className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-4 text-xs text-white transition-all outline-none focus:border-cyan-500/30 focus:bg-white/10 focus:ring-4 focus:ring-cyan-500/10"
                  />
                </label>
                <label className="mt-auto flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
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
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
        <div className="border-b border-white/6 px-6 py-5">
          <div className="mb-1 flex items-center gap-2">
            <i className="fa-solid fa-cloud text-sm text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">What syncs to Cloud</h4>
          </div>
          <p className="text-xs text-white/50">
            Attendance snapshots move one-way to the cloud for reporting and device visibility.
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          <ul className="space-y-2 pl-5 text-[11px] leading-relaxed text-white/50">
            <li>Groups, members, attendance records, and sessions from the local desktop export</li>
            <li>Device identity, sync status, and admin activity for shared reporting</li>
            <li>Biometric templates, raw face images, and local matching stay on the desktop</li>
          </ul>
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-lg border border-cyan-500/10 bg-cyan-500/5 p-4">
        <i className="fa-solid fa-shield-halved mt-0.5 shrink-0 text-cyan-400/40" />
        <div className="space-y-1">
          <h5 className="text-[11px] font-medium text-cyan-300/80">Privacy boundary</h5>
          <p className="max-w-2xl text-[10px] leading-relaxed text-white/40">
            Cloud Beta is for admin, sync visibility, and reporting. Face embeddings, raw face
            images, and local biometric matching remain on-device in the desktop app.
          </p>
        </div>
      </div>
    </div>
  )
}
