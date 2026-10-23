import { describe, expect, it } from "vitest"
import { formatErrorMessage, isOfflineError, parseSyncError } from "./syncErrorUtils"

describe("syncErrorUtils", () => {
  describe("isOfflineError", () => {
    it("detects fetch failed as an offline error", () => {
      expect(isOfflineError("fetch failed")).toBe(true)
      expect(isOfflineError("TypeError: fetch failed")).toBe(true)
    })

    it("detects network errors", () => {
      expect(isOfflineError("Network error: ECONNREFUSED 127.0.0.1:443")).toBe(true)
      expect(isOfflineError("getaddrinfo ENOTFOUND api.facenox.com")).toBe(true)
      expect(isOfflineError("No internet connection")).toBe(true)
      expect(isOfflineError("connect ETIMEDOUT")).toBe(true)
    })

    it("returns false for server-side business errors", () => {
      expect(isOfflineError("Invalid pairing token")).toBe(false)
      expect(isOfflineError("Unauthorized: 401")).toBe(false)
      expect(isOfflineError("Internal Server Error 500")).toBe(false)
      expect(isOfflineError(null)).toBe(false)
    })
  })

  describe("formatErrorMessage", () => {
    it("converts HTML dumps to friendly error message", () => {
      expect(formatErrorMessage("<!DOCTYPE html><html><body>502 Bad Gateway</body></html>")).toBe(
        "Cloud returned an unexpected response. Check the server address in Cloud sync settings.",
      )
    })

    it("returns plain error as-is", () => {
      expect(formatErrorMessage("Device pairing was denied")).toBe("Device pairing was denied")
    })
  })

  describe("parseSyncError", () => {
    it("detects plan quota limits", () => {
      const parsed = parseSyncError("Plan limit exceeded: reached 150 (limit: 100)")
      expect(parsed.isPlanQuota).toBe(true)
      expect(parsed.currentPeople).toBe(150)
      expect(parsed.peopleLimit).toBe(100)
    })
  })
})
