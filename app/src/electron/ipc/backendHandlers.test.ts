// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const { handlers } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
}))
vi.mock("electron", () => ({
  ipcMain: {
    handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers[key] = handler
    },
  },
}))
vi.mock("../backendService.js", () => ({
  backendService: { getUrl: () => "http://127.0.0.1:8000", getToken: () => "test-token" },
}))
vi.mock("../localBackendScope.js", () => ({
  withLocalBackendHeaders: (headers: Record<string, string>) => headers,
}))
import { registerBackendHandlers } from "./backendHandlers"

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn())
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  registerBackendHandlers()
})
afterEach(() => vi.unstubAllGlobals())

it.each([
  ['{"detail":"Invalid upload"}', "Invalid upload"],
  ['{"error":"Not allowed"}', "Not allowed"],
  ['{"detail":[{"msg":"bad"}]}', "HTTP 422: Unprocessable Entity"],
  ["null", "HTTP 422: Unprocessable Entity"],
  ["not JSON", "HTTP 422: Unprocessable Entity"],
])("handles multipart failure body %s without unsafe property access", async (body, message) => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(body, { status: 422, statusText: "Unprocessable Entity" }),
  )
  await expect(handlers["backend:post-multipart"](null, "/face/enroll", [])).rejects.toThrow(
    message,
  )
})
