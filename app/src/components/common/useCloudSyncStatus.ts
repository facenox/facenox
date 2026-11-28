import { hasSavedCloudPairing, refreshCloudSyncConfig, useCloudSyncConfig } from '@/services/cloudSyncState'

export function useCloudSyncStatus() {
  const { config, status, error } = useCloudSyncConfig()
  const isPaired = hasSavedCloudPairing(config)
  const hasCachedPolicy = isPaired && Boolean(config?.credentialError)
  const isReady = (status === 'ready' || hasCachedPolicy) && config?.policyReady !== false
  const allowKioskDirectoryManagement = config?.allowKioskDirectoryManagement !== false
  const allowAutoExport = Boolean(isPaired && config?.allowAutoExport === true)
  const auditLogExportLimit = isPaired && config?.auditLogExportLimit !== undefined ? config.auditLogExportLimit : 100
  const maxReportDays = isPaired ? (config?.policyOverrides?.dataRetentionDays ?? 7) : 7
  return {
    isPaired,
    isReady,
    status,
    error,
    refresh: refreshCloudSyncConfig,
    cloudUrl: config?.remoteBaseUrl || 'https://facenox.com',
    organizationId: config?.organizationId || '',
    organizationName: config?.organizationName || '',
    siteName: config?.siteName || '',
    allowKioskDirectoryManagement,
    allowAutoExport,
    auditLogExportLimit,
    maxReportDays,
    peopleLimit: config?.policyOverrides?.peopleLimit,
    canManageDirectory: isReady && (!isPaired || allowKioskDirectoryManagement)
  }
}
