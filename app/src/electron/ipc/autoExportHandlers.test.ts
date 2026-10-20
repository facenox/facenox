// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest"

const { handlers, showOpenDialog, updateConfig, state } = vi.hoisted(() => ({
  handlers: {} as Record<string, () => Promise<unknown>>,
  showOpenDialog: vi.fn(),
  updateConfig: vi.fn(),
  state: { mainWindow: null as object | null },
}))

vi.mock("electron", () => ({
  ipcMain: {
    handle: (key: string, handler: () => Promise<unknown>) => {
      handlers[key] = handler
    },
  },
  dialog: { showOpenDialog },
  shell: { openPath: vi.fn() },
}))
vi.mock("../State.js", () => ({ state }))
vi.mock("../managers/AutoExportManager.js", () => ({
  autoExportManager: {
    getConfig: () => ({ directory: "/saved" }),
    getDefaultExportDirectory: () => "/default",
    updateConfig,
  },
}))
import { registerAutoExportHandlers } from "./autoExportHandlers"

beforeEach(() => {
  vi.clearAllMocks()
  state.mainWindow = null
  registerAutoExportHandlers()
})

it("opens an unparented dialog when no main window exists", async () => {
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/chosen"] })
  expect(await handlers["auto-export:select-directory"]()).toEqual({
    canceled: false,
    path: "/chosen",
  })
  expect(showOpenDialog).toHaveBeenCalledWith({
    title: "Select directory for scheduled reports",
    defaultPath: "/saved",
    properties: ["openDirectory", "createDirectory"],
  })
  expect(updateConfig).toHaveBeenCalledWith({ directory: "/chosen" })
})

it("parents the dialog when a window exists and preserves settings on cancel", async () => {
  state.mainWindow = {}
  showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
  expect(await handlers["auto-export:select-directory"]()).toEqual({ canceled: true, path: null })
  expect(showOpenDialog).toHaveBeenCalledWith(
    state.mainWindow,
    expect.objectContaining({ defaultPath: "/saved" }),
  )
  expect(updateConfig).not.toHaveBeenCalled()
})
