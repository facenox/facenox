// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetVersion = vi.fn(() => "1.0.0-beta.1")
const mockOpenExternal = vi.fn()
const mockIsOnline = vi.fn(() => true)

vi.mock("electron", () => ({
  app: {
    getVersion: mockGetVersion,
  },
  shell: {
    openExternal: mockOpenExternal,
  },
  net: {
    isOnline: mockIsOnline,
  },
  BrowserWindow: class BrowserWindow {},
}))

function mockReleaseResponse(tagName: string, overrides: Record<string, unknown> = {}) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      tag_name: tagName,
      body: "",
      html_url: "https://example.com/release",
      published_at: "2026-04-01T00:00:00.000Z",
      assets: [],
      ...overrides,
    }),
  } as unknown as Response)
}

async function loadUpdater() {
  vi.resetModules()
  const module = await import("@/electron/updater")
  module.__resetUpdateStateForTests()
  return module
}

describe("updater", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVersion.mockReturnValue("1.0.0-beta.1")
    mockIsOnline.mockReturnValue(true)
    vi.stubGlobal("fetch", vi.fn())
  })

  it("returns a graceful offline result", async () => {
    mockIsOnline.mockReturnValue(false)
    const { checkForUpdates } = await loadUpdater()

    await expect(checkForUpdates()).resolves.toMatchObject({
      currentVersion: expect.any(String),
      hasUpdate: false,
      isOffline: true,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns a graceful error payload for non-semver release tags", async () => {
    mockReleaseResponse("latest-release", { body: "notes" })

    const { checkForUpdates } = await loadUpdater()
    const result = await checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.error).toContain("semantic version")
  })

  it("reuses cached results when not forced", async () => {
    mockReleaseResponse("v1.0.1")

    const { checkForUpdates } = await loadUpdater()

    await checkForUpdates()
    await checkForUpdates()

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("bypasses cache when force is true", async () => {
    mockReleaseResponse("v1.0.1")

    const { checkForUpdates } = await loadUpdater()

    await checkForUpdates()
    await checkForUpdates(true)

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("detects when an update is available", async () => {
    mockGetVersion.mockReturnValue("1.0.0")
    mockReleaseResponse("v2.0.0")

    const { checkForUpdates } = await loadUpdater()
    const result = await checkForUpdates()

    expect(result.hasUpdate).toBe(true)
    expect(result.latestVersion).toBe("2.0.0")
    expect(result.currentVersion).toBe("1.0.0")
  })

  it("returns no update when current version equals latest", async () => {
    mockGetVersion.mockReturnValue("1.0.0")
    mockReleaseResponse("v1.0.0")

    const { checkForUpdates } = await loadUpdater()
    const result = await checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.latestVersion).toBe("1.0.0")
  })

  it("reports a failed check instead of claiming the app is current", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"))

    const { checkForUpdates } = await loadUpdater()
    const result = await checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.currentVersion).toBe("1.0.0-beta.1")
    expect(result.error).toContain("Could not reach the update service")
  })

  it("reports a timeout instead of claiming the app is current", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError")
    vi.mocked(fetch).mockRejectedValue(abortError)

    const { checkForUpdates } = await loadUpdater()
    const result = await checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.error).toContain("timed out")
  })

  it("reports a non-ok HTTP response instead of claiming the app is current", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Rate Limit Exceeded",
    } as unknown as Response)

    const { checkForUpdates } = await loadUpdater()
    const result = await checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.error).toContain("HTTP 403")
  })

  it("does not claim the app is current when no release is available", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as unknown as Response)

    const { checkForUpdates } = await loadUpdater()
    const result = await checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.error).toContain("No published release")
  })

  it("delegates release page opening to Electron shell", async () => {
    const { openReleasePage } = await loadUpdater()

    openReleasePage("https://example.com/release")

    expect(mockOpenExternal).toHaveBeenCalledWith("https://example.com/release")
  })
})
