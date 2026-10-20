import Store from "electron-store"
import { safeStorage } from "electron"
import path from "path"
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

export function requireSecretStorage() {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
  ) {
    throw new Error(
      "Secure OS credential storage is unavailable. Unlock/configure the system keyring before connecting Cloud.",
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
    // Migrate the existing plaintext credential when first accessed after app readiness.
    rawStore.set(key, protectedPrefix + safeStorage.encryptString(value).toString("base64"))
    return value
  },
  set(key, value) {
    if (secretKeys.has(key) && typeof value === "string" && value) {
      requireSecretStorage()
      rawStore.set(key, protectedPrefix + safeStorage.encryptString(value).toString("base64"))
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
