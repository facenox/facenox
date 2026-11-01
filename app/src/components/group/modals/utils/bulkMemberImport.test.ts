import { expect, it } from "vitest"
import {
  createBulkMemberCheckpoint,
  reconcileBulkMemberRows,
  checkpointBulkMemberResponse,
  remainingBulkMemberText,
} from "./bulkMemberImport"

it("keeps tokens after correcting an unconfirmed row and after reordering unchanged rows", () => {
  const state = createBulkMemberCheckpoint()
  const [alice, bob] = reconcileBulkMemberRows(state, [{ name: "Alice" }, { name: "Bob" }])
  const reordered = reconcileBulkMemberRows(state, [{ name: "Bob" }, { name: "Alice" }])
  expect(reordered.map((r) => r.creationId)).toEqual([bob.creationId, alice.creationId])
  const corrected = reconcileBulkMemberRows(state, [{ name: "Bob" }, { name: "Corrected Alice" }])
  expect(corrected.map((r) => r.creationId)).toEqual([bob.creationId, alice.creationId])
})

it("skips completed entries when the original file is reimported", () => {
  const state = createBulkMemberCheckpoint()
  const rows = reconcileBulkMemberRows(state, [{ name: "Alice" }, { name: "Bob" }])
  checkpointBulkMemberResponse(state, rows, {
    success_count: 1,
    error_count: 1,
    errors: [],
    members: [],
    results: rows.map((r, i) => ({ creation_id: r.creationId, success: i === 0 })),
  })
  const remaining = reconcileBulkMemberRows(state, [{ name: "Alice" }, { name: "Fixed Bob" }], true)
  expect(remaining).toHaveLength(1)
  expect(remaining[0].creationId).toBe(rows[1].creationId)
  expect(state.completed).toHaveLength(1)
})

it("preserves intentional duplicate names as separate row identities", () => {
  const state = createBulkMemberCheckpoint()
  const rows = reconcileBulkMemberRows(state, [{ name: "Alice" }, { name: "Alice" }])
  expect(rows[0].creationId).not.toBe(rows[1].creationId)
  checkpointBulkMemberResponse(state, rows.slice(0, 1), {
    success_count: 1,
    error_count: 0,
    errors: [],
    members: [],
  })
  const remaining = reconcileBulkMemberRows(state, [{ name: "Alice" }, { name: "Alice" }], true)
  expect(remaining).toHaveLength(1)
  expect(remaining[0].creationId).toBe(rows[1].creationId)
  const onePending = reconcileBulkMemberRows(state, [{ name: "Alice" }])
  expect(onePending[0].creationId).toBe(rows[1].creationId)
})

it("does not mistake a corrected pending name for a completed member with that name", () => {
  const state = createBulkMemberCheckpoint()
  const rows = reconcileBulkMemberRows(state, [{ name: "Alice" }, { name: "Bob" }])
  checkpointBulkMemberResponse(state, rows.slice(0, 1), {
    success_count: 1,
    error_count: 0,
    errors: [],
    members: [],
  })
  const corrected = reconcileBulkMemberRows(state, [{ name: "Alice" }])
  expect(corrected).toHaveLength(1)
  expect(corrected[0].creationId).toBe(rows[1].creationId)
})

it("rejects edits to already-completed rows in a reimported file", () => {
  const state = createBulkMemberCheckpoint()
  const rows = reconcileBulkMemberRows(state, [{ name: "Alice" }, { name: "Bob" }])
  checkpointBulkMemberResponse(state, rows.slice(0, 1), {
    success_count: 1,
    error_count: 0,
    errors: [],
    members: [],
  })
  expect(() =>
    reconcileBulkMemberRows(state, [{ name: "Changed Alice" }, { name: "Bob" }], true),
  ).toThrow("Previously added entries cannot be changed")
})

it("keeps failed and unattempted rows, and does not double-count a replayed success", () => {
  const state = createBulkMemberCheckpoint()
  const rows = reconcileBulkMemberRows(state, [
    { name: "Alice" },
    { name: "Bob" },
    { name: "Carol" },
  ])
  const response = { success_count: 1, error_count: 0, errors: [], members: [] }
  checkpointBulkMemberResponse(state, rows.slice(0, 1), response)
  checkpointBulkMemberResponse(state, rows.slice(0, 1), response)
  expect(state.completed).toHaveLength(1)
  expect(state.pending.map((r) => r.name)).toEqual(["Bob", "Carol"])
})

it("serializes remaining names with commas without changing their next parse", () => {
  const state = createBulkMemberCheckpoint()
  reconcileBulkMemberRows(state, [{ name: "Doe, Jane" }, { name: "Bob", role: "Staff; Senior" }])
  expect(remainingBulkMemberText(state, [",Missing name"])).toBe(
    "Doe, Jane\t\nBob\tStaff; Senior\n,Missing name",
  )
})
