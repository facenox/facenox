import Ably from "ably"
import { type SyncPushPayload, type FaceEmbedding } from "../../shared/syncContract.js"
import { withLocalBackendHeaders } from "../localBackendScope.js"
import { persistentStore } from "../persistentStore.js"
import { backendService } from "../backendService.js"
import { state } from "../State.js"
import { getCurrentVersion, checkForUpdates, notifyRenderer } from "../updater.js"
import { decryptEmbedding, encryptEmbedding } from "./EmbeddingCrypto.js"
import { buildSyncChunks } from "./syncChunks.js"
import { parseAblyTokenRequest } from "./ablyTokenRequest.js"
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
            },
      }
    }),
    members: members.map((member) => {
      const candidate = typeof member === "object" && member !== null ? member : {}
      const personId = String((candidate as { person_id?: unknown }).person_id || "")
      const id = String((candidate as { id?: unknown }).id || personId)
      return {
        ...candidate,
        id,
        person_id: personId,
        group_id: String((candidate as { group_id?: unknown }).group_id || "default"),
        joined_at:
          toRemoteIsoDateTime((candidate as { joined_at?: unknown }).joined_at) ??
          new Date().toISOString(),
      }
    }),
    records: records.map((record) => {
      const candidate = typeof record === "object" && record !== null ? record : {}
      const personId = String((candidate as { person_id?: unknown }).person_id || "")
      const memberId = String((candidate as { member_id?: unknown }).member_id || personId)
      return {
        ...candidate,
        person_id: personId,
        member_id: memberId,
        timestamp:
          toRemoteIsoDateTime((candidate as { timestamp?: unknown }).timestamp) ??
          new Date().toISOString(),
      }
    }),
    sessions: sessions.map((session) => {
      const candidate = typeof session === "object" && session !== null ? session : {}
      const personId = String((candidate as { person_id?: unknown }).person_id || "")
      const memberId = String((candidate as { member_id?: unknown }).member_id || personId)
      return {
        ...candidate,
        person_id: personId,
        member_id: memberId,
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

interface SyncAcknowledgements {
  groups: Record<string, number>
  members: Record<string, number>
  faces: Record<string, number>
  accepted: {
    groups: Record<string, number>
    members: Record<string, number>
    faces: Record<string, number>
  }
}
function emptyAcknowledgements(): SyncAcknowledgements {
  return { groups: {}, members: {}, faces: {}, accepted: { groups: {}, members: {}, faces: {} } }
}

export class BackgroundSyncManager {
  private timer: NodeJS.Timeout | null = null
  private commandTimer: NodeJS.Timeout | null = null
  private catchUpTimer: NodeJS.Timeout | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private ablyClient: Ably.Realtime | null = null
  private ablyChannel: Ably.RealtimeChannel | null = null
  private isSyncing = false
  private isPollingCommands = false
  private isWiping = false
  /** When true, a sync will be re-triggered once the current one finishes. */
  private pendingSyncRequested = false
  private pendingPullRequested = false
  private suspended = false
  private abortController: AbortController | null = null
  private idlePromise: Promise<void> = Promise.resolve()
  private finishSync: (() => void) | null = null

  private requestSignal(timeout: number) {
    return this.abortController ?
        AbortSignal.any([this.abortController.signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout)
  }

  async suspend() {
    this.suspended = true
    this.stop()
    this.abortController?.abort()
    await this.idlePromise
    while (this.isPollingCommands) await new Promise((resolve) => setTimeout(resolve, 20))
  }

  private getSyncConfig() {
    let deviceToken: string
    let encryptionKey = ""
    try {
      deviceToken = (persistentStore.get("sync.deviceToken") as string) || ""
      encryptionKey = (persistentStore.get("sync.encryptionKey") as string) || ""
    } catch (error) {
      // Keyring failure pauses Cloud, not offline attendance or application startup.
      this.setLastSyncState({
        lastSyncStatus: "error",
        lastSyncMessage:
          error instanceof Error ? error.message : "Cloud credentials are unavailable.",
      })
      deviceToken = ""
    }
    return {
      enabled: persistentStore.get("sync.enabled") as boolean,
      remoteBaseUrl:
        (persistentStore.get("sync.remoteBaseUrl") as string) || DEFAULT_REMOTE_BASE_URL,
      siteId: (persistentStore.get("sync.siteId") as string) || "",
      deviceId: (persistentStore.get("sync.deviceId") as string) || "",
      deviceToken,
      encryptionKey,
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

  private async applyRemotePolicy(policy?: Record<string, unknown> | null) {
    if (!policy || typeof policy !== "object") return

    if (typeof policy.timezone === "string") {
      // Apply the administrator-confirmed site clock to attendance, never to
      // the OS clock. Persist in the backend for offline scans and restarts.
      const response = await fetch(`${backendService.getUrl()}/attendance/settings`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ attendance_timezone: policy.timezone }),
      })
      if (!response.ok) throw new Error("Could not apply the location attendance timezone.")
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
      persistentStore.set("sync.policy.attendanceCooldownSeconds", policy.attendanceCooldownSeconds)
    }
    if (typeof policy.minCheckoutDelayMinutes === "number") {
      persistentStore.set("sync.policy.minCheckoutDelayMinutes", policy.minCheckoutDelayMinutes)
    }
    if (typeof policy.dataRetentionDays === "number") {
      persistentStore.set("sync.policy.dataRetentionDays", policy.dataRetentionDays)
    }
    if (typeof policy.allowKioskDirectoryManagement === "boolean") {
      persistentStore.set(
        "sync.policy.allowKioskDirectoryManagement",
        policy.allowKioskDirectoryManagement,
      )
    }

    // Broadcast the updated policy immediately so the UI reflects locks without delay
    state.mainWindow?.webContents.send("sync:data-changed")
  }

  private initRealtimeListener() {
    this.teardownRealtimeListener()

    const { enabled, remoteBaseUrl, siteId, deviceToken } = this.getSyncConfig()
    if (!enabled || !remoteBaseUrl || !siteId || !deviceToken) {
      return
    }

    try {
      const cleanBaseUrl = remoteBaseUrl.replace(/\/+$/, "")
      console.log(`[Ably] Initializing realtime sync connection for site:${siteId}...`)

      this.ablyClient = new Ably.Realtime({
        authCallback: async (_data, callback) => {
          try {
            const res = await fetch(`${cleanBaseUrl}/api/sync/ably-token`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${deviceToken}`,
                "User-Agent": "Facenox-Desktop-Ably",
              },
              signal: AbortSignal.timeout(15000),
            })

            if (!res.ok) {
              throw new Error(`Ably token request failed: HTTP ${res.status}`)
            }

            const tokenRequest = parseAblyTokenRequest(await res.json())
            callback(null, tokenRequest)
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            console.warn("[Ably] Failed to fetch token request from cloud:", errorMsg)
            callback(errorMsg, null)
          }
        },
        autoConnect: true,
      })

      this.ablyClient.connection.on("connected", () => {
        console.log(
          `[Ably] Realtime connected. Listening on site:${siteId} for instant cloud sync.`,
        )
      })

      this.ablyClient.connection.on("disconnected", () => {
        console.log("[Ably] Realtime disconnected. Reconnecting automatically...")
      })

      this.ablyClient.connection.on("failed", (stateChange) => {
        console.warn("[Ably] Realtime connection failed:", stateChange.reason)
      })

      this.ablyChannel = this.ablyClient.channels.get(`site:${siteId}`)

      // 1. Listen for instant remote management commands (e.g., WIPE, UPGRADE)
      this.ablyChannel.subscribe("remote_command", (message) => {
        const payload = message?.data as { deviceId?: string; command?: string } | undefined
        const currentDeviceId = this.getSyncConfig().deviceId
        if (payload?.deviceId && payload.deviceId !== currentDeviceId) {
          return
        }
        console.log("[Ably] Instant remote command notification received from cloud:", message.data)
        void this.pollCommands()
      })

      // 2. Listen for realtime metadata and attendance sync triggers
      this.ablyChannel.subscribe("sync_required", (message) => {
        const payload = message?.data as
          { deviceId?: string; source?: string; type?: string } | undefined
        const currentDeviceId = this.getSyncConfig().deviceId
        // Ignore self-echo when this device pushes attendance to prevent infinite sync loops
        if (
          payload?.source === "device_push" &&
          payload?.deviceId &&
          payload.deviceId === currentDeviceId
        ) {
          return
        }
        console.log("[Ably] Realtime sync notification received from cloud:", message.data)
        // Remote notifications only download. They must not broadcast another push.
        void this.performSync(true)
      })
    } catch (err) {
      console.warn("[Ably] Failed to initialize Ably realtime client:", err)
    }
  }

  private teardownRealtimeListener() {
    if (this.ablyChannel) {
      try {
        this.ablyChannel.unsubscribe()
      } catch {
        // ignore
      }
      this.ablyChannel = null
    }

    if (this.ablyClient) {
      try {
        this.ablyClient.close()
      } catch {
        // ignore
      }
      this.ablyClient = null
    }
  }

  start(options: { skipCatchUp?: boolean } = {}) {
    this.suspended = false
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

    if (!options.skipCatchUp && this.shouldRunCatchUpSync(intervalMinutes, lastSyncedAt)) {
      console.log("[Sync] Scheduling a catch-up sync because the device is overdue.")
      this.scheduleCatchUpSync()
    }

    // Initialize instant realtime Ably push listener
    this.initRealtimeListener()

    // Initial command poll on startup
    void this.pollCommands()

    // Fallback background command polling (every 15 minutes as safety net for offline recovery)
    this.commandTimer = setInterval(
      () => {
        void this.pollCommands()
      },
      15 * 60 * 1000,
    )
  }

  stop() {
    this.clearCatchUpTimer()
    this.teardownRealtimeListener()
    this.pendingSyncRequested = false
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
  }

  private async pollCommands() {
    const { enabled, remoteBaseUrl, deviceToken } = this.getSyncConfig()
    if (this.suspended || !enabled || !remoteBaseUrl || !deviceToken) return
    if (this.isPollingCommands) return
    this.isPollingCommands = true

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
        if (this.suspended) break
        await this.executeCommand(cmd)
      }
    } catch (error) {
      console.warn("[RemoteMgmt] Command polling failed:", error)
    } finally {
      this.isPollingCommands = false
    }
  }

  private async executeCommand(cmd: DeviceCommand) {
    console.log(`[RemoteMgmt] Executing command: ${cmd.command} (${cmd.id})`)
    const receiptKey = `sync.commandReceipts.${cmd.id}`
    const previous = persistentStore.get(receiptKey) as
      { status: string; result: CommandResult } | undefined
    if (previous) {
      await this.acknowledgeCommand(cmd.id, previous.status, previous.result)
      return
    }
    // Persist intent before any side effect. If the process dies mid-command,
    // report an indeterminate outcome rather than repeating a destructive wipe.
    persistentStore.set(receiptKey, {
      status: "failed",
      result: { error: "Command interrupted; outcome unknown. Operator review required." },
    })
    let status = "completed"
    let result: CommandResult

    try {
      switch (cmd.command) {
        case "WIPE": {
          console.warn("[RemoteMgmt] REMOTE DATA WIPE RECEIVED. Executing programmatically.")
          this.isWiping = true
          try {
            this.abortController?.abort()
            await this.idlePromise
            const wipeResponse = await fetch(`${backendService.getUrl()}/attendance/wipe`, {
              method: "POST",
              headers: authHeaders({ "Content-Type": "application/json" }),
              signal: AbortSignal.timeout(60000),
            })
            if (!wipeResponse.ok) {
              throw new Error(`Wipe failed on local backend: ${wipeResponse.status}`)
            }
            // A durable upload is local data too. Never replay it after a wipe.
            persistentStore.set("sync.pendingUpload", null)
            persistentStore.set("sync.pendingAcknowledgements", null)
            persistentStore.set("sync.lastSyncedAt", null)
            result = (await wipeResponse.json().catch(() => ({ success: true }))) as CommandResult
          } finally {
            this.isWiping = false
          }
          console.warn("[RemoteMgmt] LOCAL DATA WIPE COMPLETED.")

          const { dialog } = await import("electron")
          const parentWindow = state.mainWindow ?? undefined
          const options: Electron.MessageBoxOptions = {
            type: "info",
            title: "Data wiped",
            message: "A remote wipe has been executed on this device.",
            detail:
              "Local attendance records and enrolled face templates were removed at the organization administrator's request.",
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

        case "RESET_PIN": {
          console.warn(
            "[RemoteMgmt] REMOTE PIN RESET RECEIVED. Resetting admin PIN and unlocking kiosk.",
          )
          const security = (persistentStore.get("security") as Record<string, unknown>) || {}
          persistentStore.set("security", {
            ...security,
            adminPin: "1234",
            adminPinEnabled: false,
            lockoutUntil: 0,
            failedAttempts: 0,
          })
          state.mainWindow?.webContents.send("security:pin-reset", {
            adminPin: "1234",
            adminPinEnabled: false,
          })
          result = {
            message: "PIN reset to default (1234) and lock disabled.",
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

    persistentStore.set(receiptKey, { status, result })
    await this.acknowledgeCommand(cmd.id, status, result)
  }

  private async acknowledgeCommand(commandId: string, status: string, result: CommandResult) {
    try {
      const { remoteBaseUrl, deviceToken } = this.getSyncConfig()
      const response = await fetch(
        `${remoteBaseUrl.replace(/\/+$/, "")}/api/devices/commands/ack`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deviceToken}`,
          },
          body: JSON.stringify({
            commandId,
            status,
            result,
          }),
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!response.ok) throw new Error(`Command acknowledgement failed: HTTP ${response.status}`)
    } catch (error) {
      console.warn("[RemoteMgmt] Failed to acknowledge command:", error)
    }
  }

  private async pullMetadata(
    acknowledged: SyncAcknowledgements = emptyAcknowledgements(),
  ): Promise<{ success: boolean; message: string }> {
    const { remoteBaseUrl, deviceToken, encryptionKey } = this.getSyncConfig()
    if (!remoteBaseUrl || !deviceToken) {
      return { success: false, message: "Missing remote connection configuration." }
    }

    try {
      console.log("[Sync] Triggering automatic metadata pull sync with cursor pagination...")
      let currentCursor: string | null = null
      let hasMorePages = true
      let pageCount = 0
      const MAX_PAGES = 100 // Up to 25,000 members safely bounded

      let accumulatedGroupsCount = 0
      let accumulatedMembersCount = 0
      let accumulatedEmbeddingsCount = 0
      let totalDecryptFailures = 0

      while (hasMorePages && pageCount < MAX_PAGES) {
        pageCount++
        let pullUrl = `${remoteBaseUrl.replace(/\/+$/, "")}/api/sync/pull?limit=250`
        if (currentCursor) {
          pullUrl += `&cursor=${encodeURIComponent(currentCursor)}`
        }

        const pullResponse = await fetch(pullUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${deviceToken}`,
            "User-Agent": "Facenox-Desktop-Pull",
            "X-Facenox-Sync-Version": "2",
          },
          signal: this.requestSignal(30000),
        })

        if (!pullResponse.ok) {
          console.warn(
            `[Sync] Automatic remote metadata pull failed on page ${pageCount}: HTTP`,
            pullResponse.status,
          )
          return {
            success: false,
            message: ` Remote metadata pull failed on page ${pageCount} (HTTP ${pullResponse.status}).`,
          }
        }

        const pullPayload = (await pullResponse.json()) as {
          schema_version: number
          removed_group_ids?: string[]
          removed_member_ids?: string[]
          groups: Array<Record<string, unknown>>
          members: Array<Record<string, unknown>>
          face_embeddings?: Array<FaceEmbedding>
          policy?: Record<string, unknown>
          has_more?: boolean
          next_cursor?: string | null
        }

        if (pullPayload.schema_version !== 2)
          throw new Error("Cloud must be updated before this desktop can sync safely.")
        if (pullPayload.policy && pageCount === 1) {
          await this.applyRemotePolicy(pullPayload.policy)
        }

        const importResponse = await fetch(
          `${backendService.getUrl()}/attendance/import-metadata`,
          {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              groups: pullPayload.groups || [],
              members: pullPayload.members || [],
              prune_missing: false,
              acknowledged_groups: acknowledged.groups,
              acknowledged_members: acknowledged.members,
              accepted_groups: acknowledged.accepted.groups,
              accepted_members: acknowledged.accepted.members,
              removed_group_ids: pullPayload.removed_group_ids || [],
              removed_member_ids: pullPayload.removed_member_ids || [],
            }),
            signal: this.requestSignal(30000),
          },
        )

        if (!importResponse.ok) {
          console.warn(`[Sync] Automatic local metadata import failed on page ${pageCount}.`)
          return {
            success: false,
            message: ` Metadata pull succeeded on page ${pageCount} but local import failed.`,
          }
        }

        const importResult = (await importResponse.json()) as {
          success?: boolean
          groups_count: number
          members_count: number
        }
        accumulatedGroupsCount += importResult.groups_count || 0
        accumulatedMembersCount += importResult.members_count || 0

        // Import face embeddings from cloud using batch endpoint for this page
        if (pullPayload.face_embeddings?.length) {
          const batchEmbeddings: Array<{
            person_id: string
            embedding_bytes: string
            embedding_dimension: number
            is_deleted: boolean
            sync_revision: number
            acknowledged_version?: number
            accepted_revision?: number
          }> = []

          for (const fe of pullPayload.face_embeddings) {
            try {
              if (!fe.is_deleted && !encryptionKey) throw new Error("Missing face encryption key.")
              const rawBytes =
                fe.is_deleted ?
                  new Uint8Array()
                : decryptEmbedding(fe.embedding_encrypted, encryptionKey)
              const b64 = Buffer.from(rawBytes).toString("base64")
              batchEmbeddings.push({
                person_id: fe.person_id,
                embedding_bytes: b64,
                embedding_dimension: fe.embedding_dimension,
                is_deleted: fe.is_deleted,
                sync_revision: fe.sync_revision,
                acknowledged_version: acknowledged.faces[fe.person_id],
                accepted_revision: acknowledged.accepted.faces[fe.person_id],
              })
            } catch (err) {
              totalDecryptFailures++
              console.warn(`[Sync] Failed to decrypt embedding for ${fe.person_id}:`, err)
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
                  signal: this.requestSignal(30000),
                },
              )
              if (!embBatchResponse.ok)
                throw new Error(`Face import failed: HTTP ${embBatchResponse.status}`)
              const embBatchResult = (await embBatchResponse.json()) as {
                imported_count?: number
                failed_count?: number
              }
              accumulatedEmbeddingsCount += embBatchResult.imported_count || 0
              totalDecryptFailures += embBatchResult.failed_count || 0
            } catch (batchErr) {
              console.warn("[Sync] Failed to post batch embeddings:", batchErr)
              totalDecryptFailures += batchEmbeddings.length
            }
          }
        }

        if (pullPayload.has_more && pullPayload.next_cursor) {
          currentCursor = pullPayload.next_cursor
          hasMorePages = true
        } else {
          hasMorePages = false
        }
      }

      if (hasMorePages) throw new Error("Cloud roster exceeds the page limit; sync is incomplete.")
      let pullMsg = ` Pulled ${accumulatedGroupsCount} groups, ${accumulatedMembersCount} members.`
      if (accumulatedEmbeddingsCount > 0) {
        pullMsg += ` Imported ${accumulatedEmbeddingsCount} face embeddings.`
      }
      if (totalDecryptFailures > 0) {
        pullMsg += ` ${totalDecryptFailures} face profiles could not be imported; retry or review sync conflicts.`
      }

      console.log(
        `[Sync] Automatic metadata pull completed (${pageCount} page${pageCount > 1 ? "s" : ""}).${pullMsg}`,
      )
      state.mainWindow?.webContents.send("sync:data-changed")

      return { success: totalDecryptFailures === 0, message: pullMsg }
    } catch (pullError) {
      const errMsg = pullError instanceof Error ? pullError.message : "unknown"
      console.warn("[Sync] Automatic metadata pull failed:", pullError)
      return { success: false, message: ` Metadata pull error: ${errMsg}` }
    }
  }

  async performSync(pullOnly = false) {
    if (this.isWiping) return { success: false, message: "Sync is paused during a data wipe." }
    if (this.suspended) return { success: false, message: "Sync is paused for disconnect." }
    if (this.isSyncing) {
      if (pullOnly) this.pendingPullRequested = true
      else this.pendingSyncRequested = true
      return { success: false, message: "A sync is already running. Queued for re-sync." }
    }
    const config = this.getSyncConfig()
    const { remoteBaseUrl, siteId, deviceId, deviceToken, lastSyncedAt } = config
    let encryptionKey = config.encryptionKey
    if (!remoteBaseUrl || !siteId || !deviceId || !deviceToken)
      return { success: false, message: "Device connection is incomplete." }
    this.isSyncing = true
    this.abortController = new AbortController()
    this.idlePromise = new Promise((resolve) => {
      this.finishSync = resolve
    })
    type PendingUpload = {
      deviceId: string
      siteId: string
      remoteBaseUrl: string
      exportedAt: string
      chunks: SyncPushPayload[]
      next: number
      acknowledged: SyncAcknowledgements
    }
    let pending = persistentStore.get("sync.pendingUpload") as PendingUpload | undefined
    if (
      pending &&
      (pending.deviceId !== deviceId ||
        pending.siteId !== siteId ||
        pending.remoteBaseUrl !== remoteBaseUrl)
    ) {
      // Never upload a previous organization's data to a new connection.
      pending = undefined
      persistentStore.set("sync.pendingUpload", null)
    }
    const acknowledged =
      pending?.acknowledged ??
      (persistentStore.get("sync.pendingAcknowledgements") as SyncAcknowledgements | undefined) ??
      emptyAcknowledgements()
    let pushError: string | null = null
    let exportedAt: string | null = null
    let pushed = false
    let conflicts = 0
    let keyError: string | null = null
    try {
      if (!encryptionKey) {
        try {
          const keyResponse = await fetch(`${remoteBaseUrl.replace(/\/+$/, "")}/api/device/key`, {
            headers: { Authorization: `Bearer ${deviceToken}` },
            signal: this.requestSignal(15000),
          })
          if (keyResponse.ok) {
            const keyPayload = (await keyResponse.json()) as {
              siteId?: string
              encryptionKey?: string | null
            }
            if (keyPayload.encryptionKey) {
              if (
                keyPayload.siteId !== siteId ||
                Buffer.from(keyPayload.encryptionKey, "base64").length !== 32
              ) {
                throw new Error("Cloud returned an invalid site key.")
              }
              persistentStore.set("sync.encryptionKey", keyPayload.encryptionKey)
              encryptionKey = keyPayload.encryptionKey
            }
          } else if (keyResponse.status !== 404) {
            throw new Error(`Could not retrieve the site key: HTTP ${keyResponse.status}`)
          }
        } catch (error) {
          // A key-service failure must not hold non-biometric attendance hostage.
          keyError = error instanceof Error ? error.message : "Face sync key unavailable."
        }
      }
      if (!pullOnly) {
        try {
          if (!pending) {
            const exportUrl = `${backendService.getUrl()}/attendance/export${lastSyncedAt ? `?since=${encodeURIComponent(lastSyncedAt)}` : ""}`
            const response = await fetch(exportUrl, {
              method: "POST",
              headers: authHeaders({ "Content-Type": "application/json" }),
              signal: this.requestSignal(60000),
            })
            if (!response.ok) throw new Error(`Local export failed: HTTP ${response.status}`)
            const attendance = normalizeAttendanceExportForRemote(
              (await response.json()) as Record<string, unknown>,
            )
            exportedAt = attendance.exported_at
            let faces: NonNullable<SyncPushPayload["attendance_export"]["face_embeddings"]> = []
            if (encryptionKey) {
              const faceResponse = await fetch(
                `${backendService.getUrl()}/attendance/export-embeddings`,
                { method: "POST", headers: authHeaders(), signal: this.requestSignal(30000) },
              )
              if (!faceResponse.ok) throw new Error("Could not export local face changes.")
              const data = (await faceResponse.json()) as {
                embeddings?: Array<{
                  person_id: string
                  embedding_bytes: string
                  embedding_dimension: number
                  is_deleted: boolean
                  sync_revision: number
                  version: number
                }>
              }
              faces = (data.embeddings || []).map((face) => ({
                person_id: face.person_id,
                embedding_dimension: face.embedding_dimension,
                embedding_encrypted:
                  face.is_deleted ? "" : (
                    encryptEmbedding(Buffer.from(face.embedding_bytes, "base64"), encryptionKey)
                  ),
                is_deleted: face.is_deleted,
                sync_revision: face.sync_revision,
                version: face.version,
                sync_dirty: true,
              }))
            }
            const groups = attendance.groups.filter((g) => g.sync_dirty !== false)
            const members = attendance.members.filter((m) => m.sync_dirty !== false)
            const chunks = buildSyncChunks({
              schema_version: 2,
              device_id: deviceId,
              site_id: siteId,
              app_version: getCurrentVersion(),
              exported_at: exportedAt!,
              attendance_export: { ...attendance, groups, members, face_embeddings: faces },
            })
            pending = {
              deviceId,
              siteId,
              remoteBaseUrl,
              exportedAt: exportedAt!,
              chunks,
              next: 0,
              acknowledged,
            }
            persistentStore.set("sync.pendingUpload", pending)
          }
          exportedAt = pending.exportedAt
          for (let i = pending.next; i < pending.chunks.length; i++) {
            const payload = pending.chunks[i]
            const remote = await fetch(`${remoteBaseUrl.replace(/\/+$/, "")}/api/sync/push`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${deviceToken}`,
                "X-Sync-Chunk": pending.chunks.length > 1 ? "true" : "false",
              },
              body: JSON.stringify(payload),
              signal: this.requestSignal(60000),
            })
            const responseText = await remote.text()
            let result: {
              message?: string
              error?: string
              retryAfterMs?: number
              conflicts?: number
              accepted?: SyncAcknowledgements["accepted"]
              policy?: Record<string, unknown>
            } = {}
            try {
              result = JSON.parse(responseText)
            } catch {
              /* HTTP error can contain text. */
            }
            if (remote.status === 429) this.triggerDebouncedSync(result.retryAfterMs || 5000)
            if (!remote.ok)
              throw new Error(
                result.message || result.error || responseText || `HTTP ${remote.status}`,
              )
            for (const g of payload.attendance_export.groups) acknowledged.groups[g.id] = g.version
            for (const m of payload.attendance_export.members)
              acknowledged.members[m.person_id] = m.version
            for (const f of payload.attendance_export.face_embeddings || [])
              acknowledged.faces[f.person_id] = f.version
            if (result.accepted)
              for (const kind of ["groups", "members", "faces"] as const)
                Object.assign(acknowledged.accepted[kind], result.accepted[kind])
            conflicts += result.conflicts || 0
            await this.applyRemotePolicy(result.policy)
            pending.next = i + 1
            pending.acknowledged = acknowledged
            persistentStore.set("sync.pendingUpload", pending)
          }
          pushed = true
        } catch (error) {
          pushError = error instanceof Error ? error.message : "Upload failed."
        }
      }
      // Downloads must remain available during quota/validation/upload failures.
      if (this.suspended) return { success: false, message: "Sync cancelled for disconnect." }
      const pull = await this.pullMetadata(acknowledged)
      const success = !pushError && !keyError && pull.success
      const message = [
        pushError ? `Upload failed: ${pushError}.`
        : pullOnly ? "Cloud updates downloaded."
        : "Snapshot synced.",
        pull.message,
        keyError ? `Face sync needs attention: ${keyError}` : "",
        conflicts ?
          `${conflicts} concurrent changes kept the Cloud revision. Local directory details are recorded in the audit log.`
        : "",
      ]
        .filter(Boolean)
        .join(" ")
      this.setLastSyncState({
        ...(pushed && exportedAt ? { lastSyncedAt: exportedAt } : {}),
        lastSyncStatus: success ? "success" : "error",
        lastSyncMessage: message,
      })
      // A failed face import must not prevent newer attendance from uploading.
      // Keep directory acknowledgements separately until a successful pull.
      persistentStore.set("sync.pendingAcknowledgements", pull.success ? null : acknowledged)
      if (pushed) persistentStore.set("sync.pendingUpload", null)
      return { success, message, syncedAt: pushed ? exportedAt || undefined : undefined }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed."
      if (!this.suspended)
        this.setLastSyncState({ lastSyncStatus: "error", lastSyncMessage: message })
      return { success: false, message }
    } finally {
      this.abortController = null
      this.isSyncing = false
      this.finishSync?.()
      this.finishSync = null
      const full = this.pendingSyncRequested
      const pull = this.pendingPullRequested
      this.pendingSyncRequested = this.pendingPullRequested = false
      if (!this.suspended && (full || pull)) void this.performSync(!full)
    }
  }

  triggerDebouncedSync(delayMs = 3000) {
    const { enabled } = this.getSyncConfig()
    if (!enabled || this.suspended) {
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
