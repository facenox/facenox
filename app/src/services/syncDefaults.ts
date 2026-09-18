export const DEFAULT_SYNC_INTERVAL_MINUTES = 15
export const OFFICIAL_REMOTE_BASE_URL = "https://facenox.com"
export const LOCAL_DEV_REMOTE_BASE_URL = "http://localhost:3000"
export const DEFAULT_REMOTE_BASE_URL = OFFICIAL_REMOTE_BASE_URL

export function isOfficialCloudUrl(url?: string | null): boolean {
  if (!url) return true
  const clean = url
    .trim()
    .replace(/^(https?:\/\/)\/+/, "$1")
    .replace(/\/+$/, "")
    .toLowerCase()
  return (
    clean === OFFICIAL_REMOTE_BASE_URL ||
    clean === "https://www.facenox.com" ||
    clean === "http://facenox.com" ||
    clean === "http://www.facenox.com" ||
    clean === "facenox.com" ||
    clean === "www.facenox.com" ||
    clean === DEFAULT_REMOTE_BASE_URL
  )
}
