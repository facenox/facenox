import { persistentStore } from '../persistentStore.js'

const SYNC_POLICY_KEYS = [
  'sync.policy.forceLiveness',
  'sync.policy.trackCheckout',
  'sync.policy.lateThresholdEnabled',
  'sync.policy.lateThresholdMinutes',
  'sync.policy.attendanceCooldownSeconds',
  'sync.policy.minCheckoutDelayMinutes',
  'sync.policy.dataRetentionDays',
  'sync.policy.peopleLimit',
  'sync.policy.allowKioskDirectoryManagement',
  'sync.policy.faceTemplateSync',
  'sync.policy.allowAutoExport',
  'sync.policy.auditLogExportLimit'
] as const

export function deleteStoreKey(key: string) {
  const store = persistentStore as {
    delete?: (k: string) => void
    set: (k: string, v: unknown) => void
  }
  if (typeof store.delete === 'function') {
    store.delete(key)
  } else {
    store.set(key, undefined)
  }
}

export function clearLocalSyncMetadata() {
  deleteStoreKey('sync.dataOrigin')
  deleteStoreKey('sync.pendingUpload')
  deleteStoreKey('sync.pendingAcknowledgements')
  persistentStore.set('sync.lastSyncedAt', null)
}

export function clearDeviceCredentials() {
  persistentStore.set('sync.deviceId', '')
  persistentStore.set('sync.deviceToken', '')
}

export function clearRemoteConnection(options: { preserveDeviceAuth?: boolean } = {}) {
  persistentStore.set('sync.enabled', false)
  persistentStore.set('sync.organizationId', '')
  persistentStore.set('sync.organizationName', '')
  persistentStore.set('sync.siteId', '')
  persistentStore.set('sync.siteName', '')
  if (!options.preserveDeviceAuth) {
    clearDeviceCredentials()
  }
  persistentStore.set('sync.encryptionKey', '')
  persistentStore.set('sync.lastSyncedAt', null)
  persistentStore.set('sync.pendingAcknowledgements', null)
  persistentStore.set('sync.pendingUpload', null)
  for (const key of SYNC_POLICY_KEYS) {
    deleteStoreKey(key)
  }
}
