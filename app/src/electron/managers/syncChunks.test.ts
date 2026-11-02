// @vitest-environment node
import { expect, it } from "vitest"
import { attendanceExportSchema, type SyncPushPayload } from "../../shared/syncContract"
import { buildSyncChunks } from "./syncChunks"

function payload(): Omit<SyncPushPayload, "snapshot_id"> {
  return {
    schema_version: 2,
    device_id: "device",
    site_id: "site",
    app_version: "1",
    exported_at: "2026-10-20T00:00:00Z",
    attendance_export: attendanceExportSchema.parse({
      groups: [],
      members: [],
      records: [],
      sessions: [],
      face_embeddings: [],
      exported_at: "2026-10-20T00:00:00Z",
      settings: {
        late_threshold_minutes: 15,
        enable_location_tracking: false,
        confidence_threshold: 0.8,
        attendance_cooldown_seconds: 60,
        relog_cooldown_seconds: 60,
        enable_liveness_detection: false,
        max_recognition_faces_per_frame: 6,
        data_retention_days: 0,
      },
    }),
  }
}
it("retains historical attendance mode and noteless override metadata through parsing and chunking", () => {
  const input = payload()
  const row = {
    id: "s",
    person_id: "p",
    member_id: "m",
    group_id: "g",
    date: "2026-10-20",
    visit_number: 1,
    status: "present" as const,
    is_late: false,
    is_manual_override: true,
    notes: null,
    check_in_time: "2026-10-20T09:00:00Z",
    check_out_time: null,
    applied_schedule: { class_start_time: "08:00", attendance_mode: "visits" as const },
  }
  input.attendance_export = attendanceExportSchema.parse({
    ...input.attendance_export,
    sessions: [row],
  })
  const chunks = buildSyncChunks(input)
  expect(chunks.flatMap((chunk) => chunk.attendance_export.sessions)).toEqual([row])
})
it("chunks retirement markers and excludes markers from already accepted chunks", () => {
  const input = payload()
  input.attendance_export.deleted_sessions = Array.from({ length: 501 }, (_, i) => ({
    id: `retired-${i}`,
    person_id: "p",
    group_id: "g",
    date: "2026-10-20",
  }))
  const chunks = buildSyncChunks(input)
  expect(chunks.map((chunk) => chunk.attendance_export.deleted_sessions?.length)).toEqual([
    250, 250, 1,
  ])
  expect(chunks.flatMap((chunk) => chunk.attendance_export.deleted_sessions ?? [])).toEqual(
    input.attendance_export.deleted_sessions,
  )
  const retry = buildSyncChunks(input, undefined, [chunks[0]])
  expect(retry.flatMap((chunk) => chunk.attendance_export.deleted_sessions ?? [])).toEqual(
    input.attendance_export.deleted_sessions.slice(250),
  )
})

it("keeps every UTF-8 request within the byte limit without losing or reordering rows", () => {
  const input = payload()
  input.attendance_export.members = Array.from({ length: 20 }, (_, index) => ({
    id: `p${index}`,
    person_id: `p${index}`,
    group_id: "group",
    name: "名".repeat(100),
    role: null,
    joined_at: input.exported_at,
    is_active: true,
    sync_revision: 0,
    version: 1,
    sync_dirty: true,
  }))
  const chunks = buildSyncChunks(input, 2200)
  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks.every((chunk) => Buffer.byteLength(JSON.stringify(chunk), "utf8") <= 2200)).toBe(
    true,
  )
  expect(chunks.flatMap((chunk) => chunk.attendance_export.members)).toEqual(
    input.attendance_export.members,
  )
})
it("sends large group lists before dependent members and faces after all members", () => {
  const input = payload()
  input.attendance_export.groups = Array.from({ length: 300 }, (_, index) => ({
    id: `g${index}`,
    name: "Group",
    created_at: input.exported_at,
    is_active: true,
    settings: {
      attendance_mode: "attendance",
      late_threshold_enabled: false,
      track_checkout: false,
      scan_behavior: "automatic",
    },
    sync_revision: 0,
    version: 1,
    sync_dirty: true,
  }))
  input.attendance_export.members = Array.from({ length: 600 }, (_, index) => ({
    id: `p${index}`,
    person_id: `p${index}`,
    group_id: "g299",
    name: "Member",
    joined_at: input.exported_at,
    is_active: true,
    sync_revision: 0,
    version: 1,
    sync_dirty: true,
  }))
  input.attendance_export.face_embeddings = [
    {
      person_id: "p599",
      embedding_encrypted: "cipher",
      embedding_dimension: 512,
      is_deleted: false,
      sync_revision: 0,
      version: 1,
      sync_dirty: true,
    },
  ]
  const chunks = buildSyncChunks(input)
  expect(chunks[0].attendance_export.groups).toHaveLength(250)
  expect(chunks[0].attendance_export.members).toHaveLength(0)
  expect(chunks[1].attendance_export.members).toHaveLength(500)
  expect(chunks[1].attendance_export.face_embeddings).toHaveLength(0)
  expect(chunks[2].attendance_export.face_embeddings).toHaveLength(1)
})
it("rejects a single oversized entry explicitly and still emits an empty heartbeat", () => {
  const input = payload()
  expect(buildSyncChunks(input)).toHaveLength(1)
  input.attendance_export.records = [
    {
      id: "record",
      person_id: "person",
      member_id: "person",
      group_id: "group",
      timestamp: input.exported_at,
      confidence: 0.9,
      is_manual: false,
      is_voided: false,
      notes: "x".repeat(5000),
    },
  ]
  expect(() => buildSyncChunks(input, 2200)).toThrow("entry exceeds")
})

it("retains capture context through validation and chunk packing", () => {
  const input = payload()
  input.attendance_export.records = [
    {
      id: "r",
      person_id: "p",
      member_id: "p",
      group_id: "g",
      timestamp: "2026-11-01T06:30:00Z",
      timestamp_timezone: "America/New_York",
      timestamp_offset_seconds: -18000,
      confidence: 1,
      is_manual: false,
      is_voided: false,
    },
  ]
  input.attendance_export.sessions = [
    {
      id: "s",
      person_id: "p",
      member_id: "p",
      group_id: "g",
      date: "2026-11-01",
      visit_number: 1,
      check_in_time: "2026-11-01T05:30:00Z",
      check_out_time: "2026-11-01T06:30:00Z",
      check_in_time_timezone: "America/New_York",
      check_in_time_offset_seconds: -14400,
      check_out_time_timezone: "America/New_York",
      check_out_time_offset_seconds: -18000,
      status: "present",
      is_late: false,
    },
  ]
  const [chunk] = buildSyncChunks(input)
  expect(chunk.attendance_export.records).toEqual(input.attendance_export.records)
  expect(chunk.attendance_export.sessions).toEqual(input.attendance_export.sessions)
})

it("uses fresh IDs for rebuilt exports even when their timestamps are identical", () => {
  const input = payload()
  const original = buildSyncChunks(input)
  const rebuilt = buildSyncChunks(input)
  expect(rebuilt[0].snapshot_id).not.toBe(original[0].snapshot_id)
  expect(rebuilt[0].exported_at).toBe(original[0].exported_at)
})

it("omits unchanged accepted rows but includes corrections for every row kind", () => {
  const input = payload()
  input.attendance_export.groups = [
    {
      id: "g",
      name: "Work",
      created_at: input.exported_at,
      is_active: true,
      settings: {
        attendance_mode: "attendance",
        late_threshold_enabled: false,
        track_checkout: false,
        scan_behavior: "automatic",
      },
      sync_revision: 0,
      version: 1,
      sync_dirty: true,
    },
  ]
  input.attendance_export.members = [
    {
      id: "p",
      person_id: "p",
      group_id: "g",
      name: "Member",
      joined_at: input.exported_at,
      is_active: true,
      sync_revision: 0,
      version: 1,
      sync_dirty: true,
    },
  ]
  input.attendance_export.records = [
    {
      id: "r",
      person_id: "p",
      member_id: "p",
      group_id: "g",
      timestamp: input.exported_at,
      confidence: 1,
      is_manual: false,
      is_voided: false,
    },
  ]
  input.attendance_export.sessions = [
    {
      id: "s",
      person_id: "p",
      member_id: "p",
      group_id: "g",
      date: "2026-10-20",
      visit_number: 1,
      check_in_time: input.exported_at,
      status: "present",
      is_late: false,
    },
  ]
  input.attendance_export.face_embeddings = [
    {
      person_id: "p",
      embedding_encrypted: "old-ciphertext",
      embedding_dimension: 512,
      is_deleted: false,
      sync_revision: 0,
      version: 1,
      sync_dirty: true,
    },
  ]
  const accepted = buildSyncChunks(input)
  const [unchanged] = buildSyncChunks(input, undefined, accepted)
  for (const rows of [
    unchanged.attendance_export.groups,
    unchanged.attendance_export.members,
    unchanged.attendance_export.records,
    unchanged.attendance_export.sessions,
    unchanged.attendance_export.face_embeddings,
  ])
    expect(rows).toEqual([])
  input.attendance_export.face_embeddings[0].embedding_encrypted = "re-encrypted-same-version"
  expect(buildSyncChunks(input, undefined, accepted)[0].attendance_export.face_embeddings).toEqual(
    [],
  )
  input.attendance_export.groups[0].version++
  input.attendance_export.members[0].version++
  input.attendance_export.records[0].notes = "corrected"
  input.attendance_export.sessions[0].notes = "corrected"
  input.attendance_export.face_embeddings[0].embedding_encrypted = "new-ciphertext"
  input.attendance_export.face_embeddings[0].version++
  const [corrected] = buildSyncChunks(input, undefined, accepted)
  for (const rows of [
    corrected.attendance_export.groups,
    corrected.attendance_export.members,
    corrected.attendance_export.records,
    corrected.attendance_export.sessions,
    corrected.attendance_export.face_embeddings,
  ])
    expect(rows).toHaveLength(1)
})
