import { syncPushSchema, type SyncPushPayload } from "../../shared/cloudSyncContract.js"
import { withLocalBackendHeaders } from "../localBackendScope.js"
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
  return withLocalBackendHeaders(token ? { "X-Facenox-Token": token, ...extra } : { ...extra })
}

function toCloudIsoDateTime(value: unknown): string | null {
  if (value == null || value === "") {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const direct = new Date(trimmed)
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString()
  }

  const assumedUtc = new Date(`${trimmed}Z`)
  if (!Number.isNaN(assumedUtc.getTime())) {
    return assumedUtc.toISOString()
  }

  return null
}

function normalizeAttendanceExportForCloud(
  attendanceExport: Record<string, unknown>,
): SyncPushPayload["attendance_export"] {
  const groups = Array.isArray(attendanceExport.groups) ? attendanceExport.groups : []
  const members = Array.isArray(attendanceExport.members) ? attendanceExport.members : []
  const records = Array.isArray(attendanceExport.records) ? attendanceExport.records : []
  const sessions = Array.isArray(attendanceExport.sessions) ? attendanceExport.sessions : []

  return {
    ...attendanceExport,
    exported_at: toCloudIsoDateTime(attendanceExport.exported_at) ?? new Date().toISOString(),
    groups: groups.map((group) => {
      const candidate = typeof group === "object" && group !== null ? group : {}
      return {
        ...candidate,
        created_at:
          toCloudIsoDateTime((candidate as { created_at?: unknown }).created_at) ??
          new Date().toISOString(),
        settings:
          (
            typeof (candidate as { settings?: unknown }).settings === "object" &&
            (candidate as { settings?: unknown }).settings !== null
          ) ?
            (candidate as { settings: Record<string, unknown> }).settings
          : {
              late_threshold_enabled: false,
              track_checkout: false,
            },
      }
    }),
    members: members.map((member) => {
      const candidate = typeof member === "object" && member !== null ? member : {}
      return {
        ...candidate,
        joined_at:
          toCloudIsoDateTime((candidate as { joined_at?: unknown }).joined_at) ??
          new Date().toISOString(),
        consent_granted_at: toCloudIsoDateTime(
          (candidate as { consent_granted_at?: unknown }).consent_granted_at,
        ),
      }
    }),
    records: records.map((record) => {
      const candidate = typeof record === "object" && record !== null ? record : {}
      return {
        ...candidate,
        timestamp:
          toCloudIsoDateTime((candidate as { timestamp?: unknown }).timestamp) ??
          new Date().toISOString(),
      }
    }),
    sessions: sessions.map((session) => {
      const candidate = typeof session === "object" && session !== null ? session : {}
      return {
        ...candidate,
        check_in_time: toCloudIsoDateTime((candidate as { check_in_time?: unknown }).check_in_time),
        check_out_time: toCloudIsoDateTime(
          (candidate as { check_out_time?: unknown }).check_out_time,
        ),
      }
    }),
    settings:
      typeof attendanceExport.settings === "object" && attendanceExport.settings !== null ?
        attendanceExport.settings
      : {
          late_threshold_minutes: 15,
          enable_location_tracking: false,
          confidence_threshold: 0.7,
          attendance_cooldown_seconds: 10,
          relog_cooldown_seconds: 1800,
          enable_liveness_detection: true,
          data_retention_days: 0,
        },
  } as SyncPushPayload["attendance_export"]
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
        lastSyncMessage: "Connect this desktop to Facenox Cloud before syncing.",
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

      const rawAttendanceExport = (await response.json()) as Record<string, unknown>
      const attendanceExport = normalizeAttendanceExportForCloud(rawAttendanceExport)
      const exportedAt =
        typeof attendanceExport?.exported_at === "string" ?
          attendanceExport.exported_at
        : new Date().toISOString()
      const syncPayload: SyncPushPayload = {
        schema_version: 1 as const,
        snapshot_id: `${deviceId}:${exportedAt}`,
        device_id: deviceId,
        site_id: siteId,
        app_version: getCurrentVersion(),
        exported_at: exportedAt,
        attendance_export: attendanceExport,
      }
      const validatedPayload = syncPushSchema.parse(syncPayload)

      const cloudResponse = await fetch(`${cloudBaseUrl.replace(/\/+$/, "")}/api/sync/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deviceToken}`,
          "X-Facenox-Version": getCurrentVersion(),
          "User-Agent": "Facenox-Desktop-Sync",
        },
        body: JSON.stringify(validatedPayload),
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
