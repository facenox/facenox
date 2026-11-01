// @vitest-environment node
import fs from "node:fs/promises"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AutoExportManager } from "./AutoExportManager"
import type { AutoExportConfig, SessionRecord } from "./AutoExportManager"

const state = vi.hoisted(() => ({ disk: {} as Record<string, unknown> }))
vi.mock("../persistentStore.js", () => ({
  persistentStore: {
    get: (key: string) => state.disk[key],
    set: (key: string, value: unknown) => {
      state.disk[key] = value
    },
  },
}))
vi.mock("../backendService.js", () => ({
  backendService: {
    getUrl: () => "http://127.0.0.1:7400",
    getToken: () => "test-token",
  },
}))
vi.mock("electron", () => ({
  app: { getPath: () => "C:/TestReports" },
  Notification: class {
    static isSupported() {
      return false
    }
  },
  powerSaveBlocker: { start: () => 1, stop: () => {}, isStarted: () => true },
}))

const member = { id: "m", person_id: "p", name: "Test Member", group_id: "g" }
function mockBackend(
  sessions: SessionRecord[],
  options: {
    failed?: string
    mode?: string
    timezone?: string
    secondGroupFails?: boolean
  } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (options.failed && url.includes(options.failed)) return { ok: false, status: 500 }
      if (options.secondGroupFails && url.includes("/groups/other/members"))
        throw new Error("network error")
      return {
        ok: true,
        json: async () => {
          if (url.includes("/settings"))
            return { attendance_timezone: options.timezone ?? "Asia/Manila" }
          if (url.includes("/members")) return [member]
          if (url.includes("/sessions")) return sessions
          const groups = [
            {
              id: "g",
              name: "Group",
              is_active: true,
              settings: { attendance_mode: options.mode ?? "visits", class_end_time: "17:00" },
            },
          ]
          if (options.secondGroupFails) groups.push({ ...groups[0], id: "other", name: "Other" })
          return groups
        },
      }
    }),
  )
}
beforeEach(() => {
  state.disk = {}
  vi.spyOn(fs, "mkdir").mockResolvedValue(undefined)
  vi.spyOn(fs, "writeFile").mockResolvedValue(undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each<AutoExportConfig["format"]>(["excel_workbook", "individual_csvs", "combined_csv"])(
  "exports every visit in order in %s",
  async (format) => {
    mockBackend([
      {
        id: "s2",
        person_id: "p",
        group_id: "g",
        date: "2026-01-02",
        visit_number: 2,
        status: "present",
        notes: "SECOND VISIT",
        total_hours: 3,
      },
      {
        id: "s1",
        person_id: "p",
        group_id: "g",
        date: "2026-01-02",
        visit_number: 1,
        status: "present",
        notes: "FIRST VISIT",
        total_hours: 2,
      },
    ])
    const manager = new AutoExportManager()
    manager.updateConfig({ format })
    expect(await manager.triggerExport("2026-01-02")).toBe(true)
    const output = String(vi.mocked(fs.writeFile).mock.calls[0][1])
    expect(output).toContain("Visit")
    expect(output).toContain("FIRST VISIT")
    expect(output).toContain("SECOND VISIT")
    expect(output).toContain("2h")
    expect(output).toContain("3h")
    expect(output.indexOf("FIRST VISIT")).toBeLessThan(output.indexOf("SECOND VISIT"))
    expect(output.match(/Test Member/g)).toHaveLength(2)
  },
)

it.each(["/attendance/groups", "/attendance/settings", "/members", "/attendance/sessions"])(
  "does not write or mark the day complete after a failed %s fetch and allows retry",
  async (failed) => {
    mockBackend([], { failed })
    const manager = new AutoExportManager()
    expect(await manager.triggerExport("2026-01-02")).toBe(false)
    expect(manager.getConfig().lastExportedDate).toBeNull()
    expect(fs.writeFile).not.toHaveBeenCalled()
    mockBackend([])
    expect(await manager.triggerExport("2026-01-02")).toBe(true)
    expect(manager.getConfig().lastExportedDate).toBe("2026-01-02")
    expect(String(vi.mocked(fs.writeFile).mock.calls[0][1])).toContain("Absent")
  },
)

it("does not silently export only the first group if the second group fails", async () => {
  mockBackend([], { secondGroupFails: true })
  const manager = new AutoExportManager()
  expect(await manager.triggerExport("2026-01-02")).toBe(false)
  expect(manager.getConfig().lastExportedDate).toBeNull()
  expect(fs.writeFile).not.toHaveBeenCalled()
})

it.each([false, true])(
  "formats times and departure using %s captured-zone preference or configured fallback",
  async (captured) => {
    mockBackend(
      [
        {
          id: "s",
          person_id: "p",
          group_id: "g",
          date: "2026-01-02",
          status: "present",
          check_in_time: "2026-01-02T13:00:00Z",
          check_out_time: "2026-01-02T23:00:00Z",
          ...(captured ?
            {
              check_in_time_timezone: "America/New_York",
              check_out_time_timezone: "America/New_York",
            }
          : {}),
        },
      ],
      { mode: "work_hours", timezone: captured ? "Asia/Manila" : "America/New_York" },
    )
    const manager = new AutoExportManager()
    expect(await manager.triggerExport("2026-01-02")).toBe(true)
    const xml = String(vi.mocked(fs.writeFile).mock.calls[0][1])
    const time = (instant: string) =>
      new Date(instant).toLocaleTimeString([], {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
      })
    expect(xml).toContain(time("2026-01-02T13:00:00Z"))
    expect(xml).toContain(time("2026-01-02T23:00:00Z"))
    expect(xml).toContain("Overtime")
  },
)
