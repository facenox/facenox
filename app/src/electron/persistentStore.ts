import Store from "electron-store"
import { app, safeStorage } from "electron"
import path from "node:path"
import fs from "node:fs"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import isDev from "./util.js"
import {
  type PersistentSettingsSchema,
  defaultSettings,
} from "../services/persistentSettingsDefaults.js"

interface TypedStore<T> {
  get(key: string): unknown
  set(key: string, value: unknown): void
  delete(key: string): void
  clear(): void
  store: T
}

const storeOptions: {
  name: string
  defaults: PersistentSettingsSchema
  cwd?: string
  projectName?: string
} = {
  name: "config",
  defaults: defaultSettings,
  projectName: "Facenox",
}

// If in development, isolate the config file from production AppData
if (isDev()) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  // Points to the 'data' folder in the repo root
  storeOptions.cwd = path.join(currentDir, "..", "..", "..", "data")
}

const rawStore: TypedStore<PersistentSettingsSchema> = new Store<PersistentSettingsSchema>(
  storeOptions,
) as unknown as TypedStore<PersistentSettingsSchema>

const secretKeys = new Set(["sync.deviceToken", "sync.encryptionKey"])
const protectedPrefix = "os:v1:"
const vaultPrefix = "vault:v1:"
const IV_LENGTH = 12

export function isSafeStorageUsable(): boolean {
  try {
    return (
      Boolean(safeStorage?.isEncryptionAvailable?.()) &&
      (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text")
    )
  } catch {
    return false
  }
}

function getStoreDir(): string {
  if (storeOptions.cwd) return storeOptions.cwd
  try {
    if (app && typeof app.getPath === "function") {
      return isDev() ?
          path.join(app.getAppPath(), "..", "data")
        : path.join(app.getPath("userData"), "data")
    }
  } catch {
    // fallback
  }
  return path.join(process.cwd(), "data")
}

let cachedVaultKey: Buffer | null = null

export function getVaultKey(): Buffer {
  if (cachedVaultKey) return cachedVaultKey
  const dir = getStoreDir()
  const keyPath = path.join(dir, ".machine_key")
  try {
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath)
      if (raw.length === 32) {
        cachedVaultKey = raw
        return raw
      }
    }
  } catch {
    // continue to create or fallback
  }

  const newKey = crypto.randomBytes(32)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(keyPath, newKey, { mode: 0o600 })
    try {
      fs.chmodSync(keyPath, 0o600)
    } catch {
      // non-posix ignore
    }
    cachedVaultKey = newKey
    return newKey
  } catch {
    cachedVaultKey = newKey
    return newKey
  }
}

export function encryptWithVault(plaintext: string): string {
  const key = getVaultKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${vaultPrefix}${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`
}

export function decryptWithVault(value: string): string {
  const payload = value.slice(vaultPrefix.length)
  const [ivB64, tagB64, dataB64] = payload.split(".")
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid vault credential format.")
  }
  const key = getVaultKey()
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const encrypted = Buffer.from(dataB64, "base64")

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

export function requireSecretStorage() {
  if (isSafeStorageUsable()) return
  try {
    getVaultKey()
  } catch {
    throw new Error(
      "Secure credential storage is unavailable. Unlock/configure the system keyring or ensure local vault directory is writable.",
    )
  }
}

export const persistentStore: TypedStore<PersistentSettingsSchema> = {
  get(key) {
    const value = rawStore.get(key)
    if (!secretKeys.has(key) || typeof value !== "string" || !value) return value
    requireSecretStorage()
    if (value.startsWith(protectedPrefix)) {
      return safeStorage.decryptString(Buffer.from(value.slice(protectedPrefix.length), "base64"))
    }
    if (value.startsWith(vaultPrefix)) {
      return decryptWithVault(value)
    }
    // Migrate legacy plaintext credential when first accessed after app readiness.
    if (isSafeStorageUsable()) {
      rawStore.set(key, protectedPrefix + safeStorage.encryptString(value).toString("base64"))
    } else {
      rawStore.set(key, encryptWithVault(value))
    }
    return value
  },
  set(key, value) {
    if (secretKeys.has(key) && typeof value === "string" && value) {
      requireSecretStorage()
      if (isSafeStorageUsable()) {
        rawStore.set(key, protectedPrefix + safeStorage.encryptString(value).toString("base64"))
      } else {
        rawStore.set(key, encryptWithVault(value))
      }
    } else {
      rawStore.set(key, value)
    }
  },
  delete(key) {
    rawStore.delete(key)
  },
  clear() {
    rawStore.clear()
  },
  get store() {
    return rawStore.store
  },
}
