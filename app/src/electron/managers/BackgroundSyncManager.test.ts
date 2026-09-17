// @vitest-environment node

import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"
import { encryptEmbedding } from "./EmbeddingCrypto.js"
import type { SyncPushPayload } from "../../shared/syncContract.js"

const mockStore: Record<string, unknown> = {}

vi.mock("../persistentStore.js", () => ({
  persistentStore: {
    get: vi.fn((key: string) => mockStore[key]),
    set: vi.fn((key: string, val: unknown) => {
      mockStore[key] = val
    }),
  },
}))

vi.mock("../backendService.js", () => ({
  backendService: {
    getUrl: () => "http://127.0.0.1:8000",
    getToken: () => "mock-backend-token",
  },
}))

vi.mock("../State.js", () => ({
  state: {
    mainWindow: {
      webContents: {
        send: vi.fn(),
      },
    },
  },
}))

vi.mock("../updater.js", () => ({
  getCurrentVersion: () => "1.0.0-test",
  checkForUpdates: vi.fn(),
  notifyRenderer: vi.fn(),
}))

vi.mock("electron", () => ({
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
}))

describe("BackgroundSyncManager", () => {
  const TEST_KEY = Buffer.alloc(32, 1).toString("base64")

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    for (const k of Object.keys(mockStore)) delete mockStore[k]

    mockStore["sync.enabled"] = true
    mockStore["sync.remoteBaseUrl"] = "https://cloud.facenox.test"
    mockStore["sync.siteId"] = "site-test-123"
    mockStore["sync.deviceId"] = "device-test-123"
    mockStore["sync.deviceToken"] = "token-test-123"
    mockStore["sync.encryptionKey"] = TEST_KEY
    mockStore["sync.intervalMinutes"] = 15
    mockStore["sync.lastSyncedAt"] = null

    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts the active commandTimer and polls commands every 30 seconds", async () => {
    const { BackgroundSyncManager } = await import("./BackgroundSyncManager.js")
    const manager = new BackgroundSyncManager()

    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ commands: [] }),
    } as unknown as Response)

    manager.start({ skipCatchUp: true })

    // On start, pollCommands() is called immediately
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.facenox.test/api/devices/commands",
      expect.objectContaining({ method: "GET" }),
    )

    fetchMock.mockClear()

    // Advance by 30 seconds -> commandTimer should trigger pollCommands()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.facenox.test/api/devices/commands",
      expect.objectContaining({ method: "GET" }),
    )

    manager.stop()
  })

  it("handles corrupted embeddings gracefully with continue instead of aborting the whole batch", async () => {
    const { BackgroundSyncManager } = await import("./BackgroundSyncManager.js")
    const manager = new BackgroundSyncManager()

    const validVector = new Uint8Array(512 * 4)
    const validCiphertext = encryptEmbedding(validVector, TEST_KEY)

    const pullPayload = {
      groups: [
        {
          id: "g1",
          name: "Group 1",
          created_at: "2026-03-01T00:00:00.000Z",
          is_active: true,
          settings: {},
        },
      ],
      members: [{ person_id: "p1", name: "Alice", is_active: true }],
      face_embeddings: [
        // 3 consecutive invalid ciphertexts
        { person_id: "bad-1", embedding_encrypted: "corrupt.data.here", embedding_dimension: 512 },
        { person_id: "bad-2", embedding_encrypted: "corrupt.data.here", embedding_dimension: 512 },
        { person_id: "bad-3", embedding_encrypted: "corrupt.data.here", embedding_dimension: 512 },
        // 4th is VALID! With the old break bug, this would be dropped. With continue, it must be imported!
        { person_id: "valid-4", embedding_encrypted: validCiphertext, embedding_dimension: 512 },
      ],
    }

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/sync/pull")) {
        return {
          ok: true,
          status: 200,
          json: async () => pullPayload,
        } as Response
      }
      if (url.includes("/attendance/import-metadata")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, groups_count: 1, members_count: 1 }),
        } as Response
      }
      if (url.includes("/attendance/import-embeddings-batch")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ imported_count: 1 }),
        } as Response
      }
      if (url.includes("/attendance/export")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            groups: [],
            members: [],
            records: [],
            sessions: [],
            exported_at: new Date().toISOString(),
          }),
        } as Response
      }
      if (url.includes("/attendance/export-embeddings")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ embeddings: [] }),
        } as Response
      }
      if (url.includes("/api/sync/push")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, status: "accepted" }),
        } as Response
      }
      if (url.includes("/api/devices/commands")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ commands: [] }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    const result = await manager.performSync()

    expect(result.success).toBe(true)

    // Verify import-embeddings-batch was called with the 4th valid embedding!
    const importEmbeddingsCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/attendance/import-embeddings-batch"))
    expect(importEmbeddingsCall).toBeDefined()
    const requestOptions = importEmbeddingsCall?.[1] as { body?: string } | undefined
    const requestBody = JSON.parse(requestOptions?.body ?? "{}") as {
      embeddings: Array<{ person_id: string }>
    }
    expect(requestBody.embeddings).toHaveLength(1)
    expect(requestBody.embeddings[0].person_id).toBe("valid-4")
  })

  it("executes pullMetadata before attendance export to ensure cloud edits are not overwritten", async () => {
    const { BackgroundSyncManager } = await import("./BackgroundSyncManager.js")
    const manager = new BackgroundSyncManager()

    const callOrder: string[] = []

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/sync/pull")) {
        callOrder.push("PULL_FROM_CLOUD")
        return {
          ok: true,
          status: 200,
          json: async () => ({ groups: [], members: [] }),
        } as Response
      }
      if (url.includes("/attendance/import-metadata")) {
        callOrder.push("IMPORT_TO_LOCAL_DB")
        return {
          ok: true,
          status: 200,
          json: async () => ({ groups_count: 0, members_count: 0 }),
        } as Response
      }
      if (url.includes("/attendance/export-embeddings")) {
        callOrder.push("EXPORT_EMBEDDINGS")
        return {
          ok: true,
          status: 200,
          json: async () => ({ embeddings: [] }),
        } as Response
      }
      if (url.includes("/attendance/export")) {
        callOrder.push("EXPORT_FROM_LOCAL_DB")
        return {
          ok: true,
          status: 200,
          json: async () => ({
            groups: [],
            members: [],
            records: [],
            sessions: [],
            exported_at: new Date().toISOString(),
          }),
        } as Response
      }
      if (url.includes("/api/sync/push")) {
        callOrder.push("PUSH_TO_CLOUD")
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, status: "accepted" }),
        } as Response
      }
      if (url.includes("/api/devices/commands")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ commands: [] }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    await manager.performSync()

    expect(callOrder).toEqual([
      "PULL_FROM_CLOUD",
      "IMPORT_TO_LOCAL_DB",
      "EXPORT_FROM_LOCAL_DB",
      "EXPORT_EMBEDDINGS",
      "PUSH_TO_CLOUD",
    ])
  })

  it("chunks large attendance exports (> 250 records) into multiple batched push requests", async () => {
    const { BackgroundSyncManager } = await import("./BackgroundSyncManager.js")
    const manager = new BackgroundSyncManager()

    // Generate 600 records (should produce 3 chunks: 250, 250, 100)
    const generatedRecords = Array.from({ length: 600 }, (_, i) => ({
      id: `rec-${i}`,
      person_id: `person-${i % 10}`,
      member_id: `person-${i % 10}`,
      group_id: "g1",
      timestamp: new Date(Date.now() - i * 60_000).toISOString(),
      confidence: 0.95,
      is_manual: false,
    }))

    const pushCalls: Array<{ body: SyncPushPayload; headers: Record<string, string> }> = []

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.includes("/api/sync/pull")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ groups: [], members: [] }),
        } as Response
      }
      if (url.includes("/attendance/import-metadata")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ groups_count: 0, members_count: 0 }),
        } as Response
      }
      if (url.includes("/attendance/export-embeddings")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ embeddings: [] }),
        } as Response
      }
      if (url.includes("/attendance/export")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            groups: [
              {
                id: "g1",
                name: "Group 1",
                created_at: "2026-03-01T00:00:00.000Z",
                is_active: true,
                settings: {},
              },
            ],
            members: [{ person_id: "person-1", group_id: "g1", name: "Bob", is_active: true }],
            records: generatedRecords,
            sessions: [],
            exported_at: "2026-03-18T12:00:00.000Z",
          }),
        } as Response
      }
      if (url.includes("/api/sync/push")) {
        pushCalls.push({
          body: JSON.parse(String(init?.body)) as SyncPushPayload,
          headers: (init?.headers ?? {}) as Record<string, string>,
        })
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ ok: true, status: "accepted" }),
        } as Response
      }
      if (url.includes("/api/devices/commands")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ commands: [] }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })

    const result = await manager.performSync()

    expect(result.success).toBe(true)

    // Exactly 3 chunks should have been pushed
    expect(pushCalls).toHaveLength(3)

    // Check chunk 1: 250 records, contains auxiliary metadata, header X-Sync-Chunk: true
    expect(pushCalls[0].body.attendance_export.records).toHaveLength(250)
    expect(pushCalls[0].body.attendance_export.groups).toHaveLength(1)
    expect(pushCalls[0].body.snapshot_id).toContain("part-1-of-3")
    expect(pushCalls[0].headers["X-Sync-Chunk"]).toBe("true")

    // Check chunk 2: 250 records, groups empty to save bandwidth
    expect(pushCalls[1].body.attendance_export.records).toHaveLength(250)
    expect(pushCalls[1].body.attendance_export.groups).toHaveLength(0)
    expect(pushCalls[1].body.snapshot_id).toContain("part-2-of-3")
    expect(pushCalls[1].headers["X-Sync-Chunk"]).toBe("true")

    // Check chunk 3: 100 records (remaining)
    expect(pushCalls[2].body.attendance_export.records).toHaveLength(100)
    expect(pushCalls[2].body.snapshot_id).toContain("part-3-of-3")
    expect(pushCalls[2].headers["X-Sync-Chunk"]).toBe("true")
  })
})
