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
      currentVersion: "1.0.0-beta.1",
      hasUpdate: false,
      isOffline: true,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns a graceful error payload for non-semver release tags", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tag_name: "latest-release",
        body: "notes",
        html_url: "https://example.com/release",
        published_at: "2026-04-01T00:00:00.000Z",
        assets: [],
      }),
    } as Response)

    const { checkForUpdates } = await loadUpdater()
    const result = await checkForUpdates()

    expect(result.hasUpdate).toBe(false)
    expect(result.error).toContain("semantic version")
  })

  it("reuses cached results when not forced", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        tag_name: "v1.0.1",
        body: "",
        html_url: "https://example.com/release",
        published_at: "2026-04-01T00:00:00.000Z",
        assets: [],
      }),
    } as Response)

    const { checkForUpdates } = await loadUpdater()

    await checkForUpdates()
    await checkForUpdates()

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("delegates release page opening to Electron shell", async () => {
    const { openReleasePage } = await loadUpdater()

    openReleasePage("https://example.com/release")

    expect(mockOpenExternal).toHaveBeenCalledWith("https://example.com/release")
  })
})
