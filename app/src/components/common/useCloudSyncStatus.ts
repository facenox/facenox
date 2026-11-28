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
  const cloudUrl = (config?.remoteBaseUrl || 'https://facenox.com').replace(/\/+$/, '')
  const organizationSlug = isPaired ? config?.organizationSlug || '' : ''
  const billingUrl =
    isPaired && organizationSlug ? `${cloudUrl}/app/${encodeURIComponent(organizationSlug)}/billing`
    : isPaired ? `${cloudUrl}/app`
    : `${cloudUrl}/pricing`
  return {
    isPaired,
    isReady,
    status,
    error,
    refresh: refreshCloudSyncConfig,
    cloudUrl,
    organizationId: config?.organizationId || '',
    organizationName: config?.organizationName || '',
    organizationSlug,
    billingUrl,
    siteName: config?.siteName || '',
    allowKioskDirectoryManagement,
    allowAutoExport,
    auditLogExportLimit,
    maxReportDays,
    peopleLimit: config?.policyOverrides?.peopleLimit,
    canManageDirectory: isReady && (!isPaired || allowKioskDirectoryManagement)
  }
}
