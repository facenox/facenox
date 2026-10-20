// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"
const { handlers, data } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
  data: {} as Record<string, unknown>,
}))
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) => {
      handlers[name] = handler
    },
  },
}))
vi.mock("../persistentStore.js", () => ({
  persistentStore: {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value
    },
    delete: (key: string) => {
      delete data[key]
    },
    clear: () => {
      for (const key of Object.keys(data)) delete data[key]
    },
    get store() {
      return data
    },
  },
}))
import { registerStoreHandlers } from "./storeHandlers"
beforeEach(() => {
  for (const key of Object.keys(data)) delete data[key]
  data.sync = {
    deviceToken: "secret",
    encryptionKey: "key",
    pendingUpload: { sensitive: true },
    commandReceipts: { receipt: true },
    organizationId: "org",
    enabled: true,
  }
  registerStoreHandlers()
})
it("redacts credentials and recovery state from all renderer read paths", () => {
  expect(handlers["store:get"](null, "sync")).toEqual({ organizationId: "org", enabled: true })
  expect(handlers["store:get"](null, "sync.deviceToken")).toBeUndefined()
  expect(handlers["store:getAll"]()).toEqual({ sync: { organizationId: "org", enabled: true } })
})
it("prevents generic IPC from replacing Cloud credentials, identity or policy", () => {
  for (const key of [
    "sync",
    "sync.deviceToken",
    "sync.policy.forceLiveness",
    "sync.remoteBaseUrl",
  ]) {
    expect(() => handlers["store:set"](null, key, "changed")).toThrow()
    expect(() => handlers["store:delete"](null, key)).toThrow()
  }
})
it("rejects root and alternate property-path reads and writes", () => {
  for (const key of [
    "",
    ".",
    "sync..deviceToken",
    "sync[deviceToken]",
    "sync\\.deviceToken",
    "__proto__",
  ]) {
    expect(() => handlers["store:get"](null, key)).toThrow("Invalid settings key")
    expect(() => handlers["store:set"](null, key, {})).toThrow("Invalid settings key")
    expect(() => handlers["store:delete"](null, key)).toThrow("Invalid settings key")
  }
})
it("preserves recovery state and connection when resetting UI preferences", () => {
  const sync = data.sync
  data.theme = "light"
  handlers["store:reset"]()
  expect(data.sync).toEqual(sync)
  expect(data.theme).toBeUndefined()
})
