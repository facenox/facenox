import { randomUUID } from "node:crypto"
import { syncPushSchema, type SyncPushPayload } from "../../shared/syncContract.js"

export const MAX_SYNC_BYTES = 3 * 1024 * 1024
const limits = {
  groups: 250,
  members: 500,
  records: 250,
  sessions: 250,
  deleted_sessions: 250,
  face_embeddings: 100,
} as const
const kinds = ["groups", "members", "records", "sessions", "deleted_sessions", "face_embeddings"] as const

function remainingRows<T>(
  rows: T[],
  accepted: T[],
  key: (row: T) => string,
  fingerprint: (row: T) => string = (row) => JSON.stringify(row),
): T[] {
  const previous = new Map(accepted.map((row) => [key(row), fingerprint(row)]))
  return rows.filter((row) => previous.get(key(row)) !== fingerprint(row))
}

/** Bound actual UTF-8 request bytes, not just row counts. Finish groups before
 * members and members before templates so dependencies never arrive out of order.
 * Rebuilding a rejected batch omits unchanged rows from already accepted chunks. */
export function buildSyncChunks(
  input: Omit<SyncPushPayload, "snapshot_id">,
  maxBytes = MAX_SYNC_BYTES,
  acceptedChunks: readonly SyncPushPayload[] = [],
): SyncPushPayload[] {
  const normalized = syncPushSchema.parse({ ...input, snapshot_id: "validate" })
  const original = normalized.attendance_export
  const source = {
    ...original,
    groups: remainingRows(
      original.groups,
      acceptedChunks.flatMap((c) => c.attendance_export.groups),
      (row) => row.id,
    ),
    members: remainingRows(
      original.members,
      acceptedChunks.flatMap((c) => c.attendance_export.members),
      (row) => row.person_id,
    ),
    records: remainingRows(
      original.records,
      acceptedChunks.flatMap((c) => c.attendance_export.records),
      (row) => row.id,
    ),
    sessions: remainingRows(
      original.sessions,
      acceptedChunks.flatMap((c) => c.attendance_export.sessions),
      (row) => row.id,
    ),
    deleted_sessions: remainingRows(
      original.deleted_sessions ?? [],
      acceptedChunks.flatMap((c) => c.attendance_export.deleted_sessions ?? []),
      (row) => row.id,
    ),
    face_embeddings: remainingRows(
      original.face_embeddings ?? [],
      acceptedChunks.flatMap((c) => c.attendance_export.face_embeddings ?? []),
      (row) => row.person_id,
      // Encryption generates a new nonce on each export. The local version, not
      // randomized ciphertext, identifies whether an enrollment changed.
      (row) => JSON.stringify({ ...row, embedding_encrypted: undefined }),
    ),
  }
  // A corrected export can share the old timestamp. It must not reuse accepted
  // snapshot IDs; retries keep their original IDs via the persisted pending batch.
  const snapshotPrefix = `${input.device_id}:${input.exported_at}:${randomUUID()}`
  const chunks: SyncPushPayload[] = []
  const offsets = { groups: 0, members: 0, records: 0, sessions: 0, deleted_sessions: 0, face_embeddings: 0 }
  let remaining = kinds.reduce((sum, kind) => sum + (source[kind]?.length ?? 0), 0)
  do {
    const chunk: SyncPushPayload = {
      ...normalized,
      // Reserve enough digits for final part numbers without quadratic re-encoding.
      snapshot_id: `${snapshotPrefix}:part-${Number.MAX_SAFE_INTEGER}-of-${Number.MAX_SAFE_INTEGER}`,
      attendance_export: {
        ...source,
        groups: [],
        members: [],
        records: [],
        sessions: [],
        deleted_sessions: [],
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
    snapshot_id: `${snapshotPrefix}:part-${index + 1}-of-${chunks.length}`,
  }))
}
