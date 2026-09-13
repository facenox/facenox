import {
  syncPushSchema,
  type SyncPushPayload,
  type FaceEmbedding,
} from "../../shared/syncContract.js"
import { withLocalBackendHeaders } from "../localBackendScope.js"
import { persistentStore } from "../persistentStore.js"
import { backendService } from "../backendService.js"
import { state } from "../State.js"
import { getCurrentVersion, checkForUpdates, notifyRenderer } from "../updater.js"
import { decryptEmbedding, encryptEmbedding } from "./EmbeddingCrypto.js"
import {
  DEFAULT_REMOTE_BASE_URL,
  DEFAULT_SYNC_INTERVAL_MINUTES,
} from "../../services/syncDefaults.js"
const STARTUP_CATCH_UP_DELAY_MS = 5000

function authHeaders(extra: Record<string, string> = {}) {
  const token = backendService.getToken()
  return withLocalBackendHeaders(token ? { "X-Facenox-Token": token, ...extra } : { ...extra })
}

function toRemoteIsoDateTime(value: unknown): string | null {
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

function normalizeAttendanceExportForRemote(
  attendanceExport: Record<string, unknown>,
): SyncPushPayload["attendance_export"] {
  const groups = Array.isArray(attendanceExport.groups) ? attendanceExport.groups : []
  const members = Array.isArray(attendanceExport.members) ? attendanceExport.members : []
  const records = Array.isArray(attendanceExport.records) ? attendanceExport.records : []
  const sessions = Array.isArray(attendanceExport.sessions) ? attendanceExport.sessions : []

  const sanitizedAttendance: Record<string, unknown> = { ...attendanceExport }
  delete sanitizedAttendance.biometrics

  return {
    ...sanitizedAttendance,
    exported_at: toRemoteIsoDateTime(attendanceExport.exported_at) ?? new Date().toISOString(),
    groups: groups.map((group) => {
      const candidate = typeof group === "object" && group !== null ? group : {}
      return {
        ...candidate,
        created_at:
          toRemoteIsoDateTime((candidate as { created_at?: unknown }).created_at) ??
          new Date().toISOString(),
        settings:
          (
            typeof (candidate as { settings?: unknown }).settings === "object" &&
            (candidate as { settings?: unknown }).settings !== null
          ) ?
            (candidate as { settings: Record<string, unknown> }).settings
          : {
              late_threshold_minutes: 15,
              late_threshold_enabled: false,
              class_start_time: null,
              track_checkout: false,
              biometric_consent_certified: false,
            },
      }
    }),
    members: members.map((member) => {
      const candidate = typeof member === "object" && member !== null ? member : {}
      return {
        ...candidate,
        joined_at:
          toRemoteIsoDateTime((candidate as { joined_at?: unknown }).joined_at) ??
          new Date().toISOString(),
        consent_granted_at: toRemoteIsoDateTime(
          (candidate as { consent_granted_at?: unknown }).consent_granted_at,
        ),
      }
    }),
    records: records.map((record) => {
      const candidate = typeof record === "object" && record !== null ? record : {}
      return {
        ...candidate,
        timestamp:
          toRemoteIsoDateTime((candidate as { timestamp?: unknown }).timestamp) ??
          new Date().toISOString(),
      }
    }),
    sessions: sessions.map((session) => {
      const candidate = typeof session === "object" && session !== null ? session : {}
      return {
        ...candidate,
        check_in_time: toRemoteIsoDateTime(
          (candidate as { check_in_time?: unknown }).check_in_time,
        ),
        check_out_time: toRemoteIsoDateTime(
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
          confidence_threshold: 0.8,
          attendance_cooldown_seconds: 10,
          relog_cooldown_seconds: 1800,
          enable_liveness_detection: false,
          max_recognition_faces_per_frame: 6,
          data_retention_days: 0,
        },
  } as SyncPushPayload["attendance_export"]
}

interface DeviceCommand {
  id: string
  command: string
  payload: Record<string, unknown>
}

interface CommandResult {
  success?: boolean
  message?: string
  error?: string
  [key: string]: unknown
}

export class BackgroundSyncManager {
  private timer: NodeJS.Timeout | null = null
  private commandTimer: NodeJS.Timeout | null = null
  private catchUpTimer: NodeJS.Timeout | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private pollFallbackTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private isSyncing = false
  /** When true, a sync will be re-triggered once the current one finishes. */
  private pendingSyncRequested = false
  private reconnectAttempts = 0
  private eventStreamController: AbortController | null = null
  private lastEventReceivedAt: number = 0
  private pollFallbackIntervalMs = 60000 // 1 minute fallback poll

  private getSyncConfig() {
    return {
      enabled: persistentStore.get("sync.enabled") as boolean,
      remoteBaseUrl:
        (persistentStore.get("sync.remoteBaseUrl") as string) || DEFAULT_REMOTE_BASE_URL,
      siteId: (persistentStore.get("sync.siteId") as string) || "",
      deviceId: (persistentStore.get("sync.deviceId") as string) || "",
      deviceToken: (persistentStore.get("sync.deviceToken") as string) || "",
      encryptionKey: (persistentStore.get("sync.encryptionKey") as string) || "",
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

  private setLastSyncState(syncState: {
    lastSyncedAt?: string | null
    lastSyncStatus: "idle" | "success" | "error"
    lastSyncMessage: string | null
  }) {
    if (syncState.lastSyncedAt !== undefined) {
      persistentStore.set("sync.lastSyncedAt", syncState.lastSyncedAt)
    }
    persistentStore.set("sync.lastSyncStatus", syncState.lastSyncStatus)
    persistentStore.set("sync.lastSyncMessage", syncState.lastSyncMessage)

    // Broadcast the status change to the renderer
    state.mainWindow?.webContents.send("sync:data-changed")
  }

  start(options: { skipCatchUp?: boolean } = {}) {
    this.stop()

    const { enabled, remoteBaseUrl, siteId, deviceId, deviceToken, intervalMinutes, lastSyncedAt } =
      this.getSyncConfig()

    if (!enabled || !remoteBaseUrl || !siteId || !deviceId || !deviceToken) {
      console.log("[Sync] Background Auto-Sync is disabled or device pairing is incomplete.")
      return
    }

    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000
    console.log(`[Sync] Starting Auto-Sync. Interval: ${intervalMinutes} minutes.`)

    this.timer = setInterval(() => {
      void this.performSync()
    }, intervalMs)

    // Command Polling Loop (Phase 4: Remote Management)
    // Poll every 30 seconds for remote commands (WIPE, etc.)
    this.commandTimer = setInterval(() => {
      void this.pollCommands()
    }, 30000)

    if (!options.skipCatchUp && this.shouldRunCatchUpSync(intervalMinutes, lastSyncedAt)) {
      console.log("[Sync] Scheduling a catch-up sync because the device is overdue.")
      this.scheduleCatchUpSync()
    }

    // Initial command poll
    void this.pollCommands()

    // Real-time: Start listening for dashboard events
    void this.startEventStream()

    // Fallback polling: sync periodically if SSE hasn't delivered events
    this.startPollFallback()
  }

  private async startEventStream() {
    this.stopEventStream()

    const { enabled, remoteBaseUrl, deviceId, deviceToken } = this.getSyncConfig()
    if (!enabled || !remoteBaseUrl || !deviceId || !deviceToken) return

    const url = `${remoteBaseUrl.replace(/\/+$/, "")}/api/sync/events?deviceId=${deviceId}`
    console.log(`[Sync] Connecting to real-time event stream: ${url}`)

    this.eventStreamController = new AbortController()
    const { signal } = this.eventStreamController

    try {
      // Using global fetch with ReadableStream for SSE in Electron Main
      const response = await fetch(url, {
        signal,
        headers: {
          Authorization: `Bearer ${deviceToken}`,
          Accept: "text/event-stream",
        },
      })

      if (!response.ok || !response.body) {
        throw new Error(`Failed to open event stream: ${response.statusText}`)
      }

      this.reconnectAttempts = 0
      // Don't reset lastEventReceivedAt on reconnect to avoid masking SSE failure
      // from the fallback poll. Only update it when actual SSE data is received.
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            this.lastEventReceivedAt = Date.now()
            try {
              const data = JSON.parse(line.slice(6))
              console.log("[Sync] Real-time event received:", data.type)

              if (
                data.type === "POLICY_UPDATE" ||
                data.type === "SYNC_REQUEST" ||
                data.type === "MEMBERS_UPDATE"
              ) {
                console.log("[Sync] Triggering immediate sync from real-time command.")
                void this.performSync()
              }
            } catch {
              // Ignore heartbeat or malformed JSON
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("[Sync] Event stream aborted cleanly.")
        return
      }
      console.warn("[Sync] Event stream error, reconnecting...", error)
      // On SSE error, immediately do a catch-up sync to pick up missed events
      void this.performSync()
      this.reconnectEventStream()
    }
  }

  private reconnectEventStream() {
    this.stopEventStream()
    // Faster reconnect: max 10s instead of 30s, start at 500ms
    const delay = Math.min(10000, Math.pow(2, this.reconnectAttempts) * 500)
    this.reconnectAttempts++

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.startEventStream()
    }, delay)
  }

  private stopEventStream() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.eventStreamController) {
      this.eventStreamController.abort()
      this.eventStreamController = null
    }
  }

  private startPollFallback() {
    this.stopPollFallback()
    this.pollFallbackTimer = setInterval(() => {
      // Only sync if we haven't received any SSE event recently
      // (within the last 2x the poll interval)
      const staleThreshold = this.pollFallbackIntervalMs * 2
      const timeSinceLastEvent = Date.now() - this.lastEventReceivedAt
      if (timeSinceLastEvent >= staleThreshold) {
        console.log(
          `[Sync] Fallback poll: No SSE events for ${(timeSinceLastEvent / 1000).toFixed(0)}s, syncing...`,
        )
        void this.performSync()
      }
    }, this.pollFallbackIntervalMs)
  }

  private stopPollFallback() {
    if (this.pollFallbackTimer) {
      clearInterval(this.pollFallbackTimer)
      this.pollFallbackTimer = null
    }
  }

  stop() {
    this.clearCatchUpTimer()
    this.pendingSyncRequested = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.commandTimer) {
      clearInterval(this.commandTimer)
      this.commandTimer = null
    }
    this.stopPollFallback()
    this.stopEventStream()
  }

  private async pollCommands() {
    const { enabled, remoteBaseUrl, deviceToken } = this.getSyncConfig()
    if (!enabled || !remoteBaseUrl || !deviceToken) return

    try {
      const response = await fetch(`${remoteBaseUrl.replace(/\/+$/, "")}/api/devices/commands`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${deviceToken}`,
          "User-Agent": "Facenox-Desktop-Command-Poll",
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) return

      const { commands } = (await response.json()) as { commands: DeviceCommand[] }
      if (!commands || commands.length === 0) return

      console.log(`[RemoteMgmt] Found ${commands.length} pending commands.`)

      for (const cmd of commands) {
        await this.executeCommand(cmd)
      }
    } catch (error) {
      console.warn("[RemoteMgmt] Command polling failed:", error)
    }
  }

  private async executeCommand(cmd: DeviceCommand) {
    console.log(`[RemoteMgmt] Executing command: ${cmd.command} (${cmd.id})`)
    let status = "completed"
    let result: CommandResult

    try {
      switch (cmd.command) {
        case "WIPE": {
          console.warn("[RemoteMgmt] REMOTE DATA WIPE RECEIVED. Executing programmatically.")

          const wipeResponse = await fetch(`${backendService.getUrl()}/attendance/wipe`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            signal: AbortSignal.timeout(60000),
          })
          if (!wipeResponse.ok) {
            throw new Error(`Wipe failed on local backend: ${wipeResponse.status}`)
          }
          result = (await wipeResponse.json()) as CommandResult
          console.warn("[RemoteMgmt] LOCAL DATA WIPE COMPLETED.")

          const { dialog } = await import("electron")
          const parentWindow = state.mainWindow ?? undefined
          const options: Electron.MessageBoxOptions = {
            type: "info",
            title: "Data Wiped",
            message: "A remote wipe has been executed on this device.",
            detail:
              "All local database tables and biometric keys have been successfully erased by the organization administrator.",
            buttons: ["OK"],
          }
          if (parentWindow) {
            dialog.showMessageBox(parentWindow, options).catch(() => {})
          } else {
            dialog.showMessageBox(options).catch(() => {})
          }
          break
        }

        case "UPGRADE": {
          console.log("[RemoteMgmt] Executing remote update check...")
          const updateInfo = await checkForUpdates(true) // force check
          if (updateInfo.hasUpdate) {
            notifyRenderer(state.mainWindow, updateInfo)
            result = {
              message: `Update found: v${updateInfo.latestVersion}. Notified local operator.`,
              latestVersion: updateInfo.latestVersion,
              hasUpdate: true,
            }
          } else {
            result = {
              message: "Device is already up to date.",
              latestVersion: updateInfo.latestVersion,
              hasUpdate: false,
            }
          }
          break
        }

        default:
          console.warn(`[RemoteMgmt] Unknown command: ${cmd.command}`)
          status = "failed"
          result = { error: "Unknown command" }
      }
    } catch (error) {
      console.error(`[RemoteMgmt] Command ${cmd.command} failed:`, error)
      status = "failed"
      result = { error: error instanceof Error ? error.message : String(error) }
    }

    // Acknowledge command execution back to dashboard
    try {
      const { remoteBaseUrl, deviceToken } = this.getSyncConfig()
      await fetch(`${remoteBaseUrl.replace(/\/+$/, "")}/api/devices/commands/ack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deviceToken}`,
        },
        body: JSON.stringify({
          commandId: cmd.id,
          status,
          result,
        }),
        signal: AbortSignal.timeout(10000),
      })
    } catch (error) {
      console.warn("[RemoteMgmt] Failed to acknowledge command:", error)
    }
  }

  async performSync() {
    if (this.isSyncing) {
      // Queue a follow-up sync instead of silently dropping this request.
      // Prevents missed updates from SSE events or manual triggers that
      // arrive while a sync is already in-flight.
      this.pendingSyncRequested = true
      return {
        success: false,
        message: "A sync is already running. Queued for re-sync.",
      }
    }

    const { enabled, remoteBaseUrl, siteId, deviceId, deviceToken } = this.getSyncConfig()

    if (!remoteBaseUrl || !siteId || !deviceId || !deviceToken) {
      this.stop()
      this.setLastSyncState({
        lastSyncStatus: "error",
        lastSyncMessage: "Connect this desktop to Facenox Cloud before syncing.",
      })
      return {
        success: false,
        message: "Device connection is incomplete.",
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
      const { lastSyncedAt } = this.getSyncConfig()
      let exportUrl = `${backendService.getUrl()}/attendance/export`
      if (lastSyncedAt) {
        exportUrl += `?since=${encodeURIComponent(lastSyncedAt)}`
      }

      const response = await fetch(exportUrl, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        signal: AbortSignal.timeout(60000),
      })

      if (!response.ok) {
        throw new Error(`Local export failed: HTTP ${response.status}`)
      }

      const rawAttendanceExport = (await response.json()) as Record<string, unknown>
      const attendanceExport = normalizeAttendanceExportForRemote(rawAttendanceExport)
      const exportedAt =
        typeof attendanceExport?.exported_at === "string" ?
          attendanceExport.exported_at
        : new Date().toISOString()

      // Export and encrypt face embeddings for cross-device sync
      let faceEmbeddings: SyncPushPayload["attendance_export"]["face_embeddings"] = []
      const { encryptionKey } = this.getSyncConfig()
      if (encryptionKey) {
        try {
          const embUrl = `${backendService.getUrl()}/attendance/export-embeddings`
          const embResponse = await fetch(embUrl, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            signal: AbortSignal.timeout(30000),
          })
          if (embResponse.ok) {
            const embData = (await embResponse.json()) as {
              embeddings?: Array<{
                person_id: string
                embedding_bytes: string
                embedding_dimension: number
              }>
            }
            if (embData.embeddings) {
              faceEmbeddings = embData.embeddings.map((e) => ({
                person_id: e.person_id,
                embedding_encrypted: encryptEmbedding(
                  Uint8Array.from(atob(e.embedding_bytes), (c) => c.charCodeAt(0)),
                  encryptionKey,
                ),
                embedding_dimension: e.embedding_dimension,
              }))
            }
          }
        } catch (err) {
          console.warn("[Sync] Failed to export embeddings:", err)
        }
      }

      const syncPayload: SyncPushPayload = {
        schema_version: 1 as const,
        snapshot_id: `${deviceId}:${exportedAt}`,
        device_id: deviceId,
        site_id: siteId,
        app_version: getCurrentVersion(),
        exported_at: exportedAt,
        attendance_export: {
          ...attendanceExport,
          face_embeddings: faceEmbeddings.length > 0 ? faceEmbeddings : undefined,
        },
      }
      const validatedPayload = syncPushSchema.parse(syncPayload)

      const remoteResponse = await fetch(`${remoteBaseUrl.replace(/\/+$/, "")}/api/sync/push`, {
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

      const responseText = await remoteResponse.text()
      let responsePayload: Record<string, unknown> | null = null
      if (responseText) {
        try {
          responsePayload = JSON.parse(responseText) as Record<string, unknown>
        } catch {
          responsePayload = null
        }
      }

      if (remoteResponse.status === 429) {
        let retryAfterMs = 5000
        if (typeof responsePayload?.retryAfterMs === "number" && responsePayload.retryAfterMs > 0) {
          retryAfterMs = responsePayload.retryAfterMs
        } else {
          const retryHeader = remoteResponse.headers.get("Retry-After")
          if (retryHeader) {
            const parsedSeconds = parseInt(retryHeader, 10)
            if (!Number.isNaN(parsedSeconds) && parsedSeconds > 0) {
              retryAfterMs = parsedSeconds * 1000
            }
          }
        }

        console.log(
          `[Sync] Push throttled by server. Scheduling automatic silent retry in ${retryAfterMs}ms.`,
        )

        // Reschedule debounced sync silently without flagging UI as fatal error
        this.triggerDebouncedSync(retryAfterMs)

        return {
          success: true,
          message: `Sync queued (throttled). Retrying in ${Math.ceil(retryAfterMs / 1000)}s...`,
          syncedAt: this.getSyncConfig().lastSyncedAt || undefined,
        }
      }

      if (!remoteResponse.ok) {
        let detail =
          typeof responsePayload?.error === "string" ?
            responsePayload.error
          : responseText || `HTTP ${remoteResponse.status}`

        if (detail.startsWith("Sync rejected: ")) {
          detail = detail.replace("Sync rejected: ", "")
        }

        throw new Error(`Sync failed: ${detail}`)
      }

      console.log("[Sync] Background sync successful.")

      // Process Remote Policy from Dashboard
      if (responsePayload?.policy && typeof responsePayload.policy === "object") {
        const policy = responsePayload.policy as {
          forceLiveness?: boolean
          trackCheckout?: boolean
          lateThresholdEnabled?: boolean
          lateThresholdMinutes?: number
          attendanceCooldownSeconds?: number
          dataRetentionDays?: number
        }
        if (typeof policy.forceLiveness === "boolean") {
          persistentStore.set("sync.policy.forceLiveness", policy.forceLiveness)
        }
        if (typeof policy.trackCheckout === "boolean") {
          persistentStore.set("sync.policy.trackCheckout", policy.trackCheckout)
        }
        if (typeof policy.lateThresholdEnabled === "boolean") {
          persistentStore.set("sync.policy.lateThresholdEnabled", policy.lateThresholdEnabled)
        }
        if (typeof policy.lateThresholdMinutes === "number") {
          persistentStore.set("sync.policy.lateThresholdMinutes", policy.lateThresholdMinutes)
        }
        if (typeof policy.attendanceCooldownSeconds === "number") {
          persistentStore.set(
            "sync.policy.attendanceCooldownSeconds",
            policy.attendanceCooldownSeconds,
          )
        }
        if (typeof policy.dataRetentionDays === "number") {
          // Cloud data retention policy only informs cloud dashboard retention, preserving local SQLite permanence
          persistentStore.set("sync.policy.dataRetentionDays", policy.dataRetentionDays)
        }
      }
      const syncedAt = new Date().toISOString()

      // Automatically pull metadata (groups & members) from cloud dashboard
      let pullMsg = ""
      let pullFailed = false
      try {
        console.log("[Sync] Triggering automatic metadata pull sync...")
        const pullResponse = await fetch(`${remoteBaseUrl.replace(/\/+$/, "")}/api/sync/pull`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${deviceToken}`,
            "User-Agent": "Facenox-Desktop-Pull",
          },
          signal: AbortSignal.timeout(30000),
        })

        if (pullResponse.ok) {
          const pullPayload = (await pullResponse.json()) as {
            groups: Array<Record<string, unknown>>
            members: Array<Record<string, unknown>>
            face_embeddings?: Array<FaceEmbedding>
          }

          const importResponse = await fetch(
            `${backendService.getUrl()}/attendance/import-metadata`,
            {
              method: "POST",
              headers: authHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({
                groups: pullPayload.groups,
                members: pullPayload.members,
              }),
              signal: AbortSignal.timeout(30000),
            },
          )

          if (importResponse.ok) {
            const importResult = (await importResponse.json()) as {
              success?: boolean
              groups_count: number
              members_count: number
            }
            pullMsg = ` Pulled ${importResult.groups_count} groups, ${importResult.members_count} members.`
            console.log(`[Sync] Automatic metadata pull completed.${pullMsg}`)
            state.mainWindow?.webContents.send("sync:data-changed")

            // Import face embeddings from cloud using batch endpoint
            const { encryptionKey } = this.getSyncConfig()
            if (encryptionKey && pullPayload.face_embeddings?.length) {
              const batchEmbeddings: Array<{
                person_id: string
                embedding_bytes: string
                embedding_dimension: number
              }> = []
              let consecutiveDecryptFailures = 0
              const MAX_CONSECUTIVE_DECRYPT_FAILURES = 3

              for (const fe of pullPayload.face_embeddings) {
                try {
                  const rawBytes = decryptEmbedding(fe.embedding_encrypted, encryptionKey)
                  consecutiveDecryptFailures = 0
                  const b64 = Buffer.from(rawBytes).toString("base64")
                  batchEmbeddings.push({
                    person_id: fe.person_id,
                    embedding_bytes: b64,
                    embedding_dimension: fe.embedding_dimension,
                  })
                } catch (err) {
                  consecutiveDecryptFailures++
                  console.warn(`[Sync] Failed to decrypt embedding for ${fe.person_id}:`, err)

                  if (consecutiveDecryptFailures >= MAX_CONSECUTIVE_DECRYPT_FAILURES) {
                    console.error(
                      `[Sync] Aborting embedding import: ${MAX_CONSECUTIVE_DECRYPT_FAILURES} consecutive decryption failures. Possible encryption key mismatch.`,
                    )
                    pullMsg += " Embedding sync aborted: encryption key may be invalid."
                    break
                  }
                }
              }

              if (batchEmbeddings.length > 0) {
                try {
                  const embBatchResponse = await fetch(
                    `${backendService.getUrl()}/attendance/import-embeddings-batch`,
                    {
                      method: "POST",
                      headers: authHeaders({ "Content-Type": "application/json" }),
                      body: JSON.stringify({ embeddings: batchEmbeddings }),
                      signal: AbortSignal.timeout(30000),
                    },
                  )
                  const embBatchResult = await embBatchResponse.json()
                  if (embBatchResponse.ok && embBatchResult.imported_count > 0) {
                    pullMsg += ` Imported ${embBatchResult.imported_count} face embeddings.`
                    console.log(`[Sync] ${pullMsg}`)
                  } else if (!embBatchResponse.ok) {
                    console.warn("[Sync] import-embeddings-batch failed:", embBatchResult)
                  }
                } catch (batchErr) {
                  console.warn("[Sync] Failed to post batch embeddings:", batchErr)
                }
              }
            }
          } else {
            pullMsg = " Metadata pull succeeded but local import failed."
            pullFailed = true
            console.warn("[Sync] Automatic local metadata import failed.")
          }
        } else {
          pullMsg = " Remote metadata pull failed."
          pullFailed = true
          console.warn("[Sync] Automatic remote metadata pull failed.")
        }
      } catch (pullError) {
        pullMsg = ` Metadata pull error: ${pullError instanceof Error ? pullError.message : "unknown"}`
        pullFailed = true
        console.warn("[Sync] Automatic metadata pull failed:", pullError)
      }

      const syncStatus = pullFailed ? "error" : "success"
      const syncMessage =
        pullFailed ? `Snapshot synced but:${pullMsg}`
        : typeof responsePayload?.status === "string" ?
          `Snapshot ${responsePayload.status}.${pullMsg}`
        : `Snapshot synced successfully.${pullMsg}`

      this.setLastSyncState({
        lastSyncedAt: syncedAt,
        lastSyncStatus: syncStatus,
        lastSyncMessage: syncMessage,
      })

      return {
        success: !pullFailed,
        message: syncMessage,
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

      // If another sync was requested while we were busy, run it now.
      if (this.pendingSyncRequested) {
        this.pendingSyncRequested = false
        console.log("[Sync] Running queued follow-up sync.")
        void this.performSync()
      }
    }
  }

  triggerDebouncedSync(delayMs = 3000) {
    const { enabled } = this.getSyncConfig()
    if (!enabled) {
      return
    }

    console.log(`[Sync] Debounced sync triggered. Delaying execution by ${delayMs}ms.`)
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.performSync()
    }, delayMs)
  }
}

export const syncManager = new BackgroundSyncManager()
