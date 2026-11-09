import { useSyncExternalStore } from "react"

export type RemoteSyncConfig = Awaited<ReturnType<SyncAPI["getConfig"]>>
export type CloudConfigStatus = "loading" | "ready" | "error"

interface CloudSyncSnapshot {
  config: RemoteSyncConfig | null
  status: CloudConfigStatus
  error: string | null
}

const initialSnapshot: CloudSyncSnapshot = { config: null, status: "loading", error: null }
let snapshot = initialSnapshot
let bridge: SyncAPI | undefined
let unsubscribe: (() => void) | undefined
let revision = 0
const listeners = new Set<() => void>()

function emit(next: CloudSyncSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

function getSnapshot() {
  return bridge === window.electronAPI?.sync ? snapshot : initialSnapshot
}

async function loadCounts(api: SyncAPI, request: number) {
  try {
    const config = await api.getConfig()
    if (bridge !== api || revision !== request || !snapshot.config) return
    // Queue statistics must not delay or replace the authoritative pairing read.
    emit({
      ...snapshot,
      config: {
        ...snapshot.config,
        unsyncedRecordsCount: config.unsyncedRecordsCount,
        unsyncedSessionsCount: config.unsyncedSessionsCount,
      },
    })
  } catch {
    if (bridge !== api || revision !== request || !snapshot.config) return
    emit({
      ...snapshot,
      config: {
        ...snapshot.config,
        unsyncedRecordsCount: undefined,
        unsyncedSessionsCount: undefined,
      },
    })
  }
}

export async function refreshCloudSyncConfig() {
  const api = window.electronAPI?.sync
  const request = ++revision
  if (!api) {
    unsubscribe?.()
    unsubscribe = undefined
    bridge = undefined
    emit({ ...snapshot, status: "error", error: "Cloud sync is unavailable in this window." })
    return
  }
  if (bridge !== api) {
    unsubscribe?.()
    bridge = api
    snapshot = initialSnapshot
    unsubscribe = api.onDataChanged(() => {
      void refreshCloudSyncConfig()
    })
  }
  if (snapshot.status === "error") emit({ ...snapshot, status: "loading", error: null })
  try {
    const config = await api.getConfig({ includeCounts: false })
    if (bridge !== api || revision !== request) return
    if (config.credentialError) {
      emit({ config, status: "error", error: config.credentialError })
      return
    }
    const previous = snapshot.config
    const sameSnapshot =
      previous?.connected === config.connected &&
      previous?.organizationId === config.organizationId &&
      previous?.siteId === config.siteId &&
      previous?.deviceId === config.deviceId &&
      previous?.lastSyncedAt === config.lastSyncedAt
    emit({
      config: {
        ...config,
        unsyncedRecordsCount:
          config.unsyncedRecordsCount ??
          (sameSnapshot ? previous?.unsyncedRecordsCount : undefined),
        unsyncedSessionsCount:
          config.unsyncedSessionsCount ??
          (sameSnapshot ? previous?.unsyncedSessionsCount : undefined),
      },
      status: "ready",
      error: null,
    })
    if (config.connected) void loadCounts(api, request)
    return config
  } catch (error) {
    if (bridge !== api || revision !== request) return
    emit({
      ...snapshot,
      status: "error",
      error: error instanceof Error ? error.message : "Could not load Cloud sync settings.",
    })
  }
}

function subscribe(listener: () => void) {
  const first = listeners.size === 0
  listeners.add(listener)
  if (first) {
    if (bridge === window.electronAPI?.sync && bridge) {
      unsubscribe?.()
      unsubscribe = bridge.onDataChanged(() => {
        void refreshCloudSyncConfig()
      })
    }
    void refreshCloudSyncConfig()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      unsubscribe?.()
      unsubscribe = undefined
      ++revision
    }
  }
}

export function useCloudSyncConfig() {
  return useSyncExternalStore(subscribe, getSnapshot, () => initialSnapshot)
}
