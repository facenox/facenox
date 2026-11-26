import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const electronMocks = vi.hoisted(() => ({
  getAppPath: vi.fn(),
  getPath: vi.fn(),
}))

const isDevMock = vi.hoisted(() => vi.fn())

vi.mock("electron", () => ({
  app: electronMocks,
}))

vi.mock("./util.js", () => ({
  default: isDevMock,
}))

import { getDataDirectory, getLegacyDataDirectory, getLogDirectory } from "./paths.js"

describe("Electron storage paths", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    electronMocks.getAppPath.mockReturnValue(path.join("workspace", "app"))
    electronMocks.getPath.mockReturnValue(path.join("profile", "Facenox"))
  })

  it("separates production data and logs", () => {
    isDevMock.mockReturnValue(false)

    expect(getDataDirectory()).toBe(path.join("profile", "Facenox", "data"))
    expect(getLogDirectory()).toBe(path.join("profile", "Facenox", "logs"))
  })

  it("keeps development data and logs in the repository data directory", () => {
    isDevMock.mockReturnValue(true)

    const expected = path.join("workspace", "data")
    expect(getDataDirectory()).toBe(expected)
    expect(getLogDirectory()).toBe(expected)
  })

  it.skipIf(process.platform !== "linux")(
    "finds a database in the previous lowercase Linux profile",
    () => {
      const appData = fs.mkdtempSync(path.join(os.tmpdir(), "facenox-paths-"))
      const legacy = path.join(appData, "facenox")
      const current = path.join(appData, "Facenox")
      fs.mkdirSync(legacy)
      fs.writeFileSync(path.join(legacy, "attendance.db"), "legacy")
      electronMocks.getPath.mockImplementation((name: string) =>
        name === "appData" ? appData : current,
      )
      expect(getLegacyDataDirectory()).toBe(legacy)
    },
  )
})
