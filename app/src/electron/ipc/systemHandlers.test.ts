// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  openPath: vi.fn(),
  showItemInFolder: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock("electron", () => ({
  ipcMain: {
    handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      mocks.handlers[key] = handler
    },
  },
  shell: {
    openPath: mocks.openPath,
    showItemInFolder: mocks.showItemInFolder,
  },
  app: {
    isPackaged: true,
    getAppPath: () => "install",
  },
}))

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    mkdirSync: mocks.mkdirSync,
    writeFileSync: mocks.writeFileSync,
  },
}))

vi.mock("../paths.js", () => ({
  getDataDirectory: () => "data-dir",
  getLogDirectory: () => "log-dir",
}))

vi.mock("../services/DiagnosticsService.js", () => ({
  diagnosticsService: {
    generateHealthReport: vi.fn(),
    exportReportToDisk: vi.fn(),
  },
}))

import { registerSystemHandlers } from "./systemHandlers.js"

describe("system path handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.existsSync.mockReturnValue(true)
    registerSystemHandlers()
  })

  it("opens the durable data directory", async () => {
    mocks.openPath.mockResolvedValue("")

    await expect(mocks.handlers["system:open-data-dir"]()).resolves.toEqual({
      success: true,
      path: "data-dir",
    })
  })

  it("reports shell errors when a path cannot be opened", async () => {
    mocks.openPath.mockResolvedValue("No associated application")

    await expect(mocks.handlers["system:open-log-file"]()).resolves.toEqual({
      success: false,
      path: expect.stringContaining("facenox.log"),
      error: "No associated application",
    })
    expect(mocks.showItemInFolder).toHaveBeenCalled()
  })
})
