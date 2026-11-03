import { refreshCloudSyncConfig, useCloudSyncConfig } from "@/services/cloudSyncState"

export function useCloudSyncStatus() {
  const { config, status, error } = useCloudSyncConfig()
  return {
    isPaired: Boolean(config?.connected),
    isReady: status === "ready" && config?.policyReady !== false,
    status,
    error,
    refresh: refreshCloudSyncConfig,
    cloudUrl: config?.remoteBaseUrl || "https://facenox.com",
    organizationId: config?.organizationId || "",
    organizationName: config?.organizationName || "",
    siteName: config?.siteName || "",
    allowKioskDirectoryManagement: config?.allowKioskDirectoryManagement !== false,
  }
}
