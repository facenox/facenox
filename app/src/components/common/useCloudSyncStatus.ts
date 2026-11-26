import {
  hasSavedCloudPairing,
  refreshCloudSyncConfig,
  useCloudSyncConfig,
} from "@/services/cloudSyncState"

export function useCloudSyncStatus() {
  const { config, status, error } = useCloudSyncConfig()
  const isPaired = hasSavedCloudPairing(config)
  const hasCachedPolicy = isPaired && Boolean(config?.credentialError)
  const isReady = (status === "ready" || hasCachedPolicy) && config?.policyReady !== false
  const allowKioskDirectoryManagement = config?.allowKioskDirectoryManagement !== false
  return {
    isPaired,
    isReady,
    status,
    error,
    refresh: refreshCloudSyncConfig,
    cloudUrl: config?.remoteBaseUrl || "https://facenox.com",
    organizationId: config?.organizationId || "",
    organizationName: config?.organizationName || "",
    siteName: config?.siteName || "",
    allowKioskDirectoryManagement,
    canManageDirectory: isReady && (!isPaired || allowKioskDirectoryManagement),
  }
}
