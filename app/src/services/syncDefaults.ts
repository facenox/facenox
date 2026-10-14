export const DEFAULT_SYNC_INTERVAL_MINUTES = 15
export const OFFICIAL_REMOTE_BASE_URL = "https://facenox.com"
export const LOCAL_DEV_REMOTE_BASE_URL = "http://localhost:3000"
export const DEFAULT_REMOTE_BASE_URL = OFFICIAL_REMOTE_BASE_URL

export function isOfficialCloudUrl(url?: string | null): boolean {
  if (!url) return true
  try {
    const officialHost = new URL(OFFICIAL_REMOTE_BASE_URL).hostname
      .replace(/^www\./, "")
      .toLowerCase()
    const trimmed = url.trim().toLowerCase()
    const withProto =
      trimmed.startsWith("http://") || trimmed.startsWith("https://") ?
        trimmed
      : `https://${trimmed}`
    const targetHost = new URL(withProto).hostname.replace(/^www\./, "").toLowerCase()
    return targetHost === officialHost
  } catch {
    return false
  }
}
