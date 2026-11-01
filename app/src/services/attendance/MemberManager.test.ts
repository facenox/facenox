import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { MemberManager } from "./MemberManager"
import type { BulkMemberCreationResponse } from "./MemberManager"
import { HttpClient } from "./HttpClient"

vi.mock("@/utils/syncNotifier", () => ({ notifyDataChanged: vi.fn() }))
vi.mock("@/services/WebSocketService", () => ({
  webSocketService: { refreshActiveStream: vi.fn() },
}))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it("retries a lost creation response with exactly the same creation token", async () => {
  const requests: Array<Record<string, string>> = []
  const saved = new Map<string, Record<string, string>>()
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body))
    requests.push(body)
    if (!saved.has(body.creation_id))
      saved.set(body.creation_id, {
        ...body,
        id: "member-1",
        person_id: "person-1",
        joined_at: "2026-11-01T00:00:00Z",
      })
    if (requests.length === 1) throw new TypeError("Failed to fetch")
    return Response.json(saved.get(body.creation_id))
  })
  vi.stubGlobal("fetch", fetch)
  const manager = new MemberManager(new HttpClient("http://test.invalid"), { members: "/members" })
  const pending = manager.addMember("g", "Alice")
  await vi.advanceTimersByTimeAsync(1000)
  const member = await pending
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(requests[0]).toEqual(requests[1])
  expect(requests[0].creation_id).toEqual(expect.any(String))
  expect(saved.size).toBe(1)
  expect(member.person_id).toBe("person-1")
})

it("preserves an explicit creation token for a manual retry", async () => {
  const post = vi
    .fn<(endpoint: string, data: Record<string, string>) => Promise<Record<string, string>>>()
    .mockResolvedValue({ id: "m", person_id: "p", joined_at: "2026-11-01T00:00:00Z" })
  const manager = new MemberManager({ post } as unknown as HttpClient, { members: "/members" })
  await manager.addMember("g", " Alice ", { creationId: "same-intent", role: " Role " })
  await manager.addMember("g", " Alice ", { creationId: "same-intent", role: " Role " })
  expect(post.mock.calls[0]).toEqual(post.mock.calls[1])
  expect(post).toHaveBeenCalledWith(
    "/members",
    expect.objectContaining({ creation_id: "same-intent", name: "Alice", role: "Role" }),
  )
})

it("uses different creation tokens for distinct add-member actions", async () => {
  const post = vi
    .fn<(endpoint: string, data: Record<string, string>) => Promise<Record<string, string>>>()
    .mockResolvedValue({ id: "m", person_id: "p", joined_at: "2026-11-01T00:00:00Z" })
  const manager = new MemberManager({ post } as unknown as HttpClient, { members: "/members" })
  await manager.addMember("g", "Alice")
  await manager.addMember("g", "Alice")
  expect(post.mock.calls[0][1].creation_id).not.toBe(post.mock.calls[1][1].creation_id)
})

it("retries a lost bulk response with the same per-row tokens", async () => {
  const requests: Array<{ members: Array<Record<string, string>> }> = []
  const saved = new Map<string, Record<string, string>>()
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body))
    requests.push(body)
    const members = body.members.map((row: Record<string, string>) => {
      if (!saved.has(row.creation_id))
        saved.set(row.creation_id, {
          ...row,
          id: row.creation_id,
          person_id: row.creation_id,
          joined_at: "2026-11-01T00:00:00Z",
        })
      return saved.get(row.creation_id)
    })
    if (requests.length === 1) throw new TypeError("Failed to fetch")
    return Response.json({ success_count: members.length, error_count: 0, errors: [], members })
  })
  vi.stubGlobal("fetch", fetch)
  const manager = new MemberManager(new HttpClient("http://test.invalid"), { members: "/members" })
  const pending = manager.addMembersBulk([{ name: "Alice" }, { name: "Bob" }], "g")
  await vi.advanceTimersByTimeAsync(1000)
  const response = await pending
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
  expect(saved.size).toBe(2)
  expect(response.success_count).toBe(2)
  expect(response.members[0].joined_at).toBeInstanceOf(Date)
})

it("keeps explicit bulk tokens when retrying only a subset of rows", async () => {
  const post = vi
    .fn<
      (
        endpoint: string,
        data: { members: Array<Record<string, string>> },
      ) => Promise<BulkMemberCreationResponse>
    >()
    .mockResolvedValue({ success_count: 0, error_count: 0, errors: [], members: [] })
  const manager = new MemberManager({ post } as unknown as HttpClient, { members: "/members" })
  await manager.addMembersBulk(
    [
      { name: "Alice", creationId: "a" },
      { name: "Bob", creationId: "b" },
    ],
    "g",
  )
  await manager.addMembersBulk([{ name: "Bob", creationId: "b" }], "g")
  expect(post.mock.calls[0][1].members[1]).toEqual(post.mock.calls[1][1].members[0])
})

it("gives identical names different tokens when they are separate bulk rows", async () => {
  const post = vi
    .fn<
      (
        endpoint: string,
        data: { members: Array<Record<string, string>> },
      ) => Promise<BulkMemberCreationResponse>
    >()
    .mockResolvedValue({ success_count: 0, error_count: 0, errors: [], members: [] })
  const manager = new MemberManager({ post } as unknown as HttpClient, { members: "/members" })
  await manager.addMembersBulk([{ name: "Alice" }, { name: "Alice" }], "g")
  const rows = post.mock.calls[0][1].members
  expect(rows[0].creation_id).not.toBe(rows[1].creation_id)
})
