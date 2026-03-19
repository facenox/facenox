import { persistentStore } from "../persistentStore.js"
import { backendService } from "../backendService.js"
import { getCurrentVersion } from "../updater.js"
import {
  DEFAULT_CLOUD_BASE_URL,
  DEFAULT_SYNC_INTERVAL_MINUTES,
} from "../../services/cloudSyncDefaults.js"
const STARTUP_CATCH_UP_DELAY_MS = 5000

function authHeaders(extra: Record<string, string> = {}) {
  const token = backendService.getToken()
  return token ? { "X-Suri-Token": token, ...extra } : { ...extra }
}

export class BackgroundSyncManager {
  private timer: NodeJS.Timeout | null = null
  private catchUpTimer: NodeJS.Timeout | null = null
  private isSyncing = false

  private getSyncConfig() {
    return {
      enabled: persistentStore.get("sync.enabled") as boolean,
      cloudBaseUrl: (persistentStore.get("sync.cloudBaseUrl") as string) || DEFAULT_CLOUD_BASE_URL,
      siteId: (persistentStore.get("sync.siteId") as string) || "",
      deviceId: (persistentStore.get("sync.deviceId") as string) || "",
      deviceToken: (persistentStore.get("sync.deviceToken") as string) || "",
      intervalMinutes:
        (persistentStore.get("sync.intervalMinutes") as number) || DEFAULT_SYNC_INTERVAL_MINUTES,
      lastSyncedAt: (persistentStore.get("sync.lastSyncedAt") as string | null) || null,
    }
  }

  private clearCatchUpTimer() {
    if (this.catchUpTimer) {
      clearTimeout(this.catchUpTimer)
      this.catchUpTimer = null
    }
  }

  private shouldRunCatchUpSync(intervalMinutes: number, lastSyncedAt: string | null) {
    if (!lastSyncedAt) {
      return true
    }

    const lastSyncTime = new Date(lastSyncedAt).getTime()
    if (!Number.isFinite(lastSyncTime)) {
      return true
    }

    return Date.now() - lastSyncTime >= Math.max(1, intervalMinutes) * 60 * 1000
  }

  private scheduleCatchUpSync(delayMs = STARTUP_CATCH_UP_DELAY_MS) {
    this.clearCatchUpTimer()
    this.catchUpTimer = setTimeout(() => {
      this.catchUpTimer = null
      void this.performSync()
    }, delayMs)
  }

  private setLastSyncState(state: {
    lastSyncedAt?: string | null
    lastSyncStatus: "idle" | "success" | "error"
    lastSyncMessage: string | null
  }) {
    if (state.lastSyncedAt !== undefined) {
      persistentStore.set("sync.lastSyncedAt", state.lastSyncedAt)
    }
    persistentStore.set("sync.lastSyncStatus", state.lastSyncStatus)
    persistentStore.set("sync.lastSyncMessage", state.lastSyncMessage)
  }

  start(options: { skipCatchUp?: boolean } = {}) {
    this.stop()

    const { enabled, cloudBaseUrl, siteId, deviceId, deviceToken, intervalMinutes, lastSyncedAt } =
      this.getSyncConfig()

    if (!enabled || !cloudBaseUrl || !siteId || !deviceId || !deviceToken) {
      console.log("[Sync] Background Auto-Sync is disabled or cloud pairing is incomplete.")
      return
    }

    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000
    console.log(`[Sync] Starting Auto-Sync. Interval: ${intervalMinutes} minutes.`)

    this.timer = setInterval(() => {
      void this.performSync()
    }, intervalMs)

    if (!options.skipCatchUp && this.shouldRunCatchUpSync(intervalMinutes, lastSyncedAt)) {
      console.log("[Sync] Scheduling a catch-up sync because the device is overdue.")
      this.scheduleCatchUpSync()
    }
  }

  stop() {
    this.clearCatchUpTimer()
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async performSync() {
    if (this.isSyncing) {
      return {
        success: false,
        message: "A sync is already running.",
      }
    }

    const { enabled, cloudBaseUrl, siteId, deviceId, deviceToken } = this.getSyncConfig()

    if (!cloudBaseUrl || !siteId || !deviceId || !deviceToken) {
      this.stop()
      this.setLastSyncState({
        lastSyncStatus: "error",
        lastSyncMessage: "Connect this desktop to Suri Cloud before syncing.",
      })
      return {
        success: false,
        message: "Cloud pairing is incomplete.",
      }
    }

    if (!enabled && this.timer) {
      this.stop()
    }

    if (!enabled && !this.timer) {
      console.log("[Sync] Running a manual sync while auto-sync is disabled.")
    }

    this.isSyncing = true
    console.log("[Sync] Triggering background auto-sync...")

    try {
      const exportUrl = `${backendService.getUrl()}/attendance/export`
      const response = await fetch(exportUrl, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        signal: AbortSignal.timeout(60000),
      })

      if (!response.ok) {
        throw new Error(`Local export failed: HTTP ${response.status}`)
      }

      const attendanceExport = await response.json()
      const exportedAt =
        typeof attendanceExport?.exported_at === "string" ?
          attendanceExport.exported_at
        : new Date().toISOString()
      const syncPayload = {
        schema_version: 1 as const,
        snapshot_id: `${deviceId}:${exportedAt}`,
        device_id: deviceId,
        site_id: siteId,
        app_version: getCurrentVersion(),
        exported_at: exportedAt,
        attendance_export: attendanceExport,
      }

      const cloudResponse = await fetch(`${cloudBaseUrl.replace(/\/+$/, "")}/api/sync/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deviceToken}`,
          "X-Suri-Version": getCurrentVersion(),
          "User-Agent": "Suri-Desktop-Sync",
        },
        body: JSON.stringify(syncPayload),
        signal: AbortSignal.timeout(60000),
      })

      const responseText = await cloudResponse.text()
      let responsePayload: Record<string, unknown> | null = null
      if (responseText) {
        try {
          responsePayload = JSON.parse(responseText) as Record<string, unknown>
        } catch {
          responsePayload = null
        }
      }

      if (!cloudResponse.ok) {
        const detail =
          typeof responsePayload?.error === "string" ?
            responsePayload.error
          : responseText || `HTTP ${cloudResponse.status}`
        throw new Error(`Cloud sync failed: ${detail}`)
      }

      console.log("[Sync] Background sync successful.")
      const syncedAt = new Date().toISOString()
      this.setLastSyncState({
        lastSyncedAt: syncedAt,
        lastSyncStatus: "success",
        lastSyncMessage:
          typeof responsePayload?.status === "string" ?
            `Snapshot ${responsePayload.status}.`
          : "Snapshot synced successfully.",
      })

      return {
        success: true,
        message:
          typeof responsePayload?.status === "string" ?
            `Snapshot ${responsePayload.status}.`
          : "Snapshot synced successfully.",
        syncedAt,
      }
    } catch (error) {
      console.warn("[Sync] Background sync failed:", error)
      const message = error instanceof Error ? error.message : "Background sync failed."
      this.setLastSyncState({
        lastSyncStatus: "error",
        lastSyncMessage: message,
      })
      return {
        success: false,
        message,
      }
    } finally {
      this.isSyncing = false
    }
  }
}

export const syncManager = new BackgroundSyncManager()
