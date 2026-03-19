import { ipcMain, dialog } from "electron"
import fs from "node:fs/promises"
import crypto from "node:crypto"
import os from "node:os"

import { backendService } from "../backendService.js"
import { syncManager } from "../managers/BackgroundSyncManager.js"
import { persistentStore } from "../persistentStore.js"
import { getCurrentVersion } from "../updater.js"
import {
  DEFAULT_CLOUD_BASE_URL,
  DEFAULT_SYNC_INTERVAL_MINUTES,
} from "../../services/cloudSyncDefaults.js"

function authHeaders(extra: Record<string, string> = {}) {
  const token = backendService.getToken()
  return token ? { "X-Atracana-Token": token, ...extra } : { ...extra }
}

function normalizeCloudBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "")
}

function resolveCloudBaseUrl(value: string): string {
  return normalizeCloudBaseUrl(value) || DEFAULT_CLOUD_BASE_URL
}

function getCloudSyncStatus() {
  const cloudBaseUrl = resolveCloudBaseUrl(
    (persistentStore.get("sync.cloudBaseUrl") as string) || "",
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
    | "idle"
    | "success"
    | "error"
    | undefined) ?? "idle") as "idle" | "success" | "error"
  const lastSyncMessage = (persistentStore.get("sync.lastSyncMessage") as string | null) || null

  return {
    enabled,
    cloudBaseUrl,
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
    connected: Boolean(cloudBaseUrl && organizationId && siteId && deviceId && deviceToken),
  }
}

function clearCloudConnection() {
  persistentStore.set("sync.enabled", false)
  persistentStore.set("sync.organizationId", "")
  persistentStore.set("sync.organizationName", "")
  persistentStore.set("sync.siteId", "")
  persistentStore.set("sync.siteName", "")
  persistentStore.set("sync.deviceId", "")
  persistentStore.set("sync.deviceToken", "")
  persistentStore.set("sync.lastSyncedAt", null)
}

// Cryptographic Constants
const ATRACANA_MAGIC = Buffer.from("ATRACANA\x00\x01") // 6 bytes
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
function encryptVault(plaintext: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(SALT_SIZE)
  const iv = crypto.randomBytes(IV_SIZE)
  const key = deriveKey(password, salt)

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag() // 16 bytes

  return Buffer.concat([ATRACANA_MAGIC, salt, iv, tag, ciphertext])
}

// Decrypt
function decryptVault(blob: Buffer, password: string): Buffer {
  const magicLen = ATRACANA_MAGIC.length
  const minLen = magicLen + SALT_SIZE + IV_SIZE + TAG_SIZE + 1

  if (blob.length < minLen) {
    throw new Error("File is too short to be a valid .atracana vault.")
  }

  const magic = blob.subarray(0, magicLen)
  if (!crypto.timingSafeEqual(magic, ATRACANA_MAGIC)) {
    throw new Error("Invalid file format. This file is not a Atracana vault (.atracana).")
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

// IPC Registration
export function registerSyncHandlers() {
  ipcMain.handle("sync:restart-manager", () => {
    const status = getCloudSyncStatus()
    if (status.enabled && status.connected) {
      syncManager.start()
    } else {
      syncManager.stop()
    }
    return {
      success: true,
      config: getCloudSyncStatus(),
    }
  })

  ipcMain.handle("sync:trigger-now", async () => {
    return await syncManager.performSync()
  })

  ipcMain.handle("sync:get-config", () => {
    return getCloudSyncStatus()
  })

  ipcMain.handle("sync:update-config", async (_event, updates: Record<string, unknown> = {}) => {
    if (typeof updates.cloudBaseUrl === "string") {
      persistentStore.set("sync.cloudBaseUrl", resolveCloudBaseUrl(updates.cloudBaseUrl))
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

    const status = getCloudSyncStatus()
    if (status.enabled && status.connected) {
      syncManager.start()
    } else {
      syncManager.stop()
    }

    return status
  })

  ipcMain.handle(
    "sync:pair-device",
    async (
      _event,
      input: {
        cloudBaseUrl?: string
        pairingCode?: string
        deviceName?: string
      } = {},
    ) => {
      const cloudBaseUrl = resolveCloudBaseUrl(input.cloudBaseUrl || "")
      const pairingCode = (input.pairingCode || "").trim()
      const deviceName = (input.deviceName || "").trim() || os.hostname()

      if (!pairingCode) {
        return {
          success: false,
          error: "Pairing code is required.",
        }
      }

      try {
        const response = await fetch(`${cloudBaseUrl}/api/device/pair`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Atracana-Version": getCurrentVersion(),
            "User-Agent": "Atracana-Desktop-Pair",
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
              : `Pairing failed with HTTP ${response.status}.`,
          }
        }

        persistentStore.set("sync.cloudBaseUrl", cloudBaseUrl)
        persistentStore.set("sync.organizationId", String(payload?.organizationId ?? ""))
        persistentStore.set("sync.organizationName", String(payload?.organizationName ?? ""))
        persistentStore.set("sync.siteId", String(payload?.siteId ?? ""))
        persistentStore.set("sync.siteName", String(payload?.siteName ?? ""))
        persistentStore.set("sync.deviceId", String(payload?.deviceId ?? ""))
        persistentStore.set("sync.deviceName", deviceName)
        persistentStore.set("sync.deviceToken", String(payload?.deviceToken ?? ""))
        persistentStore.set("sync.enabled", true)
        persistentStore.set("sync.lastSyncedAt", null)
        persistentStore.set("sync.lastSyncStatus", "idle")
        persistentStore.set("sync.lastSyncMessage", "Device paired. Starting initial sync...")

        syncManager.start({ skipCatchUp: true })
        const initialSyncResult = await syncManager.performSync()

        return {
          success: true,
          config: getCloudSyncStatus(),
          initialSyncSucceeded: initialSyncResult.success,
          message:
            initialSyncResult.success ?
              "Device paired and initial sync completed."
            : `Device paired, but the initial sync failed. Local attendance still works. ${initialSyncResult.message}`,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Pairing failed.",
        }
      }
    },
  )

  ipcMain.handle("sync:disconnect-device", async () => {
    const status = getCloudSyncStatus()
    let warning: string | null = null

    if (status.connected) {
      try {
        const response = await fetch(`${status.cloudBaseUrl}/api/device/unpair`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${persistentStore.get("sync.deviceToken") as string}`,
            "X-Atracana-Version": getCurrentVersion(),
            "User-Agent": "Atracana-Desktop-Unpair",
          },
          body: JSON.stringify({
            device_id: status.deviceId,
          }),
          signal: AbortSignal.timeout(30000),
        })

        if (!response.ok && ![401, 404].includes(response.status)) {
          const text = await response.text()
          warning = text || `Cloud unpair returned HTTP ${response.status}.`
        }
      } catch (error) {
        warning = error instanceof Error ? error.message : "Cloud unpair failed."
      }
    }

    clearCloudConnection()
    persistentStore.set("sync.lastSyncStatus", "idle")
    persistentStore.set(
      "sync.lastSyncMessage",
      warning ?
        `Disconnected locally. Remote warning: ${warning}`
      : "Device disconnected from Atracana Cloud.",
    )
    syncManager.stop()

    return {
      success: true,
      warning,
      config: getCloudSyncStatus(),
    }
  })

  ipcMain.handle("sync:pick-import-file", async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Open Atracana Vault",
        filters: [{ name: "Atracana Vault", extensions: ["atracana"] }],
        properties: ["openFile"],
        buttonLabel: "Open Vault",
      })

      if (canceled || filePaths.length === 0) {
        return { canceled: true }
      }

      return { canceled: false, filePath: filePaths[0] }
    } catch (error) {
      console.error("[Vault] Picking file failed:", error)
      return {
        canceled: true,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle("sync:export-data", async (_event, password?: string) => {
    try {
      if (!password) {
        throw new Error("Password is required to export vault.")
      }

      const exportUrl = `${backendService.getUrl()}/vault/export`
      const exportRes = await fetch(exportUrl, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        signal: AbortSignal.timeout(60_000),
      })

      if (!exportRes.ok) {
        const errText = await exportRes.text()
        throw new Error(`Vault export failed: HTTP ${exportRes.status} — ${errText}`)
      }

      const vaultPayload = await exportRes.json()

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Save Atracana Vault",
        defaultPath: `atracana-vault-${new Date().toISOString().slice(0, 10)}.atracana`,
        filters: [{ name: "Atracana Vault", extensions: ["atracana"] }],
        buttonLabel: "Save Vault",
      })

      if (canceled || !filePath) return { success: false, canceled: true }

      const plaintext = Buffer.from(JSON.stringify(vaultPayload), "utf-8")
      const encrypted = encryptVault(plaintext, password)
      await fs.writeFile(filePath, encrypted)

      return { success: true, filePath }
    } catch (error) {
      console.error("[Vault] Export failed:", error)
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
          throw new Error("Password is required to restore vault.")
        }

        if (!filePath) {
          throw new Error("File path is required to restore vault.")
        }

        // 3. Read encrypted file and decrypt
        const encryptedBlob = await fs.readFile(filePath)
        let plaintext: Buffer
        try {
          plaintext = decryptVault(encryptedBlob, password)
        } catch (decryptErr) {
          return {
            success: false,
            error: decryptErr instanceof Error ? decryptErr.message : "Decryption failed.",
          }
        }

        // 4. Parse vault structure
        const vaultPayload = JSON.parse(plaintext.toString("utf-8"))

        // 5. Send to Python backend for full restoration (attendance + biometrics)
        const importUrl = `${backendService.getUrl()}/vault/import`
        const importRes = await fetch(importUrl, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            version: vaultPayload.version ?? 1,
            exported_at: vaultPayload.exported_at,
            attendance: {
              data: vaultPayload.attendance,
              overwrite_existing: overwrite,
            },
            biometrics: vaultPayload.biometrics ?? [],
          }),
          signal: AbortSignal.timeout(120_000),
        })

        if (!importRes.ok) {
          const err = await importRes.text()
          throw new Error(`Import failed: ${err}`)
        }

        const result = await importRes.json()
        return { success: true, message: result.message }
      } catch (error) {
        console.error("[Vault] Import failed:", error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )
}
