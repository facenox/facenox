import { ipcMain, dialog } from "electron"
import fs from "node:fs/promises"
import crypto from "node:crypto"

import { backendService } from "../backendService.js"
import { withLocalBackendHeaders } from "../localBackendScope.js"
import { syncManager } from "../managers/BackgroundSyncManager.js"
import { persistentStore } from "../persistentStore.js"
import { getCurrentVersion } from "../updater.js"
import { state } from "../State.js"
import {
  DEFAULT_REMOTE_BASE_URL,
  DEFAULT_SYNC_INTERVAL_MINUTES,
} from "../../services/syncDefaults.js"

function authHeaders(extra: Record<string, string> = {}) {
  const token = backendService.getToken()
  return withLocalBackendHeaders(token ? { "X-Facenox-Token": token, ...extra } : { ...extra })
}

function normalizeRemoteBaseUrl(value: string): string {
  let url = value.trim().replace(/\/+$/, "")
  if (!url) return ""

  if (!/^https?:\/\//i.test(url)) {
    const isLocal = /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/i.test(
      url,
    )
    url = (isLocal ? "http://" : "https://") + url
  }
  return url
}

function resolveRemoteBaseUrl(value: string): string {
  return normalizeRemoteBaseUrl(value) || DEFAULT_REMOTE_BASE_URL
}

function getRemoteSyncStatus() {
  const remoteBaseUrl = resolveRemoteBaseUrl(
    (persistentStore.get("sync.remoteBaseUrl") as string) || "",
  )
  const organizationId = (persistentStore.get("sync.organizationId") as string) || ""
  const organizationName = (persistentStore.get("sync.organizationName") as string) || ""
  const siteId = (persistentStore.get("sync.siteId") as string) || ""
  const siteName = (persistentStore.get("sync.siteName") as string) || ""
  const deviceId = (persistentStore.get("sync.deviceId") as string) || ""
  const deviceName = (persistentStore.get("sync.deviceName") as string) || ""
  const deviceToken = (persistentStore.get("sync.deviceToken") as string) || ""
  const enabled = Boolean(persistentStore.get("sync.enabled"))
  const intervalMinutes =
    (persistentStore.get("sync.intervalMinutes") as number) || DEFAULT_SYNC_INTERVAL_MINUTES
  const lastSyncedAt = (persistentStore.get("sync.lastSyncedAt") as string | null) || null
  const lastSyncStatus = ((persistentStore.get("sync.lastSyncStatus") as
    "idle" | "success" | "error" | undefined) ?? "idle") as "idle" | "success" | "error"
  const lastSyncMessage = (persistentStore.get("sync.lastSyncMessage") as string | null) || null

  return {
    enabled,
    remoteBaseUrl,
    organizationId,
    organizationName,
    siteId,
    siteName,
    deviceId,
    deviceName,
    intervalMinutes,
    lastSyncedAt,
    lastSyncStatus,
    lastSyncMessage,
    connected: Boolean(remoteBaseUrl && organizationId && siteId && deviceId && deviceToken),
  }
}

function clearRemoteConnection() {
  persistentStore.set("sync.enabled", false)
  persistentStore.set("sync.organizationId", "")
  persistentStore.set("sync.organizationName", "")
  persistentStore.set("sync.siteId", "")
  persistentStore.set("sync.siteName", "")
  persistentStore.set("sync.deviceId", "")
  persistentStore.set("sync.deviceToken", "")
  persistentStore.set("sync.lastSyncedAt", null)
  persistentStore.delete("sync.policy.forceLiveness")
  persistentStore.delete("sync.policy.trackCheckout")
  persistentStore.delete("sync.policy.lateThresholdEnabled")
  persistentStore.delete("sync.policy.lateThresholdMinutes")
  persistentStore.delete("sync.policy.attendanceCooldownSeconds")
  persistentStore.delete("sync.policy.dataRetentionDays")
}

// Cryptographic Constants
const FACENOX_MAGIC = Buffer.from("FACENOX\x00\x01") // 6 bytes
const SALT_SIZE = 16
const IV_SIZE = 12
const TAG_SIZE = 16
const KEY_SIZE = 32 // AES-256
const PBKDF2_ITERS = 480_000
const PBKDF2_DIGEST = "sha256"

// Key Derivation
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERS, KEY_SIZE, PBKDF2_DIGEST)
}

// Encrypt
function encryptBackup(plaintext: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(SALT_SIZE)
  const iv = crypto.randomBytes(IV_SIZE)
  const key = deriveKey(password, salt)

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag() // 16 bytes

  return Buffer.concat([FACENOX_MAGIC, salt, iv, tag, ciphertext])
}

// Decrypt
function decryptBackup(blob: Buffer, password: string): Buffer {
  const magicLen = FACENOX_MAGIC.length
  const minLen = magicLen + SALT_SIZE + IV_SIZE + TAG_SIZE + 1

  if (blob.length < minLen) {
    throw new Error("File is too short to be a valid .facenox backup.")
  }

  const magic = blob.subarray(0, magicLen)
  if (!crypto.timingSafeEqual(magic, FACENOX_MAGIC)) {
    throw new Error("Invalid file format. This file is not a Facenox backup (.facenox).")
  }

  let offset = magicLen
  const salt = blob.subarray(offset, offset + SALT_SIZE)
  offset += SALT_SIZE
  const iv = blob.subarray(offset, offset + IV_SIZE)
  offset += IV_SIZE
  const tag = blob.subarray(offset, offset + TAG_SIZE)
  offset += TAG_SIZE
  const ciphertext = blob.subarray(offset)

  const key = deriveKey(password, salt)

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error("Decryption failed. The password is incorrect or the file is corrupted.")
  }
}

async function getExtendedSyncStatus() {
  const status = getRemoteSyncStatus()
  let unsyncedRecordsCount = 0
  let unsyncedSessionsCount = 0
  try {
    const statsUrl =
      status.lastSyncedAt ?
        `${backendService.getUrl()}/stats?last_synced_at=${encodeURIComponent(status.lastSyncedAt)}`
      : `${backendService.getUrl()}/stats`
    const response = await fetch(statsUrl, {
      method: "GET",
      headers: authHeaders(),
      signal: AbortSignal.timeout(5000),
    })
    if (response.ok) {
      const stats = (await response.json()) as {
        unsynced_records_count?: number
        unsynced_sessions_count?: number
      }
      unsyncedRecordsCount = stats.unsynced_records_count ?? 0
      unsyncedSessionsCount = stats.unsynced_sessions_count ?? 0
    }
  } catch (err) {
    console.warn("[Sync] Failed to fetch unsynced counts:", err)
  }
  return {
    ...status,
    unsyncedRecordsCount,
    unsyncedSessionsCount,
  }
}

// IPC Registration
export function registerSyncHandlers() {
  ipcMain.handle("sync:restart-manager", async () => {
    const status = getRemoteSyncStatus()
    if (status.enabled && status.connected) {
      syncManager.start()
    } else {
      syncManager.stop()
    }
    return {
      success: true,
      config: await getExtendedSyncStatus(),
    }
  })

  ipcMain.handle("sync:trigger-now", async () => {
    return await syncManager.performSync()
  })

  ipcMain.handle("sync:trigger-debounced", () => {
    syncManager.triggerDebouncedSync()
  })

  ipcMain.handle("sync:get-config", async () => {
    return await getExtendedSyncStatus()
  })

  ipcMain.handle("sync:update-config", async (_event, updates: Record<string, unknown> = {}) => {
    if (typeof updates.remoteBaseUrl === "string") {
      persistentStore.set("sync.remoteBaseUrl", resolveRemoteBaseUrl(updates.remoteBaseUrl))
    }

    if (typeof updates.deviceName === "string") {
      persistentStore.set("sync.deviceName", updates.deviceName.trim())
    }

    if (typeof updates.intervalMinutes === "number" && Number.isFinite(updates.intervalMinutes)) {
      persistentStore.set("sync.intervalMinutes", Math.max(1, Math.round(updates.intervalMinutes)))
    }

    if (typeof updates.enabled === "boolean") {
      persistentStore.set("sync.enabled", updates.enabled)
    }

    const status = getRemoteSyncStatus()
    if (status.enabled && status.connected) {
      syncManager.start()
    } else {
      syncManager.stop()
    }

    state.mainWindow?.webContents.send("sync:data-changed")

    return await getExtendedSyncStatus()
  })

  ipcMain.handle(
    "sync:pair-device",
    async (
      _event,
      input: {
        remoteBaseUrl?: string
        pairingCode?: string
        deviceName?: string
      } = {},
    ) => {
      const remoteBaseUrl = resolveRemoteBaseUrl(input.remoteBaseUrl || "")
      const pairingCode = (input.pairingCode || "").trim()
      const deviceName = (input.deviceName || "").trim() || "Facenox Desktop"

      if (!pairingCode) {
        return {
          success: false,
          error: "Pairing code is required.",
        }
      }

      try {
        const response = await fetch(`${remoteBaseUrl}/api/device/pair`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Facenox-Version": getCurrentVersion(),
            "User-Agent": "Facenox-Desktop-Pair",
          },
          body: JSON.stringify({
            pairing_code: pairingCode,
            device_name: deviceName,
            app_version: getCurrentVersion(),
          }),
          signal: AbortSignal.timeout(30000),
        })

        const responseText = await response.text()
        let payload: Record<string, unknown> | null = null
        if (responseText) {
          try {
            payload = JSON.parse(responseText) as Record<string, unknown>
          } catch {
            payload = null
          }
        }

        if (!response.ok) {
          return {
            success: false,
            error:
              typeof payload?.error === "string" ?
                payload.error
              : `Connection failed with HTTP ${response.status}.`,
          }
        }

        persistentStore.set("sync.remoteBaseUrl", remoteBaseUrl)
        persistentStore.set("sync.organizationId", String(payload?.organizationId ?? ""))
        persistentStore.set("sync.organizationName", String(payload?.organizationName ?? ""))
        persistentStore.set("sync.siteId", String(payload?.siteId ?? ""))
        persistentStore.set("sync.siteName", String(payload?.siteName ?? ""))
        persistentStore.set("sync.deviceId", String(payload?.deviceId ?? ""))
        persistentStore.set("sync.deviceName", deviceName)
        persistentStore.set("sync.deviceToken", String(payload?.deviceToken ?? ""))
        persistentStore.set("sync.encryptionKey", String(payload?.encryptionKey ?? ""))
        persistentStore.set("sync.enabled", true)
        persistentStore.set("sync.lastSyncedAt", null)
        persistentStore.set("sync.lastSyncStatus", "idle")
        persistentStore.set("sync.lastSyncMessage", "Device connected. Starting initial sync...")

        // Assign organization_id to existing offline records
        try {
          const assignUrl = `${backendService.getUrl()}/attendance/groups/assign-org-id`
          const assignResponse = await fetch(assignUrl, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            signal: AbortSignal.timeout(10000),
          })
          if (assignResponse.ok) {
            const assignCounts = await assignResponse.json()
            console.log(
              "[Sync] Successfully assigned organization ID to offline records:",
              assignCounts,
            )
          } else {
            console.warn(
              "[Sync] Failed to assign organization ID to offline records:",
              assignResponse.status,
            )
          }
        } catch (assignError) {
          console.warn("[Sync] Error calling assign-org-id backend route:", assignError)
        }

        syncManager.start({ skipCatchUp: true })
        const initialSyncResult = await syncManager.performSync()

        state.mainWindow?.webContents.send("sync:data-changed")

        return {
          success: true,
          config: await getExtendedSyncStatus(),
          initialSyncSucceeded: initialSyncResult.success,
          message:
            initialSyncResult.success ?
              "Device connected and initial sync completed."
            : "Device connected, but the initial sync failed. Check the sync log for details.",
        }
      } catch (error) {
        state.mainWindow?.webContents.send("sync:data-changed")
        return {
          success: false,
          error: error instanceof Error ? error.message : "Connection failed.",
        }
      }
    },
  )

  ipcMain.handle("sync:disconnect-device", async () => {
    const status = getRemoteSyncStatus()
    let warning: string | null = null

    if (status.connected) {
      try {
        const response = await fetch(`${status.remoteBaseUrl}/api/device/unpair`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${persistentStore.get("sync.deviceToken") as string}`,
            "X-Facenox-Version": getCurrentVersion(),
            "User-Agent": "Facenox-Desktop-Unpair",
          },
          body: JSON.stringify({
            device_id: status.deviceId,
          }),
          signal: AbortSignal.timeout(30000),
        })

        if (!response.ok && ![401, 404].includes(response.status)) {
          const text = await response.text()
          warning = text || `Remote disconnect returned HTTP ${response.status}.`
        }
      } catch (error) {
        warning = error instanceof Error ? error.message : "Remote disconnect failed."
      }
    }

    // Reset local database scope to global/offline mode
    try {
      const localUnpairRes = await fetch(`${backendService.getUrl()}/attendance/unpair`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        signal: AbortSignal.timeout(10000),
      })
      if (!localUnpairRes.ok) {
        console.warn("[Sync] Failed to unpair local backend settings:", localUnpairRes.status)
      }
    } catch (localUnpairErr) {
      console.warn("[Sync] Error calling local unpair endpoint:", localUnpairErr)
    }

    clearRemoteConnection()
    persistentStore.set("sync.lastSyncStatus", "idle")
    persistentStore.set(
      "sync.lastSyncMessage",
      warning ?
        `Disconnected locally. Remote warning: ${warning}`
      : "Device disconnected from Facenox Cloud.",
    )
    syncManager.stop()

    state.mainWindow?.webContents.send("sync:data-changed")

    return {
      success: true,
      warning,
      config: await getExtendedSyncStatus(),
    }
  })

  ipcMain.handle("sync:pick-import-file", async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Open Facenox Backup",
        filters: [{ name: "Facenox Backup", extensions: ["facenox"] }],
        properties: ["openFile"],
        buttonLabel: "Open Backup",
      })

      if (canceled || filePaths.length === 0) {
        return { canceled: true }
      }

      return { canceled: false, filePath: filePaths[0] }
    } catch (error) {
      console.error("[Backup] Picking file failed:", error)
      return {
        canceled: true,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle("sync:export-data", async (_event, password?: string) => {
    try {
      if (!password) {
        throw new Error("Password is required to export a backup.")
      }

      const exportUrl = `${backendService.getUrl()}/backup/export`
      const exportRes = await fetch(exportUrl, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        signal: AbortSignal.timeout(60_000),
      })

      if (!exportRes.ok) {
        const errText = await exportRes.text()
        throw new Error(`Backup export failed: HTTP ${exportRes.status}: ${errText}`)
      }

      const backupPayload = await exportRes.json()

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Save Facenox Backup",
        defaultPath: `facenox-backup-${new Date().toISOString().slice(0, 10)}.facenox`,
        filters: [{ name: "Facenox Backup", extensions: ["facenox"] }],
        buttonLabel: "Save Backup",
      })

      if (canceled || !filePath) return { success: false, canceled: true }

      const plaintext = Buffer.from(JSON.stringify(backupPayload), "utf-8")
      const encrypted = encryptBackup(plaintext, password)
      await fs.writeFile(filePath, encrypted)

      return { success: true, filePath }
    } catch (error) {
      console.error("[Backup] Export failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle(
    "sync:import-data",
    async (_event, password?: string, filePath?: string, overwrite = false) => {
      try {
        if (!password) {
          throw new Error("Password is required to restore a backup.")
        }

        if (!filePath) {
          throw new Error("File path is required to restore a backup.")
        }

        // 3. Read encrypted file and decrypt
        const encryptedBlob = await fs.readFile(filePath)
        let plaintext: Buffer
        try {
          plaintext = decryptBackup(encryptedBlob, password)
        } catch (decryptErr) {
          return {
            success: false,
            error: decryptErr instanceof Error ? decryptErr.message : "Decryption failed.",
          }
        }

        // 4. Parse backup structure
        const backupPayload = JSON.parse(plaintext.toString("utf-8"))

        // 5. Send to Python backend for full restoration (attendance + biometrics)
        const importUrl = `${backendService.getUrl()}/backup/import`
        const importRes = await fetch(importUrl, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            version: backupPayload.version ?? 1,
            exported_at: backupPayload.exported_at,
            attendance: {
              data: backupPayload.attendance,
              overwrite_existing: overwrite,
            },
            biometrics: backupPayload.biometrics ?? [],
          }),
          signal: AbortSignal.timeout(120_000),
        })

        if (!importRes.ok) {
          const err = await importRes.text()
          throw new Error(`Import failed: ${err}`)
        }

        const result = (await importRes.json()) as { message?: string }
        return { success: true, message: result.message }
      } catch (error) {
        console.error("[Backup] Import failed:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )
}
