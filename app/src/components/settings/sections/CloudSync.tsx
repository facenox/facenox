import { useCallback, useEffect, useState } from "react"

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
  cloudBaseUrl: "",
  organizationId: "",
  organizationName: "",
  siteId: "",
  siteName: "",
  deviceId: "",
  deviceName: "Suri Desktop",
  intervalMinutes: 15,
  lastSyncedAt: null,
  lastSyncStatus: "idle",
  lastSyncMessage: null,
  connected: false,
}

export function CloudSync() {
  const [config, setConfig] = useState<CloudConfig>(defaultConfig)
  const [cloudBaseUrl, setCloudBaseUrl] = useState("")
  const [deviceName, setDeviceName] = useState("Suri Desktop")
  const [pairingCode, setPairingCode] = useState("")
  const [intervalMinutes, setIntervalMinutes] = useState(15)
  const [enabled, setEnabled] = useState(false)
  const [busyAction, setBusyAction] = useState<
    "saving" | "pairing" | "disconnecting" | "syncing" | null
  >(null)
  const [banner, setBanner] = useState<BannerState>({ type: "idle" })

  const syncFromConfig = useCallback((nextConfig: CloudConfig) => {
    setConfig(nextConfig)
    setCloudBaseUrl(nextConfig.cloudBaseUrl)
    setDeviceName(nextConfig.deviceName || "Suri Desktop")
    setIntervalMinutes(nextConfig.intervalMinutes)
    setEnabled(nextConfig.enabled)
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
            "Cloud Beta settings saved. Auto-sync state updated."
          : "Cloud Beta settings saved. Pair this device to start syncing.",
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
        cloudBaseUrl,
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
          : "Device disconnected from Suri Cloud.",
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
          Pair this desktop with your Suri Cloud workspace for centralized reporting, device
          visibility, and sync monitoring. Attendance data moves one-way to the cloud in the beta.
          Biometric templates and raw face data stay local on this machine.
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
                `${config.organizationName || "Unknown org"} · ${config.siteName || "Unknown site"}`
              : "This desktop is still local-only until you pair it with Suri Cloud."}
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
            <i className="fa-solid fa-cloud text-sm text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">Connection Settings</h4>
          </div>
          <p className="text-xs text-white/50">
            Save the cloud URL, local device label, and auto-sync interval before pairing.
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-[11px] font-medium text-white/30">Cloud Base URL</span>
              <input
                type="url"
                placeholder="https://cloud.suri.app"
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

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              disabled={busyAction !== null}
              className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
              <i
                className={
                  busyAction === "saving" ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-gear"
                }
              />
              Save Settings
            </button>
            {config.connected && (
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
            )}
          </div>

          {config.connected && (
            <p className={`text-[11px] ${syncTone}`}>
              {config.lastSyncedAt ?
                `Last successful sync: ${new Date(config.lastSyncedAt).toLocaleString()}`
              : "No successful sync yet."}
              {config.lastSyncMessage ? ` ${config.lastSyncMessage}` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
        <div className="border-b border-white/6 px-6 py-5">
          <div className="mb-1 flex items-center gap-2">
            <i className="fa-solid fa-link text-sm text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">Pairing</h4>
          </div>
          <p className="text-xs text-white/50">
            Use a short-lived pairing code from Suri Cloud to connect this desktop to an
            organization and site.
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
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
              <button
                onClick={handlePair}
                disabled={busyAction !== null || !cloudBaseUrl || !pairingCode}
                className="flex items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                <i
                  className={
                    busyAction === "pairing" ?
                      "fa-solid fa-circle-notch fa-spin"
                    : "fa-solid fa-plug"
                  }
                />
                Pair This Desktop
              </button>
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
            </>
          }
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
