import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { attendanceManager, backendService } from "@/services"
import { generateGroupDisplayNames } from "@/utils"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { useAttendanceStore } from "@/components/main/stores"
import type { DialogAPI } from "@/components/shared"
import type {
  GroupWithMembers,
  EditingMember,
  EditingGroup,
  MemberField,
  GroupField,
} from "@/components/settings/sections/types"

/**
 * Orchestrates member directory operations, database/history purging,
 * caching invalidation, and UI sync workflows for the database management view.
 * Decouples interactive dialog prompts and state updates from component markup.
 */
export function useDatabaseManagement(
  groups: AttendanceGroup[],
  onGroupsChanged?: () => void,
  dialog?: DialogAPI,
  loadDirectory = true,
) {
  const { setGroupToDelete, setShowDeleteConfirmation, showDeleteConfirmation, groupToDelete } =
    useAttendanceStore()

  // Initialize with groups if available to prevent "No results found" flash
  const [groupsWithMembers, setGroupsWithMembers] = useState<GroupWithMembers[]>(() =>
    groups.map((g) => ({ ...g, members: [], isLoading: true })),
  )

  // Ref to keep track of groupsWithMembers to avoid stale closures in useEffect
  const groupsWithMembersRef = useRef(groupsWithMembers)
  useEffect(() => {
    groupsWithMembersRef.current = groupsWithMembers
  }, [groupsWithMembers])

  const [isInitialLoad, setIsInitialLoad] = useState(() => groups.length === 0)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [editingMember, setEditingMember] = useState<EditingMember | null>(null)
  const [editingGroup, setEditingGroup] = useState<EditingGroup | null>(null)
  const [editValue, setEditValue] = useState("")
  const [savingMember, setSavingMember] = useState<string | null>(null)
  const [savingGroup, setSavingGroup] = useState<string | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)
  const [deletingMember, setDeletingMember] = useState<string | null>(null)

  useEffect(() => {
    if (!showDeleteConfirmation || !groupToDelete) {
      setDeletingGroup(null)
    }
  }, [showDeleteConfirmation, groupToDelete])

  // Load members for all groups
  useEffect(() => {
    if (!loadDirectory) return
    const loadMembers = async () => {
      // If we already have some data, don't show the full page loader
      if (groupsWithMembersRef.current.length === 0) {
        setIsInitialLoad(true)
      }

      const groupsData: GroupWithMembers[] = await Promise.all(
        groups.map(async (group) => {
          try {
            // Check if we already have members for this group in our local state to avoid flicker
            const existing = groupsWithMembersRef.current.find((g) => g.id === group.id)
            if (existing && existing.members.length > 0) {
              return { ...group, members: existing.members, isLoading: false }
            }

            const members = await attendanceManager.getGroupMembers(group.id)
            return { ...group, members, isLoading: false }
          } catch (error) {
            console.error(`Error loading members for group ${group.id}:`, error)
            return { ...group, members: [], isLoading: false }
          }
        }),
      )
      setGroupsWithMembers(groupsData)
      setIsInitialLoad(false)
    }

    if (groups.length > 0) {
      loadMembers()
    } else {
      // Defer state update to avoid synchronous cascading renders inside useEffect
      Promise.resolve().then(() => {
        setGroupsWithMembers([])
        setIsInitialLoad(false)
      })
    }
  }, [groups, loadDirectory])

  // Filter groups and members based on search
  const filteredData = useMemo(() => {
    const withDisplayNames = generateGroupDisplayNames(groupsWithMembers)

    if (!searchQuery.trim()) {
      return withDisplayNames
    }

    const query = searchQuery.toLowerCase()
    return withDisplayNames
      .map((group) => {
        const filteredMembers = group.members.filter(
          (member) =>
            member.name.toLowerCase().includes(query) ||
            member.role?.toLowerCase().includes(query) ||
            member.email?.toLowerCase().includes(query),
        )
        return { ...group, members: filteredMembers }
      })
      .filter(
        (group) =>
          group.members.length > 0 ||
          group.name.toLowerCase().includes(query) ||
          group.id.toLowerCase().includes(query),
      )
  }, [groupsWithMembers, searchQuery])

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])

  const cancelEditing = useCallback(() => {
    setEditingMember(null)
    setEditingGroup(null)
    setEditValue("")
  }, [])

  const startEditing = useCallback((member: AttendanceMember, field: MemberField) => {
    setEditingMember({ personId: member.person_id, field })
    setEditValue(member[field] || "")
  }, [])

  const startEditingGroup = useCallback((group: AttendanceGroup, field: GroupField) => {
    setEditingGroup({ groupId: group.id, field })
    setEditValue(group[field] || "")
  }, [])

  const saveEdit = useCallback(
    async (personId: string, field: MemberField, value: string) => {
      if (value.trim() === "" && field === "name") {
        if (dialog) {
          await dialog.alert({
            title: "Missing name",
            message: "Name cannot be empty.",
          })
        } else {
          alert("Name cannot be empty")
        }
        return
      }

      setSavingMember(personId)
      try {
        const updates: Partial<AttendanceMember> = {
          [field]: value.trim() || undefined,
        }

        const success = await attendanceManager.updateMember(personId, updates)
        if (success) {
          setGroupsWithMembers((prev) =>
            prev.map((group) => ({
              ...group,
              members: group.members.map((m) =>
                m.person_id === personId ? { ...m, [field]: value.trim() || undefined } : m,
              ),
            })),
          )
          cancelEditing()
        } else {
          if (dialog) {
            await dialog.alert({
              title: "Save failed",
              message: "Failed to save changes.",
              variant: "danger",
            })
          } else {
            alert("Failed to save changes")
          }
        }
      } catch (error) {
        console.error("Error saving member:", error)
        if (dialog) {
          await dialog.alert({
            title: "Save failed",
            message: "Failed to save changes.",
            variant: "danger",
          })
        } else {
          alert("Failed to save changes")
        }
      } finally {
        setSavingMember(null)
      }
    },
    [cancelEditing, dialog],
  )

  const saveGroupEdit = useCallback(
    async (groupId: string, field: GroupField, value: string) => {
      const trimmedValue = value.trim()

      if (field === "name" && !trimmedValue) {
        if (dialog) {
          await dialog.alert({
            title: "Missing group name",
            message: "Group name cannot be empty.",
          })
        } else {
          alert("Group name cannot be empty")
        }
        return
      }

      setSavingGroup(groupId)
      try {
        const updates: Partial<AttendanceGroup> = {
          [field]: trimmedValue,
        }

        const success = await attendanceManager.updateGroup(groupId, updates)
        if (success) {
          setGroupsWithMembers((prev) =>
            prev.map((group) =>
              group.id === groupId ? { ...group, [field]: trimmedValue } : group,
            ),
          )
          cancelEditing()
        } else {
          if (dialog) {
            await dialog.alert({
              title: "Save failed",
              message: "Failed to save changes.",
              variant: "danger",
            })
          } else {
            alert("Failed to save changes")
          }
        }
      } catch (error) {
        console.error("Error saving group:", error)
        if (dialog) {
          await dialog.alert({
            title: "Save failed",
            message: "Failed to save changes.",
            variant: "danger",
          })
        } else {
          alert("Failed to save changes")
        }
      } finally {
        setSavingGroup(null)
      }
    },
    [cancelEditing, dialog],
  )

  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      const targetGroup = groups.find((group) => group.id === groupId)
      if (!targetGroup) {
        if (dialog) {
          await dialog.alert({
            title: "Group not found",
            message: "Group not found. Refresh and try again.",
            variant: "danger",
          })
        } else {
          alert("Group not found. Refresh and try again.")
        }
        return
      }

      setGroupToDelete(targetGroup)
      setShowDeleteConfirmation(true)
      setDeletingGroup(groupId)
    },
    [groups, setGroupToDelete, setShowDeleteConfirmation, dialog],
  )

  const handleDeleteMember = useCallback(
    async (personId: string, memberName: string) => {
      const confirmMessage = `Remove member "${memberName}"?\n\nThis removes them from the directory and deletes their enrolled face data. Attendance history is retained.`

      if (dialog) {
        const ok = await dialog.confirm({
          title: "Remove member",
          message: confirmMessage,
          confirmText: "Remove",
          cancelText: "Cancel",
          confirmVariant: "danger",
        })
        if (!ok) return
      } else {
        if (!window.confirm(confirmMessage)) return
      }

      setDeletingMember(personId)
      try {
        const success = await attendanceManager.removeMember(personId)
        if (success) {
          setGroupsWithMembers((prev) =>
            prev.map((group) => ({
              ...group,
              members: group.members.filter((m) => m.person_id !== personId),
            })),
          )
        } else {
          if (dialog) {
            await dialog.alert({
              title: "Could not remove member",
              message: "Facenox couldn't remove the member. Try again.",
              variant: "danger",
            })
          } else {
            alert("Facenox couldn't remove the member. Try again.")
          }
        }
      } catch (error) {
        console.error("Error removing member:", error)
        if (dialog) {
          await dialog.alert({
            title: "Could not remove member",
            message: "Facenox couldn't remove the member. Try again.",
            variant: "danger",
          })
        } else {
          alert("Facenox couldn't remove the member. Try again.")
        }
      } finally {
        setDeletingMember(null)
      }
    },
    [dialog],
  )

  const handleClearAllGroups = useCallback(
    async (skipConfirmation = false) => {
      const groupCount = groups.length
      const confirmMessage = `Delete ${groupCount} ${groupCount === 1 ? "group" : "groups"} and their member profiles? Paired computers will sync these deletions to Cloud. This cannot be undone.`

      if (!skipConfirmation) {
        if (dialog) {
          const ok = await dialog.confirm({
            title: "Delete group directory",
            message: confirmMessage,
            confirmText: "Delete directory",
            cancelText: "Cancel",
            confirmVariant: "danger",
            requireTypedConfirmation: {
              label: "To confirm, type DELETE DIRECTORY",
              value: "DELETE DIRECTORY",
            },
          })
          if (!ok) return
        } else {
          if (!window.confirm(confirmMessage)) return
        }
      }

      setDeletingGroup("all")
      try {
        const deletePromises = groups.map((group) => attendanceManager.deleteGroup(group.id))
        const results = await Promise.all(deletePromises)
        if (results.some((success) => !success))
          throw new Error("Some groups could not be deleted.")

        // Securely invalidate face recognition RAM cache to prevent biometric memory leaks
        await backendService.clearCache().catch(() => null)

        setGroupsWithMembers([])
        if (onGroupsChanged) {
          onGroupsChanged()
        }
        if (dialog) {
          await dialog.alert({
            title: "Directory deleted",
            message: `Deleted ${groupCount} ${groupCount === 1 ? "group" : "groups"}.`,
          })
        }
      } catch (error) {
        console.error("Error deleting all groups:", error)
        if (dialog) {
          await dialog.alert({
            title: "Delete failed",
            message:
              "Could not delete all groups. Some may already have been deleted. Refresh the list before trying again.",
            variant: "danger",
          })
        }
      } finally {
        setDeletingGroup(null)
      }
    },
    [groups, onGroupsChanged, dialog],
  )

  const [isPurgingHistory, setIsPurgingHistory] = useState(false)

  const handlePurgeHistory = useCallback(
    async (skipConfirmation = false) => {
      const confirmMessage = `Delete all local attendance history?\n\nThis deletes attendance records and sessions from this computer. Groups, member profiles, face templates, and existing Cloud records are unchanged. This cannot be undone.`

      if (!skipConfirmation) {
        if (dialog) {
          const ok = await dialog.confirm({
            title: "Delete local attendance history",
            message: confirmMessage,
            confirmText: "Delete history",
            cancelText: "Cancel",
            confirmVariant: "danger",
            requireTypedConfirmation: {
              label: "To confirm, type DELETE HISTORY",
              value: "DELETE HISTORY",
            },
          })
          if (!ok) return
        } else {
          if (!window.confirm(confirmMessage)) return
        }
      }

      setIsPurgingHistory(true)
      try {
        await attendanceManager.purgeAttendanceHistory()
        if (onGroupsChanged) {
          onGroupsChanged()
        }
        if (dialog) {
          await dialog.alert({
            title: "Local history deleted",
            message: "Deleted all local attendance records and sessions.",
          })
        } else {
          alert("Deleted all local attendance records and sessions.")
        }
      } catch (error) {
        console.error("Error purging history:", error)
        if (dialog) {
          await dialog.alert({
            title: "Could not delete history",
            message: "Could not delete local attendance history. Try again.",
            variant: "danger",
          })
        } else {
          alert("Could not delete local attendance history. Try again.")
        }
      } finally {
        setIsPurgingHistory(false)
      }
    },
    [onGroupsChanged, dialog],
  )

  const totalMembers = useMemo(
    () => groupsWithMembers.reduce((sum, group) => sum + group.members.length, 0),
    [groupsWithMembers],
  )

  return {
    groupsWithMembers,
    expandedGroups,
    searchQuery,
    setSearchQuery,
    editingMember,
    editingGroup,
    editValue,
    setEditValue,
    savingMember,
    savingGroup,
    deletingGroup,
    deletingMember,
    filteredData,
    isInitialLoad,
    toggleGroup,
    startEditing,
    startEditingGroup,
    cancelEditing,
    saveEdit,
    saveGroupEdit,
    handleDeleteGroup,
    handleDeleteMember,
    handleClearAllGroups,
    handlePurgeHistory,
    isPurgingHistory,
    totalMembers,
  }
}
