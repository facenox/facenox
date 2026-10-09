// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"
import { AutoExportManager } from "./AutoExportManager.js"
import fs from "node:fs/promises"

const mockStore: Record<string, unknown> = {}

vi.mock("../persistentStore.js", () => ({
  persistentStore: {
    get: vi.fn((key: string) => mockStore[key]),
    set: vi.fn((key: string, val: unknown) => {
      mockStore[key] = val
    }),
  },
}))

vi.mock("../backendService.js", () => ({
  backendService: {
    getUrl: () => "http://127.0.0.1:7400",
    getToken: () => "mock-backend-token",
  },
}))

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:\\MockDocuments"),
  },
  Notification: class {
    static isSupported() {
      return true
    }
    show = vi.fn()
  },
  powerSaveBlocker: {
    start: vi.fn(() => 1),
    stop: vi.fn(),
    isStarted: vi.fn(() => true),
  },
}))

describe("AutoExportManager", () => {
  let manager: AutoExportManager

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key]
    }
    manager = new AutoExportManager()
  })

  it("returns default config when store is empty", () => {
    const config = manager.getConfig()
    expect(config.enabled).toBe(false)
    expect(config.time).toBe("17:00")
    expect(config.format).toBe("excel_workbook")
    expect(config.directory).toBe("")
    expect(config.lastExportedDate).toBeNull()
  })

  it("updates and retrieves configuration", () => {
    manager.updateConfig({
      enabled: true,
      time: "18:30",
      format: "individual_csvs",
      directory: "C:\\CustomReports",
    })

    const config = manager.getConfig()
    expect(config.enabled).toBe(true)
    expect(config.time).toBe("18:30")
    expect(config.format).toBe("individual_csvs")
    expect(config.directory).toBe("C:\\CustomReports")
  })

  it("does not run export if enabled is false", async () => {
    manager.updateConfig({ enabled: false })
    const ran = await manager.checkAndRunExport()
    expect(ran).toBe(false)
  })

  it("successfully performs export and writes Excel XML file", async () => {
    const mkdirSpy = vi.spyOn(fs, "mkdir").mockResolvedValue(undefined)
    const writeFileSpy = vi.spyOn(fs, "writeFile").mockResolvedValue(undefined)

    // Mock fetch for groups, members, and sessions
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/attendance/groups/") && url.includes("/members")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: "m1", person_id: "p1", name: "Alice Johnson", group_id: "g1" }],
        })
      }
      if (url.includes("/attendance/sessions")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: "s1",
              person_id: "p1",
              group_id: "g1",
              date: "2026-10-09",
              check_in_time: "2026-10-09T08:02:00",
              check_out_time: "2026-10-09T17:01:00",
              total_hours: 8.98,
              is_late: false,
              status: "present",
            },
          ],
        })
      }
      if (url.includes("/attendance/groups")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: "g1", name: "Faculty Staff", is_active: true, is_deleted: false },
          ],
        })
      }
      return Promise.reject(new Error(`Unhandled url: ${url}`))
    })

    manager.updateConfig({
      enabled: true,
      directory: "C:\\TestReports",
      format: "excel_workbook",
    })

    const result = await manager.triggerExport("2026-10-09")
    expect(result).toBe(true)
    expect(mkdirSpy).toHaveBeenCalledWith("C:\\TestReports", { recursive: true })
    expect(writeFileSpy).toHaveBeenCalled()

    const writtenCall = writeFileSpy.mock.calls[0]
    expect(writtenCall[0]).toContain("All Groups Attendance (2026-10-09).xls")
    expect(writtenCall[1]).toContain('Worksheet ss:Name="Faculty Staff"')
    expect(writtenCall[1]).toContain("Alice Johnson")

    expect(manager.getConfig().lastExportedDate).toBe("2026-10-09")
  })
})
