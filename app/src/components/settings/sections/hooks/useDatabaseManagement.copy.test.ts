import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import type { DialogAPI } from "@/components/shared"
import { attendanceManager } from "@/services"
import { useDatabaseManagement } from "./useDatabaseManagement"

vi.mock("@/services", () => ({
  attendanceManager: { purgeAttendanceHistory: vi.fn() },
  backendService: {},
}))
beforeEach(() => {
  vi.mocked(attendanceManager.purgeAttendanceHistory).mockReset()
})

it("keeps deletion behind the matching typed confirmation and reports its local scope", async () => {
  const confirm = vi.fn().mockResolvedValue(true)
  const alert = vi.fn().mockResolvedValue(undefined)
  const dialog = { confirm, alert } as unknown as DialogAPI
  const { result } = renderHook(() => useDatabaseManagement([], undefined, dialog, false))
  await act(() => result.current.handlePurgeHistory())
  expect(confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Delete local attendance history",
      requireTypedConfirmation: {
        label: "To confirm, type DELETE HISTORY",
        value: "DELETE HISTORY",
      },
      message: expect.stringContaining("existing Cloud records are unchanged"),
    }),
  )
  expect(attendanceManager.purgeAttendanceHistory).toHaveBeenCalledTimes(1)
  expect(alert).toHaveBeenCalledWith(expect.objectContaining({ title: "Local history deleted" }))
})

it("does not delete when confirmation is cancelled", async () => {
  const dialog = {
    confirm: vi.fn().mockResolvedValue(false),
    alert: vi.fn(),
  } as unknown as DialogAPI
  const { result } = renderHook(() => useDatabaseManagement([], undefined, dialog, false))
  await act(() => result.current.handlePurgeHistory())
  expect(attendanceManager.purgeAttendanceHistory).not.toHaveBeenCalled()
})

it("reports a deletion failure without a success message", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(attendanceManager.purgeAttendanceHistory).mockRejectedValue(
    new Error("synthetic failure"),
  )
  const alert = vi.fn().mockResolvedValue(undefined)
  const dialog = { confirm: vi.fn().mockResolvedValue(true), alert } as unknown as DialogAPI
  const { result } = renderHook(() => useDatabaseManagement([], undefined, dialog, false))
  await act(() => result.current.handlePurgeHistory())
  expect(alert).toHaveBeenCalledTimes(1)
  expect(alert).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not delete history" }))
})
