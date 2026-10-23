/**
 * GitHub Release Update Checker
 * Handles version comparison and manual download prompting via GitHub Releases.
 * Designed to be non-blocking and offline-safe.
 */

import { app, shell, BrowserWindow, net } from "electron"
import {
  compareVersions,
  extractSemverLikeVersion,
  getDownloadUrlForPlatform,
  type ReleaseAsset,
} from "./updaterUtils.js"

const GITHUB_OWNER = "facenox"
const GITHUB_REPO = "facenox"
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const GITHUB_RELEASES_PAGE = "https://facenox.com/download"

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
const NETWORK_TIMEOUT_MS = 8000 // 8 seconds - fail fast if no internet
let lastCheckTime = 0
let cachedUpdateInfo: UpdateInfo | null = null
let pendingCheckPromise: Promise<UpdateInfo> | null = null

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl: string
  releaseNotes: string
  publishedAt: string
  downloadUrl: string | null
  error?: string
  isOffline?: boolean
}

export interface GitHubRelease {
  tag_name: string
  name: string
  body: string
  html_url: string
  published_at: string
  assets: ReleaseAsset[]
}

/**
 * Check if we have network connectivity
 * Uses Electron's net module for accurate online status
 */
function isOnline(): boolean {
  return net.isOnline()
}

interface ReleaseFetchResult {
  release: GitHubRelease | null
  error?: string
}

async function fetchLatestRelease(): Promise<ReleaseFetchResult> {
  if (!isOnline()) {
    return { release: null, error: "This computer is offline." }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)

    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": `Facenox/${app.getVersion()}`,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 404) {
        console.log("[Updater] No releases found")
        return { release: null, error: "No published release was available to compare versions." }
      }
      console.log(`[Updater] GitHub API returned ${response.status}`)
      return {
        release: null,
        error: `The update service returned HTTP ${response.status}.`,
      }
    }

    return { release: (await response.json()) as GitHubRelease }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.log("[Updater] Request timed out - likely offline or slow connection")
        return { release: null, error: "The update check timed out." }
      }
      console.log("[Updater] Network error (expected if offline):", error.message)
    }
    return {
      release: null,
      error: "Could not reach the update service. Check your connection and try again.",
    }
  }
}

export async function checkForUpdates(force = false): Promise<UpdateInfo> {
  // Deduplicate concurrent calls — piggyback on an in-flight check instead
  // of issuing a second API request.
  if (pendingCheckPromise) {
    return pendingCheckPromise
  }

  pendingCheckPromise = (async (): Promise<UpdateInfo> => {
    const currentVersion = app.getVersion()
    const now = Date.now()

    if (!force && cachedUpdateInfo && now - lastCheckTime < CHECK_INTERVAL_MS) {
      return cachedUpdateInfo
    }

    if (!isOnline()) {
      return {
        currentVersion,
        latestVersion: currentVersion,
        hasUpdate: false,
        releaseUrl: GITHUB_RELEASES_PAGE,
        releaseNotes: "",
        publishedAt: "",
        downloadUrl: null,
        isOffline: true,
      }
    }

    console.log(`[Updater] Checking for updates (current: v${currentVersion})`)

    const { release, error: fetchError } = await fetchLatestRelease()

    if (!release) {
      const noUpdateInfo: UpdateInfo = {
        currentVersion,
        latestVersion: currentVersion,
        hasUpdate: false,
        releaseUrl: GITHUB_RELEASES_PAGE,
        releaseNotes: "",
        publishedAt: "",
        downloadUrl: null,
        ...(fetchError ? { error: fetchError } : {}),
      }
      cachedUpdateInfo = noUpdateInfo
      lastCheckTime = now
      return noUpdateInfo
    }

    const latestVersion = extractSemverLikeVersion(release.tag_name)

    if (!latestVersion) {
      const unknownVersionInfo: UpdateInfo = {
        currentVersion,
        latestVersion: currentVersion,
        hasUpdate: false,
        releaseUrl: release.html_url,
        releaseNotes: release.body || "",
        publishedAt: release.published_at,
        downloadUrl: getDownloadUrlForPlatform(release.assets),
        error:
          "Latest release tag did not contain a semantic version (expected something like v2.0.0)",
      }

      cachedUpdateInfo = unknownVersionInfo
      lastCheckTime = now
      console.log(`[Updater] Latest release tag has no semver (tag: ${release.tag_name})`)
      return unknownVersionInfo
    }

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

    const updateInfo: UpdateInfo = {
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseUrl: release.html_url,
      releaseNotes: release.body || "",
      publishedAt: release.published_at,
      downloadUrl: getDownloadUrlForPlatform(release.assets),
    }

    cachedUpdateInfo = updateInfo
    lastCheckTime = now

    console.log(
      `[Updater] Latest: v${latestVersion}, Current: v${currentVersion}, Update available: ${hasUpdate}`,
    )

    return updateInfo
  })()

  try {
    return await pendingCheckPromise
  } finally {
    pendingCheckPromise = null
  }
}

export function __resetUpdateStateForTests(): void {
  lastCheckTime = 0
  cachedUpdateInfo = null
  pendingCheckPromise = null
}

/**
 * Get current app version
 */
export function getCurrentVersion(): string {
  return app.getVersion()
}

/**
 * Open the GitHub releases page in the default browser
 */
export function openReleasePage(url?: string): void {
  shell.openExternal(url || GITHUB_RELEASES_PAGE)
}

/**
 * Send update notification to renderer process
 */
export function notifyRenderer(mainWindow: BrowserWindow | null, updateInfo: UpdateInfo): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:update-available", updateInfo)
  }
}

/**
 * Background update check - runs periodically after app startup
 * This is completely non-blocking and offline-safe
 */
const BACKGROUND_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours between background checks

export async function startBackgroundUpdateCheck(
  mainWindow: BrowserWindow | null,
  delayMs = 60000, // 1 minute after startup
  onUpdateAvailable?: (latestVersion: string | null) => void,
): Promise<void> {
  async function runCheck() {
    if (!isOnline()) {
      console.log("[Updater] Skipping background check - offline")
      return
    }

    try {
      const updateInfo = await checkForUpdates()
      if (!updateInfo.isOffline) {
        if (updateInfo.hasUpdate) {
          console.log(`[Updater] Update available: v${updateInfo.latestVersion}`)
          onUpdateAvailable?.(updateInfo.latestVersion)
        } else {
          console.log(`[Updater] App is up to date (v${updateInfo.currentVersion})`)
          onUpdateAvailable?.(null)
        }
        notifyRenderer(mainWindow, updateInfo)
      }
    } catch (error) {
      console.log("[Updater] Background check failed (non-critical):", error)
    }
  }

  function scheduleNext() {
    setTimeout(async () => {
      await runCheck()
      scheduleNext()
    }, BACKGROUND_CHECK_INTERVAL_MS)
  }

  // First check after delayMs, then every 24 hours
  setTimeout(async () => {
    await runCheck()
    scheduleNext()
  }, delayMs)
}
