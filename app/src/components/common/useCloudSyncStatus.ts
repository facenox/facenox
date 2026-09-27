import { useState, useEffect } from "react"

export interface CloudSyncStatus {
  isPaired: boolean
  cloudUrl: string
  organizationId: string
  organizationName: string
  siteName: string
}

export function useCloudSyncStatus(): CloudSyncStatus {
  const [status, setStatus] = useState<CloudSyncStatus>({
    isPaired: false,
    cloudUrl: "https://facenox.com",
    organizationId: "",
    organizationName: "",
    siteName: "",
  })

  useEffect(() => {
    if (!window.electronAPI?.sync) return

    const load = () => {
      window.electronAPI.sync
        .getConfig()
        .then((config) => {
          setStatus({
            isPaired: Boolean(config.connected),
            cloudUrl: config.remoteBaseUrl || "https://facenox.com",
            organizationId: config.organizationId || "",
            organizationName: config.organizationName || "",
            siteName: config.siteName || "",
          })
        })
        .catch(() => {})
    }

    load()
    const unsubscribe = window.electronAPI.sync.onDataChanged(load)
    return unsubscribe
  }, [])

  return status
}
