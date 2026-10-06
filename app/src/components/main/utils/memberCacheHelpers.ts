/**
 * Helper utilities for managing local state caching of attendance members
 * to optimize rendering cycles and avoid redundant IPC/API database roundtrips.
 */

import { attendanceManager } from "@/services"
import { ALL_GROUPS_ID } from "@/components/main/hooks/useAttendanceGroups"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

/**
 * Retrieves a member's metadata from cache, falling back to a database lookup if not yet loaded.
 *
 * @param personId The unique identifier of the member to search.
 * @param currentGroup The group context to validate membership against. If provided,
 *   the returned member must match the group ID (unless in All Groups kiosk mode), otherwise `null` is returned.
 * @param memberCacheRef A reference to the Map caching the member lookups.
 * @returns A promise resolving to the member object and their computed display name,
 *   or `null` if the member is invalid or not in the target group.
 */
export async function getMemberFromCache(
  personId: string,
  currentGroup: AttendanceGroup | null,
  memberCacheRef: React.RefObject<Map<string, AttendanceMember | null>>,
): Promise<{ member: AttendanceMember | null; memberName: string } | null> {
  try {
    if (!memberCacheRef.current) return null
    let member = memberCacheRef.current.get(personId)
    if (member === undefined) {
      member = (await attendanceManager.getMember(personId)) || null
      if (member) {
        memberCacheRef.current.set(personId, member)
      }
    }

    if (!member) {
      return null
    }

    if (currentGroup && currentGroup.id !== ALL_GROUPS_ID && currentGroup.id !== "all") {
      if (member.group_id !== currentGroup.id) {
        return null
      }
    }

    const memberName = member.name || personId
    return { member, memberName }
  } catch {
    if (currentGroup) {
      return null
    } else {
      return { member: null, memberName: personId }
    }
  }
}
