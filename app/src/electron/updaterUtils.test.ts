import { describe, expect, it } from "vitest"
import {
  compareVersions,
  extractSemverLikeVersion,
  getDownloadUrlForPlatform,
} from "@/electron/updaterUtils"

describe("updaterUtils", () => {
  it("extracts semver-like versions from release tags", () => {
    expect(extractSemverLikeVersion("v1.2.3")).toBe("1.2.3")
    expect(extractSemverLikeVersion("1.2.3-beta.1")).toBe("1.2.3-beta.1")
    expect(extractSemverLikeVersion("Release v1.2.3")).toBe("1.2.3")
  })

  it("compares stable and prerelease versions correctly", () => {
    expect(compareVersions("1.2.3", "1.2.2")).toBe(1)
    expect(compareVersions("1.2.3", "1.2.3-beta.1")).toBe(1)
    expect(compareVersions("1.2.3-beta.2", "1.2.3-beta.1")).toBe(1)
    expect(compareVersions("1.2.3-beta.1", "1.2.3-beta.2")).toBe(-1)
  })

  it("selects download assets based on platform", () => {
    const assets = [
      { name: "Facenox.dmg", browser_download_url: "https://example.com/macos" },
      { name: "Facenox.exe", browser_download_url: "https://example.com/windows" },
      { name: "Facenox.AppImage", browser_download_url: "https://example.com/linux" },
    ]

    expect(getDownloadUrlForPlatform(assets, "win32")).toBe("https://example.com/windows")
    expect(getDownloadUrlForPlatform(assets, "darwin")).toBe("https://example.com/macos")
    expect(getDownloadUrlForPlatform(assets, "linux")).toBe("https://example.com/linux")
  })
})
