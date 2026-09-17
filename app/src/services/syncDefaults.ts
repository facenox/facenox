const isDev = (() => {
  try {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } }
    if (meta?.env?.DEV !== undefined) {
      return Boolean(meta.env.DEV)
    }
  } catch {
    // Ignore when import.meta is unavailable in Node/CJS context
  }
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV) {
      return process.env.NODE_ENV === "development"
    }
  } catch {
    // Ignore when process is unavailable in browser context
  }
  return false
})()

export const DEFAULT_SYNC_INTERVAL_MINUTES = 15
export const OFFICIAL_REMOTE_BASE_URL = "https://facenox.com"
export const LOCAL_DEV_REMOTE_BASE_URL = "http://localhost:3000"
export const DEFAULT_REMOTE_BASE_URL = isDev ? LOCAL_DEV_REMOTE_BASE_URL : OFFICIAL_REMOTE_BASE_URL

export function isOfficialCloudUrl(url?: string | null): boolean {
  if (!url) return true
  const clean = url.trim().replace(/\/+$/, "").toLowerCase()
  return (
    clean === OFFICIAL_REMOTE_BASE_URL ||
    clean === "https://www.facenox.com" ||
    clean === LOCAL_DEV_REMOTE_BASE_URL ||
    clean === DEFAULT_REMOTE_BASE_URL
  )
}
