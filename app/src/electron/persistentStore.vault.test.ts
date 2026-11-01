// @vitest-environment node
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ dir: "", disk: {} as Record<string, unknown> }))
vi.mock("electron", () => ({
  app: { getPath: () => state.dir },
  safeStorage: { isEncryptionAvailable: () => false },
}))
vi.mock("./util.js", () => ({ default: () => false }))
vi.mock("electron-store", () => ({
  default: class {
    get(key: string) {
      return state.disk[key]
    }
    set(key: string, value: unknown) {
      state.disk[key] = value
    }
    delete(key: string) {
      delete state.disk[key]
    }
    clear() {
      state.disk = {}
    }
    get store() {
      return state.disk
    }
  },
}))

const keyPath = () => path.join(state.dir, "data", ".machine_key")
beforeEach(() => {
  vi.resetModules()
  state.disk = {}
  state.dir = fs.mkdtempSync(path.join(os.tmpdir(), "facenox-vault-test-"))
})
afterEach(() => {
  vi.restoreAllMocks()
})

it("rejects failed key writes without storing credentials or caching a temporary key", async () => {
  const originalWrite = fs.writeFileSync
  const write = vi.spyOn(fs, "writeFileSync").mockImplementation((file, ...args) => {
    if (String(file) === keyPath())
      throw Object.assign(new Error("permission denied"), { code: "EACCES" })
    return originalWrite(file, ...args)
  })
  const vault = await import("./persistentStore")
  expect(() => vault.requireSecretStorage()).toThrow("Secure credential storage is unavailable")
  expect(() => vault.persistentStore.set("sync.deviceToken", "token")).toThrow()
  expect(state.disk["sync.deviceToken"]).toBeUndefined()
  expect(fs.existsSync(keyPath())).toBe(false)
  write.mockRestore()
  vault.persistentStore.set("sync.deviceToken", "token")
  vi.resetModules()
  expect((await import("./persistentStore")).persistentStore.get("sync.deviceToken")).toBe("token")
})

it("preserves an existing key and credentials after a transient read failure", async () => {
  const first = await import("./persistentStore")
  first.persistentStore.set("sync.deviceToken", "token")
  const originalKey = fs.readFileSync(keyPath())
  const originalCredential = state.disk["sync.deviceToken"]
  vi.resetModules()
  const originalRead = fs.readFileSync
  const read = vi.spyOn(fs, "readFileSync").mockImplementation((file, ...args) => {
    if (String(file) === keyPath())
      throw Object.assign(new Error("transient read failure"), { code: "EIO" })
    return originalRead(file, ...args)
  })
  const restarted = await import("./persistentStore")
  expect(() => restarted.persistentStore.get("sync.deviceToken")).toThrow()
  read.mockRestore()
  expect(fs.readFileSync(keyPath())).toEqual(originalKey)
  expect(state.disk["sync.deviceToken"]).toBe(originalCredential)
  expect(restarted.persistentStore.get("sync.deviceToken")).toBe("token")
})

it("rejects an invalid existing key without replacing it", async () => {
  fs.mkdirSync(path.dirname(keyPath()), { recursive: true })
  fs.writeFileSync(keyPath(), "invalid-key")
  const vault = await import("./persistentStore")
  expect(() => vault.persistentStore.set("sync.deviceToken", "token")).toThrow()
  expect(fs.readFileSync(keyPath(), "utf8")).toBe("invalid-key")
  expect(state.disk["sync.deviceToken"]).toBeUndefined()
})

it("does not create a replacement key when decrypting credentials whose key is missing", async () => {
  const first = await import("./persistentStore")
  first.persistentStore.set("sync.deviceToken", "token")
  const credential = state.disk["sync.deviceToken"]
  fs.unlinkSync(keyPath())
  vi.resetModules()
  const restarted = await import("./persistentStore")
  expect(() => restarted.persistentStore.get("sync.deviceToken")).toThrow()
  expect(fs.existsSync(keyPath())).toBe(false)
  expect(state.disk["sync.deviceToken"]).toBe(credential)
})

it("uses a key created concurrently instead of overwriting it", async () => {
  const originalWrite = fs.writeFileSync
  const concurrentKey = Buffer.alloc(32, 7)
  vi.spyOn(fs, "writeFileSync").mockImplementation((file, ...args) => {
    if (String(file) === keyPath()) {
      originalWrite(file, concurrentKey)
      throw Object.assign(new Error("already exists"), { code: "EEXIST" })
    }
    return originalWrite(file, ...args)
  })
  const vault = await import("./persistentStore")
  expect(vault.getVaultKey()).toEqual(concurrentKey)
  expect(fs.readFileSync(keyPath())).toEqual(concurrentKey)
})
