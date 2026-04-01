// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockHandle, mockOn, mockRevealMainWindowFromSplash, mockHandleSplashProgressRendered } =
  vi.hoisted(() => ({
    mockHandle: vi.fn(),
    mockOn: vi.fn(),
    mockRevealMainWindowFromSplash: vi.fn(),
    mockHandleSplashProgressRendered: vi.fn(),
  }))

const mockMainWindow = {
  minimize: vi.fn(),
  isMaximized: vi.fn(),
  unmaximize: vi.fn(),
  maximize: vi.fn(),
  close: vi.fn(),
}

vi.mock("electron", () => ({
  ipcMain: {
    handle: mockHandle,
    on: mockOn,
  },
}))

vi.mock("../State.js", () => ({
  state: {
    mainWindow: mockMainWindow,
  },
}))

vi.mock("../window/WindowManager.js", () => ({
  WindowManager: {
    updateSplashProgress: vi.fn(),
    updateSplashDataStep: vi.fn(),
    handleSplashProgressRendered: mockHandleSplashProgressRendered,
    revealMainWindowFromSplash: mockRevealMainWindowFromSplash,
  },
}))

describe("registerWindowHandlers", () => {
  beforeEach(() => {
    vi.resetModules()
    mockHandle.mockReset()
    mockOn.mockReset()
    mockRevealMainWindowFromSplash.mockReset()
    mockHandleSplashProgressRendered.mockReset()
    mockMainWindow.minimize.mockReset()
    mockMainWindow.isMaximized.mockReset()
    mockMainWindow.unmaximize.mockReset()
    mockMainWindow.maximize.mockReset()
    mockMainWindow.close.mockReset()
  })

  it("registers invoke handlers and toggles window maximize state correctly", async () => {
    const { registerWindowHandlers } = await import("@/electron/ipc/windowHandlers")

    registerWindowHandlers()

    const minimizeHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === "window:minimize",
    )?.[1]
    const maximizeHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === "window:maximize",
    )?.[1]
    const closeHandler = mockHandle.mock.calls.find(([channel]) => channel === "window:close")?.[1]

    mockMainWindow.isMaximized.mockReturnValueOnce(false)
    expect(await minimizeHandler?.()).toBe(true)
    expect(await maximizeHandler?.()).toBe(true)
    expect(await closeHandler?.()).toBe(true)

    expect(mockMainWindow.minimize).toHaveBeenCalledTimes(1)
    expect(mockMainWindow.maximize).toHaveBeenCalledTimes(1)
    expect(mockMainWindow.unmaximize).not.toHaveBeenCalled()
    expect(mockMainWindow.close).toHaveBeenCalledTimes(1)

    mockMainWindow.isMaximized.mockReturnValueOnce(true)
    expect(await maximizeHandler?.()).toBe(true)
    expect(mockMainWindow.unmaximize).toHaveBeenCalledTimes(1)
  })

  it("registers splash/app events and reveals the main window when the app is ready", async () => {
    const { registerWindowHandlers } = await import("@/electron/ipc/windowHandlers")

    registerWindowHandlers()

    const appReadyListener = mockOn.mock.calls.find(([channel]) => channel === "app:ready")?.[1] as
      | (() => void)
      | undefined
    const splashRenderedListener = mockOn.mock.calls.find(
      ([channel]) => channel === "splash:rendered-progress",
    )?.[1] as ((_event: unknown, progress: number) => void) | undefined

    splashRenderedListener?.({}, 100)
    appReadyListener?.()

    expect(mockHandleSplashProgressRendered).toHaveBeenCalledWith(100)
    expect(mockRevealMainWindowFromSplash).toHaveBeenCalledTimes(1)
  })
})
