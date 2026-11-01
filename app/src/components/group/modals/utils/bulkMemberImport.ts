import type { BulkMemberCreationResponse } from "@/services/attendance/MemberManager"

export interface BulkMemberImportRow {
  name: string
  role?: string
  email?: string
  personId?: string
  creationId: string
}

export interface BulkMemberImportCheckpoint {
  pending: BulkMemberImportRow[]
  completed: BulkMemberImportRow[]
}

export function createBulkMemberCheckpoint(): BulkMemberImportCheckpoint {
  return { pending: [], completed: [] }
}

function rowKey(row: Omit<BulkMemberImportRow, "creationId">) {
  return JSON.stringify([row.name, row.role || "", row.email || "", row.personId || ""])
}

export function reconcileBulkMemberRows(
  checkpoint: BulkMemberImportCheckpoint,
  input: Array<Omit<BulkMemberImportRow, "creationId">>,
  includesCompleted = false,
): BulkMemberImportRow[] {
  const available = new Map<string, BulkMemberImportRow[]>()
  for (const row of [...checkpoint.pending, ...(includesCompleted ? checkpoint.completed : [])]) {
    const key = rowKey(row)
    const rows = available.get(key)
    if (rows) rows.push(row)
    else available.set(key, [row])
  }
  const used = new Set<string>()
  const matches = input.map((row) => {
    const match = available.get(rowKey(row))?.shift()
    if (match) used.add(match.creationId)
    return match
  })
  // Keep ambiguous requests tied to their original token even when the user corrects a row.
  // If that request actually committed, the server rejects a changed payload instead of duplicating it.
  const remaining = checkpoint.pending.filter((row) => !used.has(row.creationId))
  if (
    includesCompleted &&
    checkpoint.completed.length > 0 &&
    matches.filter((match) => !match).length > remaining.length
  ) {
    throw new Error(
      "Previously added entries cannot be changed in a resumed file import. Edit those members in Members, or start a new import for new entries.",
    )
  }
  const completed = new Set(checkpoint.completed.map((row) => row.creationId))
  checkpoint.pending = input
    .map((row, index) => ({
      ...row,
      creationId:
        matches[index]?.creationId ?? remaining.shift()?.creationId ?? crypto.randomUUID(),
    }))
    .filter((row) => !completed.has(row.creationId))
  return checkpoint.pending
}

export function checkpointBulkMemberResponse(
  checkpoint: BulkMemberImportCheckpoint,
  chunk: BulkMemberImportRow[],
  response: BulkMemberCreationResponse,
) {
  let successful: Set<string>
  if (response.results?.length) {
    successful = new Set(
      response.results
        .filter((row) => row.success && row.creation_id)
        .map((row) => row.creation_id!),
    )
  } else if (response.success_count === chunk.length && response.error_count === 0) {
    successful = new Set(chunk.map((row) => row.creationId))
  } else {
    const members = [...response.members]
    successful = new Set<string>()
    for (const row of chunk) {
      const index = members.findIndex(
        (member) => member.name === row.name && (member.role || "") === (row.role || ""),
      )
      if (index >= 0) {
        successful.add(row.creationId)
        members.splice(index, 1)
      }
    }
  }
  const completed = new Set(checkpoint.completed.map((row) => row.creationId))
  for (const row of chunk) {
    if (successful.has(row.creationId) && !completed.has(row.creationId)) {
      checkpoint.completed.push(row)
      completed.add(row.creationId)
    }
  }
  checkpoint.pending = checkpoint.pending.filter((row) => !completed.has(row.creationId))
}

export function remainingBulkMemberText(checkpoint: BulkMemberImportCheckpoint, invalid: string[]) {
  // Tabs preserve commas/semicolons in names on the next parse, including an empty role.
  return [...checkpoint.pending.map((row) => `${row.name}\t${row.role ?? ""}`), ...invalid].join(
    "\n",
  )
}
