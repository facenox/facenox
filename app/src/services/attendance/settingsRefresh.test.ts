import { beforeEach, expect, it, vi } from "vitest"
import { AttendanceManager } from "../AttendanceManager"
import { HttpClient } from "./HttpClient"

vi.mock("@/utils/syncNotifier", () => ({ notifyDataChanged: vi.fn() }))
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

it("refreshes backend settings explicitly while retaining normal cached reads", async () => {
  const get = vi
    .spyOn(HttpClient.prototype, "get")
    .mockResolvedValue({ attendance_timezone: "Asia/Manila" })
  const manager = new AttendanceManager()
  await manager.getSettings()
  get.mockResolvedValue({ attendance_timezone: "Australia/Sydney" })
  expect((await manager.getSettings()).attendance_timezone).toBe("Asia/Manila")
  expect((await manager.getSettings({ forceRefresh: true })).attendance_timezone).toBe(
    "Australia/Sydney",
  )
  expect((await manager.getSettings()).attendance_timezone).toBe("Australia/Sydney")
  expect(get).toHaveBeenCalledTimes(2)
})

it("rejects a failed explicit refresh without erasing cached settings", async () => {
  const get = vi
    .spyOn(HttpClient.prototype, "get")
    .mockResolvedValue({ attendance_timezone: "Asia/Manila" })
  const manager = new AttendanceManager()
  await manager.getSettings()
  get.mockRejectedValue(new Error("Backend offline"))
  await expect(manager.getSettings({ forceRefresh: true })).rejects.toThrow("Backend offline")
  expect((await manager.getSettings()).attendance_timezone).toBe("Asia/Manila")
})

it("does not let an older refresh overwrite the newest cached timezone", async () => {
  const old = deferred<{ attendance_timezone: string }>()
  const get = vi
    .spyOn(HttpClient.prototype, "get")
    .mockResolvedValue({ attendance_timezone: "Asia/Manila" })
  const manager = new AttendanceManager()
  await manager.getSettings()
  get
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ attendance_timezone: "Australia/Sydney" })
  const first = manager.getSettings({ forceRefresh: true })
  await manager.getSettings({ forceRefresh: true })
  old.resolve({ attendance_timezone: "America/Toronto" })
  await first
  expect((await manager.getSettings()).attendance_timezone).toBe("Australia/Sydney")
})

it("does not let an older GET replace settings saved by a later PUT", async () => {
  const old = deferred<{ attendance_timezone: string }>()
  vi.spyOn(HttpClient.prototype, "get").mockReturnValue(old.promise)
  vi.spyOn(HttpClient.prototype, "put").mockResolvedValue({
    attendance_timezone: "Australia/Sydney",
  })
  const manager = new AttendanceManager()
  const read = manager.getSettings({ forceRefresh: true })
  await manager.updateSettings({ attendance_timezone: "Australia/Sydney" })
  old.resolve({ attendance_timezone: "Asia/Manila" })
  await read
  expect((await manager.getSettings()).attendance_timezone).toBe("Australia/Sydney")
})
