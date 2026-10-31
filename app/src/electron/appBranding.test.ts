// @vitest-environment node

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const appMock = vi.hoisted(() => ({
  isPackaged: false,
  getAppPath: vi.fn(),
  setAppUserModelId: vi.fn(),
}))

vi.mock("electron", () => ({ app: appMock }))

import { getWindowIconPath, getTrayIconPath } from "./iconPaths.js"
import { configureAppIdentity } from "./appIdentity.js"

const appRoot = fileURLToPath(new URL("../../", import.meta.url))
const resourcesRoot = path.join("installed", "resources")
const config = JSON.parse(fs.readFileSync(path.join(appRoot, "electron-builder.json"), "utf8"))
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!
const originalResourcesPath = Object.getOwnPropertyDescriptor(process, "resourcesPath")
const platforms = ["win32", "darwin", "linux"] as const
const windowIcons = { win32: "logo.ico", darwin: "logo.png", linux: "logo-transparent.png" }
const trayIcons = { win32: "logo.png", darwin: "logo.png", linux: "logo-transparent.png" }

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { ...originalPlatform, value: platform })
}

beforeEach(() => {
  appMock.isPackaged = false
  appMock.getAppPath.mockReturnValue(appRoot)
  appMock.setAppUserModelId.mockClear()
  Object.defineProperty(process, "resourcesPath", { configurable: true, value: resourcesRoot })
})

afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform)
  if (originalResourcesPath) {
    Object.defineProperty(process, "resourcesPath", originalResourcesPath)
  } else {
    Reflect.deleteProperty(process, "resourcesPath")
  }
})

describe("window and tray icons", () => {
  it.each(platforms)("uses existing development assets on %s", (platform) => {
    setPlatform(platform)
    expect(getWindowIconPath()).toBe(path.join(appRoot, "public", "icons", windowIcons[platform]))
    expect(getTrayIconPath()).toBe(path.join(appRoot, "public", "icons", trayIcons[platform]))
    expect(fs.existsSync(getWindowIconPath())).toBe(true)
    expect(fs.existsSync(getTrayIconPath())).toBe(true)
  })

  it.each(platforms)("uses external resource paths in packaged %s builds", (platform) => {
    setPlatform(platform)
    appMock.isPackaged = true
    expect(getWindowIconPath()).toBe(path.join(resourcesRoot, "icons", windowIcons[platform]))
    expect(getTrayIconPath()).toBe(path.join(resourcesRoot, "icons", trayIcons[platform]))
  })

  it.each(platforms)("packages the window and tray assets required on %s", (platform) => {
    setPlatform(platform)
    appMock.isPackaged = true
    const target =
      platform === "win32" ? "win"
      : platform === "darwin" ? "mac"
      : "linux"
    const iconResource = config[target].extraResources.find(
      (resource: { from: string; to: string }) => resource.to === "icons",
    )
    expect(iconResource).toBeDefined()
    for (const runtimePath of [getWindowIconPath(), getTrayIconPath()]) {
      const relativeIcon = path.relative(path.join(resourcesRoot, "icons"), runtimePath)
      expect(fs.existsSync(path.join(appRoot, iconResource.from, relativeIcon))).toBe(true)
    }
  })
})

describe("Windows taskbar identity", () => {
  it("matches the installer identity for packaged builds", () => {
    setPlatform("win32")
    appMock.isPackaged = true
    configureAppIdentity()
    expect(appMock.setAppUserModelId).toHaveBeenCalledExactlyOnceWith(config.appId)
  })

  it("separates unpackaged Electron builds from the installed app", () => {
    setPlatform("win32")
    configureAppIdentity()
    expect(appMock.setAppUserModelId).toHaveBeenCalledExactlyOnceWith("com.facenox.app.dev")
    expect(appMock.setAppUserModelId).not.toHaveBeenCalledWith(config.appId)
  })

  it.each(["darwin", "linux"] as const)("does not set a Windows identity on %s", (platform) => {
    setPlatform(platform)
    configureAppIdentity()
    expect(appMock.setAppUserModelId).not.toHaveBeenCalled()
  })
})
