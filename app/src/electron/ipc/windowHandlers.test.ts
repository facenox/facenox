// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockHandle,
  mockOn,
  mockUpdateSplashProgress,
  mockUpdateSplashDataStep,
  mockRevealMainWindowFromSplash,
  mockHandleSplashProgressRendered,
} = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockOn: vi.fn(),
  mockUpdateSplashProgress: vi.fn(),
  mockUpdateSplashDataStep: vi.fn(),
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
    updateSplashProgress: mockUpdateSplashProgress,
    updateSplashDataStep: mockUpdateSplashDataStep,
    handleSplashProgressRendered: mockHandleSplashProgressRendered,
    revealMainWindowFromSplash: mockRevealMainWindowFromSplash,
  },
}))

describe("registerWindowHandlers", () => {
  beforeEach(() => {
    vi.resetModules()
    mockHandle.mockReset()
    mockOn.mockReset()
    mockUpdateSplashProgress.mockReset()
    mockUpdateSplashDataStep.mockReset()
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
      (() => void) | undefined
    const splashProgressListener = mockOn.mock.calls.find(
      ([channel]) => channel === "splash:update-progress",
    )?.[1] as ((_event: unknown, progress: number, detail?: string) => void) | undefined
    const splashDataStepListener = mockOn.mock.calls.find(
      ([channel]) => channel === "splash:update-data-step",
    )?.[1] as ((_event: unknown, step: number, detail?: string) => void) | undefined
    const splashRenderedListener = mockOn.mock.calls.find(
      ([channel]) => channel === "splash:rendered-progress",
    )?.[1] as ((_event: unknown, progress: number) => void) | undefined

    splashProgressListener?.({}, 78, "Opening Facenox")
    splashDataStepListener?.({}, 8, "Loading attendance data")
    splashRenderedListener?.({}, 100)
    appReadyListener?.()

    expect(mockUpdateSplashProgress).toHaveBeenCalledWith(78, "Opening Facenox")
    expect(mockUpdateSplashDataStep).toHaveBeenCalledWith(8, "Loading attendance data")
    expect(mockHandleSplashProgressRendered).toHaveBeenCalledWith(100)
    expect(mockRevealMainWindowFromSplash).toHaveBeenCalledTimes(1)
  })
})
