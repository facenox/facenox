// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockExposeInMainWorld, mockInvoke, mockSend, mockOn, mockRemoveListener } = vi.hoisted(
  () => ({
    mockExposeInMainWorld: vi.fn(),
    mockInvoke: vi.fn(),
    mockSend: vi.fn(),
    mockOn: vi.fn(),
    mockRemoveListener: vi.fn(),
  }),
)

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mockInvoke,
    send: mockSend,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}))

describe("preload bridge", () => {
  beforeEach(() => {
    vi.resetModules()
    mockExposeInMainWorld.mockReset()
    mockInvoke.mockReset()
    mockSend.mockReset()
    mockOn.mockReset()
    mockRemoveListener.mockReset()
  })

  it("exposes the renderer APIs and forwards invoke/send calls to the expected channels", async () => {
    await import("@/electron/preload")

    const exposedEntries = Object.fromEntries(mockExposeInMainWorld.mock.calls) as Record<
      string,
      Record<string, unknown>
    >
    const electronAPI = exposedEntries.electronAPI as {
      backend: { checkReadiness: () => Promise<unknown> }
      store: { set: (key: string, value: unknown) => Promise<unknown> }
      updater: { openReleasePage: (url?: string) => Promise<unknown> }
    }
    const facenoxElectron = exposedEntries.facenoxElectron as {
      maximize: () => Promise<unknown>
      updateSplashDataStep: (step: number) => void
      onAppReady: () => void
    }

    await electronAPI.backend.checkReadiness()
    await electronAPI.store.set("ui.sidebarWidth", 320)
    await electronAPI.updater.openReleasePage("https://example.com/release")
    await facenoxElectron.maximize()
    facenoxElectron.updateSplashDataStep(9)
    facenoxElectron.onAppReady()

    expect(mockExposeInMainWorld).toHaveBeenCalledWith("electronAPI", expect.any(Object))
    expect(mockExposeInMainWorld).toHaveBeenCalledWith("facenoxElectron", expect.any(Object))
    expect(mockInvoke).toHaveBeenCalledWith("backend:check-readiness")
    expect(mockInvoke).toHaveBeenCalledWith("store:set", "ui.sidebarWidth", 320)
    expect(mockInvoke).toHaveBeenCalledWith(
      "updater:open-release-page",
      "https://example.com/release",
    )
    expect(mockInvoke).toHaveBeenCalledWith("window:maximize")
    expect(mockSend).toHaveBeenCalledWith("splash:update-data-step", 9)
    expect(mockSend).toHaveBeenCalledWith("app:ready")
  })

  it("returns unsubscribe functions for listener-based APIs and removes the same handler", async () => {
    await import("@/electron/preload")

    const exposedEntries = Object.fromEntries(mockExposeInMainWorld.mock.calls) as Record<
      string,
      Record<string, unknown>
    >
    const electronAPI = exposedEntries.electronAPI as {
      updater: {
        onUpdateAvailable: (
          callback: (payload: {
            currentVersion: string
            latestVersion: string
            hasUpdate: boolean
            releaseUrl: string
            releaseNotes: string
            publishedAt: string
            downloadUrl: string | null
          }) => void,
        ) => () => void
      }
    }
    const facenoxElectron = exposedEntries.facenoxElectron as {
      onMaximize: (callback: () => void) => () => void
    }

    const updateCallback = vi.fn()
    const maximizeCallback = vi.fn()

    const disposeUpdate = electronAPI.updater.onUpdateAvailable(updateCallback)
    const disposeMaximize = facenoxElectron.onMaximize(maximizeCallback)

    const updateListener = mockOn.mock.calls.find(
      ([channel]) => channel === "updater:update-available",
    )?.[1] as ((event: unknown, payload: unknown) => void) | undefined
    const maximizeListener = mockOn.mock.calls.find(
      ([channel]) => channel === "window:maximized",
    )?.[1] as (() => void) | undefined

    expect(updateListener).toBeTypeOf("function")
    expect(maximizeListener).toBeTypeOf("function")

    updateListener?.(null, {
      currentVersion: "1.0.0-beta.1",
      latestVersion: "1.0.1",
      hasUpdate: true,
      releaseUrl: "https://example.com/release",
      releaseNotes: "Bug fixes",
      publishedAt: "2026-04-01T00:00:00.000Z",
      downloadUrl: null,
    })
    maximizeListener?.()

    expect(updateCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        latestVersion: "1.0.1",
        hasUpdate: true,
      }),
    )
    expect(maximizeCallback).toHaveBeenCalledTimes(1)

    disposeUpdate()
    disposeMaximize()

    expect(mockRemoveListener).toHaveBeenCalledWith("updater:update-available", updateListener)
    expect(mockRemoveListener).toHaveBeenCalledWith("window:maximized", maximizeListener)
  })
})
