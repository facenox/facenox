import { syncPushSchema, type SyncPushPayload } from "../../shared/syncContract.js"

export const MAX_SYNC_BYTES = 3 * 1024 * 1024
const limits = {
  groups: 250,
  members: 500,
  records: 250,
  sessions: 250,
  face_embeddings: 100,
} as const
const kinds = ["groups", "members", "records", "sessions", "face_embeddings"] as const

/** Bound actual UTF-8 request bytes, not just row counts. Finish groups before
 * members and members before templates so dependencies never arrive out of order. */
export function buildSyncChunks(
  input: Omit<SyncPushPayload, "snapshot_id">,
  maxBytes = MAX_SYNC_BYTES,
): SyncPushPayload[] {
  const normalized = syncPushSchema.parse({ ...input, snapshot_id: "validate" })
  const source = normalized.attendance_export
  const chunks: SyncPushPayload[] = []
  const offsets = { groups: 0, members: 0, records: 0, sessions: 0, face_embeddings: 0 }
  let remaining = kinds.reduce((sum, kind) => sum + (source[kind]?.length ?? 0), 0)
  do {
    const chunk: SyncPushPayload = {
      ...normalized,
      // Reserve enough digits for final part numbers without quadratic re-encoding.
      snapshot_id: `${input.device_id}:${input.exported_at}:part-${Number.MAX_SAFE_INTEGER}-of-${Number.MAX_SAFE_INTEGER}`,
      attendance_export: {
        ...source,
        groups: [],
        members: [],
        records: [],
        sessions: [],
        face_embeddings: [],
      },
    }
    let bytes = Buffer.byteLength(JSON.stringify(chunk), "utf8")
    let added = 0
    if (bytes > maxBytes) throw new Error("Sync metadata exceeds the request byte limit.")
    for (const kind of kinds) {
      const rows = source[kind] ?? []
      // Each array keeps its concrete schema; the union is only used for generic packing.
      const target: unknown[] = chunk.attendance_export[kind]!
      while (offsets[kind] < rows.length && target.length < limits[kind]) {
        const row = rows[offsets[kind]]
        const rowBytes = Buffer.byteLength(JSON.stringify(row), "utf8") + (target.length ? 1 : 0)
        if (bytes + rowBytes > maxBytes) {
          if (!added)
            throw new Error(
              `A ${kind} entry exceeds the sync request byte limit. Review its field sizes.`,
            )
          break
        }
        target.push(row)
        bytes += rowBytes
        offsets[kind]++
        remaining--
        added++
      }
      if (offsets[kind] < rows.length) break
    }
    chunks.push(chunk)
  } while (remaining > 0)
  return chunks.map((chunk, index) => ({
    ...chunk,
    snapshot_id: `${input.device_id}:${input.exported_at}:part-${index + 1}-of-${chunks.length}`,
  }))
}
