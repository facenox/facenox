// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const { disk, cryptoMock, paths } = vi.hoisted(() => ({
  disk: {} as Record<string, unknown>,
  paths: { dir: "" },
  cryptoMock: {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: vi.fn(() => "gnome_libsecret"),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
    decryptString: vi.fn((value: Buffer) => value.toString().replace(/^encrypted:/, "")),
  },
}))
vi.mock("electron", () => ({ safeStorage: cryptoMock, app: { getPath: () => paths.dir } }))
vi.mock("./util.js", () => ({ default: () => false }))
vi.mock("electron-store", () => ({
  default: class {
    get(key: string) {
      return disk[key]
    }
    set(key: string, value: unknown) {
      disk[key] = value
    }
    delete(key: string) {
      delete disk[key]
    }
    clear() {
      for (const key of Object.keys(disk)) delete disk[key]
    }
    get store() {
      return disk
    }
  },
}))
import { persistentStore } from "./persistentStore"
beforeEach(() => {
  paths.dir = fs.mkdtempSync(path.join(os.tmpdir(), "facenox-store-test-"))
  for (const key of Object.keys(disk)) delete disk[key]
  cryptoMock.isEncryptionAvailable.mockReturnValue(true)
  cryptoMock.getSelectedStorageBackend.mockReturnValue("gnome_libsecret")
})
it("encrypts credentials on write and decrypts only on main-process reads", () => {
  persistentStore.set("sync.deviceToken", "token")
  expect(disk["sync.deviceToken"]).toMatch(/^os:v1:/)
  expect(disk["sync.deviceToken"]).not.toBe("token")
  expect(persistentStore.get("sync.deviceToken")).toBe("token")
})
it("migrates legacy plaintext credentials on first access", () => {
  disk["sync.encryptionKey"] = "legacy-key"
  expect(persistentStore.get("sync.encryptionKey")).toBe("legacy-key")
  expect(disk["sync.encryptionKey"]).toMatch(/^os:v1:/)
})
it("falls back to secure vault encryption when OS storage is unavailable", () => {
  cryptoMock.isEncryptionAvailable.mockReturnValue(false)
  persistentStore.set("sync.deviceToken", "fallback-token")
  expect(disk["sync.deviceToken"]).toMatch(/^vault:v1:/)
  expect(disk["sync.deviceToken"]).not.toBe("fallback-token")
  expect(persistentStore.get("sync.deviceToken")).toBe("fallback-token")
  persistentStore.set("sync.deviceToken", "")
  expect(persistentStore.get("sync.deviceToken")).toBe("")
})
