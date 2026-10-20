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
    settings: { late_threshold_enabled: false, track_checkout: false },
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
