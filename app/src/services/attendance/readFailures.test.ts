import { beforeEach, expect, it, vi } from "vitest"
import { GroupManager } from "./GroupManager"
import { MemberManager } from "./MemberManager"
import { RecordManager } from "./RecordManager"
import type { HttpClient } from "./HttpClient"

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

it.each(["groups", "members", "group members", "records"])(
  "lets callers distinguish a failed %s read from an empty result",
  async (kind) => {
    const error = new Error("HTTP 503")
    const http = { get: vi.fn().mockRejectedValue(error) } as unknown as HttpClient
    const groups = new GroupManager(http, { groups: "/groups" })
    const members = new MemberManager(http, { members: "/members" })
    const records = new RecordManager(
      http,
      { records: "/records" },
      () => "",
      () => {},
      () => {},
    )
    const read = (strict: boolean) => {
      const options = strict ? { throwOnError: true } : undefined
      if (kind === "groups") return groups.getGroups(options)
      if (kind === "members") return members.getMembers(options)
      if (kind === "group members") return groups.getGroupMembers("A", options)
      return records.getRecords(undefined, options)
    }
    await expect(read(false)).resolves.toEqual([])
    await expect(read(true)).rejects.toBe(error)
  },
)
