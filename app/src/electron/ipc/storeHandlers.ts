import { ipcMain } from "electron"
import { persistentStore } from "../persistentStore.js"

export function registerStoreHandlers() {
  const privateSyncKeys = new Set([
    "deviceToken",
    "encryptionKey",
    "pendingUpload",
    "pendingAcknowledgements",
    "commandReceipts",
  ])
  function assertKey(key: unknown): asserts key is string {
    if (
      typeof key !== "string" ||
      /[\\[\]]/.test(key) ||
      key
        .split(".")
        .some((part) => !part.trim() || ["__proto__", "prototype", "constructor"].includes(part))
    ) {
      throw new Error("Invalid settings key.")
    }
  }
  function safeValue(key: string) {
    assertKey(key)
    if (
      [...privateSyncKeys].some(
        (field) => key === `sync.${field}` || key.startsWith(`sync.${field}.`),
      )
    )
      return undefined
    const value = persistentStore.get(key)
    if (key !== "sync" || !value || typeof value !== "object") return value
    return Object.fromEntries(
      Object.entries(value).filter(([field]) => !privateSyncKeys.has(field)),
    )
  }
  function assertWritable(key: string) {
    assertKey(key)
    if (key === "sync" || key.startsWith("sync.")) {
      throw new Error("Cloud credentials and recovery state are managed by the main process.")
    }
  }
  ipcMain.handle("store:get", (_event, key: string) => {
    return safeValue(key)
  })

  ipcMain.handle("store:set", (_event, key: string, value: unknown) => {
    assertWritable(key)
    persistentStore.set(key, value)
    return true
  })

  ipcMain.handle("store:delete", (_event, key: string) => {
    assertWritable(key)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(persistentStore.delete as any)(key)
    return true
  })

  ipcMain.handle("store:getAll", () => {
    return { ...persistentStore.store, sync: safeValue("sync") }
  })

  ipcMain.handle("store:reset", () => {
    // Reset preferences without deleting pairing credentials, pending observations
    // or command receipts. Disconnect is a separate main-process operation.
    const sync = persistentStore.get("sync")
    persistentStore.clear()
    if (sync) persistentStore.set("sync", sync)
    return true
  })
}
