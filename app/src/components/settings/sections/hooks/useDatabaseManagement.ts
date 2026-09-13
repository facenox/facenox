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
) {
  const { setGroupToDelete, setShowDeleteConfirmation, showDeleteConfirmation, groupToDelete } =
    useAttendanceStore()

  const [isPaired, setIsPaired] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.sync) return

    const fetchConfig = () => {
      window.electronAPI.sync
        .getConfig()
        .then((c) => setIsPaired(c.connected))
        .catch(console.error)
    }

    fetchConfig()

    const unsubscribe = window.electronAPI.sync.onDataChanged(() => {
      fetchConfig()
    })

    return unsubscribe
  }, [])

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
  }, [groups])

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
      if (isPaired) {
        if (dialog) {
          await dialog.alert({
            title: "Cannot delete group",
            message: "Member list is managed in Facenox Cloud. Disconnect to manage locally.",
            variant: "default",
          })
        }
        return
      }

      const targetGroup = groups.find((group) => group.id === groupId)
      if (!targetGroup) {
        if (dialog) {
          await dialog.alert({
            title: "Group not found",
            message: "Please refresh and try again.",
            variant: "danger",
          })
        } else {
          alert("Group not found. Please refresh and try again.")
        }
        return
      }

      setGroupToDelete(targetGroup)
      setShowDeleteConfirmation(true)
      setDeletingGroup(groupId)
    },
    [groups, setGroupToDelete, setShowDeleteConfirmation, dialog, isPaired],
  )

  const handleDeleteMember = useCallback(
    async (personId: string, memberName: string) => {
      if (isPaired) {
        if (dialog) {
          await dialog.alert({
            title: "Cannot delete member",
            message: "Member list is managed in Facenox Cloud. Disconnect to manage locally.",
            variant: "default",
          })
        }
        return
      }

      const confirmMessage = `Delete member "${memberName}"?\n\nThis cannot be undone.`

      if (dialog) {
        const ok = await dialog.confirm({
          title: "Delete member",
          message: confirmMessage,
          confirmText: "Delete",
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
              title: "Delete failed",
              message: "Failed to delete member.",
              variant: "danger",
            })
          } else {
            alert("Failed to delete member")
          }
        }
      } catch (error) {
        console.error("Error deleting member:", error)
        if (dialog) {
          await dialog.alert({
            title: "Delete failed",
            message: "Failed to delete member.",
            variant: "danger",
          })
        } else {
          alert("Failed to delete member")
        }
      } finally {
        setDeletingMember(null)
      }
    },
    [dialog, isPaired],
  )

  const handleClearAllGroups = useCallback(
    async (skipConfirmation = false) => {
      if (isPaired) {
        if (dialog) {
          await dialog.alert({
            title: "Cannot delete groups",
            message: "Member list is managed in Facenox Cloud. Disconnect to manage locally.",
            variant: "default",
          })
        }
        return
      }

      const groupCount = groups.length
      const confirmMessage = `Delete ALL ${groupCount} groups and member profiles? This will permanently wipe out the entire local directory structure and soft-delete member accounts. This cannot be undone.`

      if (!skipConfirmation) {
        if (dialog) {
          const ok = await dialog.confirm({
            title: "Delete Group Directory",
            message: confirmMessage,
            confirmText: "Wipe Directory",
            cancelText: "Cancel",
            confirmVariant: "danger",
            requireTypedConfirmation: {
              label: 'Type "DELETE DIRECTORY" to continue',
              placeholder: "DELETE DIRECTORY",
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
        await Promise.all(deletePromises)

        // Securely invalidate face recognition RAM cache to prevent biometric memory leaks
        await backendService.clearCache().catch(() => null)

        setGroupsWithMembers([])
        if (onGroupsChanged) {
          onGroupsChanged()
        }
        if (dialog) {
          await dialog.alert({
            title: "Directory deleted",
            message: `Successfully deleted all ${groupCount} groups and invalidated biometric index caches.`,
          })
        }
      } catch (error) {
        console.error("Error deleting all groups:", error)
        if (dialog) {
          await dialog.alert({
            title: "Delete failed",
            message: "Failed to delete directory structure.",
            variant: "danger",
          })
        }
      } finally {
        setDeletingGroup(null)
      }
    },
    [groups, onGroupsChanged, dialog, isPaired],
  )

  const [isPurgingHistory, setIsPurgingHistory] = useState(false)

  const handlePurgeHistory = useCallback(
    async (skipConfirmation = false) => {
      const confirmMessage = `Purge ALL attendance history?\n\nThis will delete all historical records and daily sessions. Configured groups, member profiles, and biometric face profiles will remain safe. This cannot be undone.`

      if (!skipConfirmation) {
        if (dialog) {
          const ok = await dialog.confirm({
            title: "Purge attendance history",
            message: confirmMessage,
            confirmText: "Wipe history",
            cancelText: "Cancel",
            confirmVariant: "danger",
            requireTypedConfirmation: {
              label: 'Type "PURGE HISTORY" to continue',
              placeholder: "PURGE HISTORY",
              value: "PURGE HISTORY",
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
            title: "History purged",
            message: "Successfully purged all attendance records and sessions.",
          })
        } else {
          alert("✓ Successfully purged all history records")
        }
      } catch (error) {
        console.error("Error purging history:", error)
        if (dialog) {
          await dialog.alert({
            title: "Purge failed",
            message: "Failed to purge attendance history. Please try again.",
            variant: "danger",
          })
        } else {
          alert("Failed to purge history")
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
