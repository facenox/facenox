import { describe, it, expect, vi, beforeEach } from "vitest"
import { getMemberFromCache } from "./memberCacheHelpers"
import { attendanceManager } from "@/services"
import { ALL_GROUPS_ID } from "../hooks/useAttendanceGroups"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

vi.mock("@/services", () => ({
  attendanceManager: {
    getMember: vi.fn(),
  },
}))

describe("getMemberFromCache", () => {
  const memberCacheRef = { current: new Map<string, AttendanceMember | null>() }
  const mockGroup: AttendanceGroup = {
    id: "group-1",
    name: "Group 1",
    created_at: new Date().toISOString(),
    is_active: true,
  }
  const otherGroup: AttendanceGroup = {
    id: "group-2",
    name: "Group 2",
    created_at: new Date().toISOString(),
    is_active: true,
  }
  const allGroupsVirtual: AttendanceGroup = {
    id: ALL_GROUPS_ID,
    name: "All Groups",
    created_at: new Date().toISOString(),
    is_active: true,
  }
  const mockMember: AttendanceMember = {
    id: "mem-1",
    person_id: "person-1",
    name: "Alice",
    group_id: "group-1",
    role: "student",
    has_consent: true,
    has_face_data: true,
    is_active: true,
    is_deleted: false,
    created_at: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    memberCacheRef.current = new Map()
  })

  it("retries fetching member metadata after enrollment instead of staying locked", async () => {
    // First call: member does not exist in DB yet
    vi.mocked(attendanceManager.getMember).mockResolvedValueOnce(undefined)

    const result1 = await getMemberFromCache("person-1", mockGroup, memberCacheRef)
    expect(result1).toBeNull()
    expect(attendanceManager.getMember).toHaveBeenCalledTimes(1)

    // Second call: member was enrolled/created in DB
    vi.mocked(attendanceManager.getMember).mockResolvedValueOnce(mockMember)

    const result2 = await getMemberFromCache("person-1", mockGroup, memberCacheRef)
    expect(attendanceManager.getMember).toHaveBeenCalledTimes(2)
    expect(result2).toEqual({
      member: mockMember,
      memberName: "Alice",
    })

    // Third call: should read from cache without extra API calls
    const result3 = await getMemberFromCache("person-1", mockGroup, memberCacheRef)
    expect(attendanceManager.getMember).toHaveBeenCalledTimes(2)
    expect(result3?.memberName).toBe("Alice")
  })

  it("All Groups mode (ALL_GROUPS_ID) resolves members from any group", async () => {
    vi.mocked(attendanceManager.getMember).mockResolvedValueOnce(mockMember)

    const result = await getMemberFromCache("person-1", allGroupsVirtual, memberCacheRef)
    expect(result).toEqual({
      member: mockMember,
      memberName: "Alice",
    })
  })

  it("filters out members not belonging to active group in single group mode", async () => {
    vi.mocked(attendanceManager.getMember).mockResolvedValueOnce(mockMember)

    const result = await getMemberFromCache("person-1", otherGroup, memberCacheRef)
    expect(result).toBeNull()
  })
})
