// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  isDev: vi.fn(),
  existsSync: vi.fn(),
  readdir: vi.fn(),
  appPath: "/mock/app",
}))

vi.mock("electron", () => ({
  ipcMain: {
    handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      mocks.handlers[key] = handler
    },
  },
  app: {
    getAppPath: () => mocks.appPath,
  },
}))

vi.mock("../util.js", () => ({
  default: () => mocks.isDev(),
}))

vi.mock("node:fs", () => ({
  existsSync: (p: string) => mocks.existsSync(p),
}))

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: (p: string, opts: unknown) => mocks.readdir(p, opts),
  },
}))

import { registerAssetHandlers, getRecognitionSoundsDir } from "./assetHandlers"

describe("assetHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers = {}
    mocks.isDev.mockReturnValue(false)
    mocks.existsSync.mockReturnValue(false)
  })

  describe("getRecognitionSoundsDir", () => {
    it("resolves to renderer directory in production when it exists", () => {
      mocks.isDev.mockReturnValue(false)
      mocks.existsSync.mockImplementation((dir: string) => {
        return dir.includes("renderer")
      })

      const dir = getRecognitionSoundsDir()
      expect(dir).toContain("renderer")
      expect(dir).not.toContain("dist-react")
    })

    it("resolves to public directory in development when it exists", () => {
      mocks.isDev.mockReturnValue(true)
      mocks.existsSync.mockImplementation((dir: string) => {
        return dir.includes("public")
      })

      const dir = getRecognitionSoundsDir()
      expect(dir).toContain("public")
    })

    it("falls back safely without throwing if none exist on disk", () => {
      mocks.isDev.mockReturnValue(false)
      mocks.existsSync.mockReturnValue(false)

      const dir = getRecognitionSoundsDir()
      expect(dir).toContain("renderer")
    })
  })

  describe("assets:list-recognition-sounds handler", () => {
    it("registers the IPC handler", () => {
      registerAssetHandlers()
      expect(mocks.handlers["assets:list-recognition-sounds"]).toBeDefined()
    })

    it("lists valid sound files with .mp3, .wav, .ogg, .m4a and ignores others", async () => {
      registerAssetHandlers()
      const handler = mocks.handlers["assets:list-recognition-sounds"]

      mocks.readdir.mockResolvedValue([
        { isFile: () => true, name: "Classic_Beep.wav" },
        { isFile: () => true, name: "custom_alert.mp3" },
        { isFile: () => true, name: "notes.txt" },
        { isFile: () => false, name: "subfolder" },
        { isFile: () => true, name: "Soft_Pop.wav" },
      ])

      const result = (await handler(null)) as Array<{ fileName: string; url: string }>

      expect(result).toHaveLength(3)
      expect(result).toEqual([
        { fileName: "Classic_Beep.wav", url: "./assets/sounds/Classic_Beep.wav" },
        { fileName: "custom_alert.mp3", url: "./assets/sounds/custom_alert.mp3" },
        { fileName: "Soft_Pop.wav", url: "./assets/sounds/Soft_Pop.wav" },
      ])
    })

    it("returns empty array gracefully when readdir fails", async () => {
      registerAssetHandlers()
      const handler = mocks.handlers["assets:list-recognition-sounds"]

      mocks.readdir.mockRejectedValue(new Error("ENOENT: no such file or directory"))

      const result = await handler(null)
      expect(result).toEqual([])
    })
  })
})
