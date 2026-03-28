import { useEffect, useRef } from "react"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

import { useGroupStore } from "@/components/group/stores"

interface UseGroupDataOptions {
  isEmbedded?: boolean
  embeddedGroups?: AttendanceGroup[]
  embeddedMembers?: AttendanceMember[]
}

/**
 * Hook that provides access to group data from Zustand store
 * Handles initialization and side effects
 */
export function useGroupData(
  initialGroup?: AttendanceGroup | null,
  options: UseGroupDataOptions = {},
) {
  const { isEmbedded = false, embeddedGroups = [], embeddedMembers = [] } = options
  const selectedGroup = useGroupStore((state) => state.selectedGroup)
  const groups = useGroupStore((state) => state.groups)
  const members = useGroupStore((state) => state.members)
  const loading = useGroupStore((state) => state.loading)
  const error = useGroupStore((state) => state.error)
  const lastDeletedGroupId = useGroupStore((state) => state.lastDeletedGroupId)
  const setSelectedGroup = useGroupStore((state) => state.setSelectedGroup)
  const setGroups = useGroupStore((state) => state.setGroups)
  const setMembers = useGroupStore((state) => state.setMembers)
  const setError = useGroupStore((state) => state.setError)
  const fetchGroups = useGroupStore((state) => state.fetchGroups)
  const fetchGroupDetails = useGroupStore((state) => state.fetchGroupDetails)
  const deleteGroup = useGroupStore((state) => state.deleteGroup)
  const exportData = useGroupStore((state) => state.exportData)

  const lastProcessedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isEmbedded) return
    setGroups(embeddedGroups)
  }, [isEmbedded, embeddedGroups, setGroups])

  // Sync initialGroup with store, but skip if it doesn't exist in groups (was deleted)
  useEffect(() => {
    if (isEmbedded) {
      const nextSelected =
        initialGroup ? (embeddedGroups.find((g) => g.id === initialGroup.id) ?? null) : null

      if (!nextSelected) {
        if (selectedGroup !== null) {
          setSelectedGroup(null)
        }
        return
      }

      if (selectedGroup?.id !== nextSelected.id) {
        setSelectedGroup(nextSelected)
      }
      return
    }

    const currentGroups = useGroupStore.getState().groups
    const initialGroupId = initialGroup?.id ?? null
    const selectedGroupId = selectedGroup?.id ?? null
    const stateKey = `${initialGroupId}-${selectedGroupId}`

    // Skip if we've already processed this exact state
    if (stateKey === lastProcessedRef.current) {
      return
    }

    // Check if initialGroup exists in current groups
    const initialGroupExists =
      initialGroup ? currentGroups.some((g) => g.id === initialGroup.id) : false

    // Don't sync deleted groups
    if (initialGroup && !initialGroupExists) {
      lastProcessedRef.current = stateKey
      return
    }

    // Don't restore if group was just deleted
    if (
      selectedGroup === null &&
      initialGroup &&
      (lastDeletedGroupId === initialGroup.id || !initialGroupExists)
    ) {
      lastProcessedRef.current = stateKey
      return
    }

    // Sync logic
    if (initialGroup === null && selectedGroup) {
      setSelectedGroup(null)
    } else if (initialGroup && initialGroupExists && selectedGroup?.id !== initialGroup.id) {
      setSelectedGroup(initialGroup)
    } else if (initialGroup && initialGroupExists && !selectedGroup) {
      setSelectedGroup(initialGroup)
    }

    lastProcessedRef.current = stateKey
  }, [
    isEmbedded,
    embeddedGroups,
    initialGroup,
    selectedGroup,
    setSelectedGroup,
    lastDeletedGroupId,
  ])

  useEffect(() => {
    if (!isEmbedded) return

    const selectedGroupId = initialGroup?.id ?? null
    const nextMembers: AttendanceMember[] = selectedGroupId ? embeddedMembers : []
    setMembers(nextMembers)
  }, [isEmbedded, embeddedMembers, initialGroup?.id, setMembers])

  // Load groups on mount only (not on every fetchGroups reference change)
  const hasLoadedGroupsRef = useRef(false)
  useEffect(() => {
    if (isEmbedded) {
      return
    }

    if (!hasLoadedGroupsRef.current) {
      hasLoadedGroupsRef.current = true
      fetchGroups()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbedded]) // Only run once on mount in standalone mode

  // Load group details when selected group changes
  useEffect(() => {
    if (isEmbedded) {
      return
    }

    if (selectedGroup) {
      fetchGroupDetails(selectedGroup.id)
    }
  }, [selectedGroup, fetchGroupDetails, isEmbedded])

  return {
    selectedGroup,
    groups,
    members,
    loading,
    error,
    setSelectedGroup,
    setError,
    fetchGroups,
    fetchGroupDetails,
    deleteGroup,
    exportData,
  }
}
