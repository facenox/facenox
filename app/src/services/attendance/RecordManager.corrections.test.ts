import { expect, it, vi } from "vitest"
import { RecordManager } from "./RecordManager"
import type { HttpClient } from "./HttpClient"
import { notifyDataChanged } from "@/utils"

vi.mock("@/utils", () => ({
  getLocalDateString: vi.fn(),
  parseLocalDate: vi.fn(),
  notifyDataChanged: vi.fn(),
}))

function setup() {
  const put = vi.fn().mockResolvedValue({ check_in_time: null, check_out_time: null })
  const manager = new RecordManager(
    { put } as unknown as HttpClient,
    { sessions: "/sessions" },
    (date) => date.toISOString(),
    vi.fn(),
    vi.fn(),
  )
  return { manager, put }
}

it("preserves explicit null times and the visit number when sending an undo", async () => {
  const { manager, put } = setup()
  const result = await manager.updateSession("alice", "2026-11-01", {
    status: "absent",
    check_in_time: null,
    check_out_time: null,
    visit_number: 2,
  })
  expect(put).toHaveBeenCalledWith("/sessions/alice/2026-11-01", {
    status: "absent",
    check_in_time: null,
    check_out_time: null,
    visit_number: 2,
  })
  expect(result.check_in_time).toBeUndefined()
  expect(result.check_out_time).toBeUndefined()
  expect(notifyDataChanged).toHaveBeenCalledOnce()
})

it("omits unedited timestamps from a notes-only correction", async () => {
  const { manager, put } = setup()
  await manager.updateSession("alice", "2026-11-01", { notes: "Reviewed" })
  expect(put).toHaveBeenCalledWith("/sessions/alice/2026-11-01", { notes: "Reviewed" })
})

it("serializes edited instants without dropping an explicit checkout clear", async () => {
  const { manager, put } = setup()
  await manager.updateSession("alice", "2026-11-01", {
    check_in_time: new Date("2026-11-01T13:00:27Z"),
    check_out_time: null,
  })
  expect(put).toHaveBeenCalledWith("/sessions/alice/2026-11-01", {
    check_in_time: "2026-11-01T13:00:27.000Z",
    check_out_time: null,
  })
})
