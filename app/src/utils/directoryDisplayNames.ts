// Keep this rule in sync with facenox-cloud/apps/web/lib/directory-display-names.ts.
interface DirectoryIdentity {
  scope: string
  id: string
  createdAt?: Date | string | null
}

export function assignDirectoryDisplayNames<T extends { name: string }>(
  entries: readonly T[],
  identify: (entry: T) => DirectoryIdentity,
): (T & { displayName: string })[] {
  const keyFor = (scope: string, name: string) => JSON.stringify([scope, name.toLowerCase()])
  const ordered = entries.map((entry, index) => {
    const { scope, id, createdAt } = identify(entry)
    const timestamp = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt ?? "")
    return { entry, index, scope, id, timestamp: Number.isFinite(timestamp) ? timestamp : Infinity }
  })
  const savedNames = new Set(ordered.map(({ scope, entry }) => keyFor(scope, entry.name)))
  const lastOrdinal = new Map<string, number>()
  const labels = new Map<number, string>()

  ordered.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1
    // A binary comparison gives the same tie-break order on all locales.
    return (
      a.id < b.id ? -1
      : a.id > b.id ? 1
      : 0
    )
  })

  for (const { entry, index, scope } of ordered) {
    const key = keyFor(scope, entry.name)
    let ordinal = (lastOrdinal.get(key) ?? 0) + 1
    let label = ordinal === 1 ? entry.name : `${entry.name} (${ordinal})`
    while (ordinal > 1 && savedNames.has(keyFor(scope, label))) {
      ordinal += 1
      label = `${entry.name} (${ordinal})`
    }
    lastOrdinal.set(key, ordinal)
    labels.set(index, label)
  }

  return entries.map((entry, index) => ({ ...entry, displayName: labels.get(index) ?? entry.name }))
}
