import { useRef, useCallback, useEffect } from "react"
import { attendanceManager } from "@/services"
import { persistentSettings } from "@/services/PersistentSettingsService"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"

const resolveSelectedGroup = (
  groups: AttendanceGroup[],
  selectedGroupId: string | null | undefined,
): AttendanceGroup | null => {
  if (groups.length === 0) return null
  if (selectedGroupId) {
    const match = groups.find((group) => group.id === selectedGroupId)
    if (match) return match
  }
  return groups[0]
}

export async function bootstrapShellData(): Promise<void> {
  const [settings, groups, uiState] = await Promise.all([
    attendanceManager.getSettings(),
    attendanceManager.getGroups(),
    persistentSettings.getUIState(),
  ])

  const resolvedGroup = resolveSelectedGroup(groups, uiState.selectedGroupId)

  useAttendanceStore.setState({
    attendanceCooldownSeconds: settings.attendance_cooldown_seconds ?? 8,
    enableSpoofDetection: settings.enable_liveness_detection ?? true,
    maxRecognitionFacesPerFrame: settings.max_recognition_faces_per_frame ?? 6,
    dataRetentionDays: settings.data_retention_days ?? 0,
    attendanceGroups: groups,
    groupMembers: [],
    recentAttendance: [],
    isPanelLoading: Boolean(resolvedGroup),
    isPanelRefreshing: false,
  })

  useAttendanceStore.getState().setCurrentGroup(resolvedGroup)
}

export async function loadSelectedGroupData(
  groupId: string,
  options: {
    preserveExisting?: boolean
  } = {},
): Promise<void> {
  const preserveExisting = options.preserveExisting ?? false

  if (preserveExisting) {
    useAttendanceStore.setState({
      isPanelLoading: false,
      isPanelRefreshing: true,
    })
  } else {
    useAttendanceStore.setState({
      isPanelLoading: true,
      isPanelRefreshing: false,
      groupMembers: [],
      recentAttendance: [],
    })
  }

  try {
    const [members, records] = await Promise.all([
      attendanceManager.getGroupMembers(groupId),
      attendanceManager.getRecords({
        group_id: groupId,
        limit: 100,
      }),
    ])

    if (useAttendanceStore.getState().currentGroup?.id !== groupId) {
      return
    }

    useAttendanceStore.setState({
      groupMembers: members,
      recentAttendance: records,
      isPanelLoading: false,
      isPanelRefreshing: false,
    })
  } catch (error) {
    if (useAttendanceStore.getState().currentGroup?.id === groupId) {
      useAttendanceStore.setState({ isPanelLoading: false, isPanelRefreshing: false })
    }
    throw error
  }
}

export function useAttendanceGroups() {
  const {
    currentGroup,
    setCurrentGroup,
    attendanceGroups,
    setAttendanceGroups,
    groupMembers,
    recentAttendance,
    showGroupManagement,
    setShowGroupManagement,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    groupToDelete,
    setGroupToDelete,
    newGroupName,
    setNewGroupName,
    isShellReady,
  } = useAttendanceStore()
  const { setError } = useUIStore()

  const currentGroupRef = useRef<AttendanceGroup | null>(null)
  const hasInitializedPanelDataRef = useRef(false)
  const memberCacheRef = useRef<Map<string, AttendanceMember | null>>(new Map())
  const loadAttendanceDataRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    currentGroupRef.current = currentGroup
  }, [currentGroup])

  const setCurrentGroupWithCache = useCallback(
    (group: AttendanceGroup | null) => {
      setCurrentGroup(group)
      currentGroupRef.current = group
      memberCacheRef.current.clear()
    },
    [setCurrentGroup],
  )

  const refreshAttendanceData = useCallback(async () => {
    try {
      const currentGroupValue = currentGroupRef.current
      const groups = await attendanceManager.getGroups()
      setAttendanceGroups(groups)

      let resolvedGroup: AttendanceGroup | null = null
      if (currentGroupValue) {
        resolvedGroup = groups.find((group) => group.id === currentGroupValue.id) ?? null
      } else if (groups.length > 0) {
        resolvedGroup = groups[0]
      }

      if (!resolvedGroup) {
        setCurrentGroupWithCache(null)
        useAttendanceStore.setState({
          groupMembers: [],
          recentAttendance: [],
          isPanelLoading: false,
          isPanelRefreshing: false,
        })
        return
      }

      if (currentGroupValue?.id !== resolvedGroup.id) {
        setCurrentGroupWithCache(resolvedGroup)
      } else {
        useAttendanceStore.setState({ currentGroup: resolvedGroup })
        currentGroupRef.current = resolvedGroup
      }

      const shouldPreserveExisting =
        currentGroupValue?.id === resolvedGroup.id &&
        (useAttendanceStore.getState().groupMembers.length > 0 ||
          useAttendanceStore.getState().recentAttendance.length > 0)

      await loadSelectedGroupData(resolvedGroup.id, {
        preserveExisting: shouldPreserveExisting,
      })
    } catch (error) {
      console.error("Failed to refresh attendance data:", error)
    }
  }, [setAttendanceGroups, setCurrentGroupWithCache])

  useEffect(() => {
    loadAttendanceDataRef.current = refreshAttendanceData
  }, [refreshAttendanceData])

  const handleSelectGroup = useCallback(
    async (group: AttendanceGroup) => {
      setCurrentGroupWithCache(group)

      try {
        await loadSelectedGroupData(group.id)
      } catch (error) {
        console.error("Failed to load data for selected group:", error)
      }
    },
    [setCurrentGroupWithCache],
  )

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return

    try {
      const group = await attendanceManager.createGroup(newGroupName.trim())
      setNewGroupName("")
      setShowGroupManagement(false)

      const groups = await attendanceManager.getGroups()
      setAttendanceGroups(groups)

      if (group) {
        await handleSelectGroup(group)
      }
    } catch (error) {
      console.error("Failed to create group:", error)
      setError("Failed to create group")
    }
  }, [
    newGroupName,
    handleSelectGroup,
    setAttendanceGroups,
    setError,
    setNewGroupName,
    setShowGroupManagement,
  ])

  const handleDeleteGroup = useCallback(
    (group: AttendanceGroup) => {
      setGroupToDelete(group)
      setShowDeleteConfirmation(true)
    },
    [setGroupToDelete, setShowDeleteConfirmation],
  )

  const confirmDeleteGroup = useCallback(async () => {
    if (!groupToDelete) return

    try {
      const success = await attendanceManager.deleteGroup(groupToDelete.id)
      if (!success) {
        throw new Error("Failed to delete group")
      }

      if (currentGroup?.id === groupToDelete.id) {
        setCurrentGroupWithCache(null)
      }

      await refreshAttendanceData()
    } catch (error) {
      console.error("Failed to delete group:", error)
      setError("Failed to delete group")
    } finally {
      setShowDeleteConfirmation(false)
      setGroupToDelete(null)
    }
  }, [
    groupToDelete,
    currentGroup,
    refreshAttendanceData,
    setCurrentGroupWithCache,
    setError,
    setGroupToDelete,
    setShowDeleteConfirmation,
  ])

  const cancelDeleteGroup = useCallback(() => {
    setShowDeleteConfirmation(false)
    setGroupToDelete(null)
  }, [setGroupToDelete, setShowDeleteConfirmation])

  useEffect(() => {
    const handleSelectGroupEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        group: AttendanceGroup | null
      }>
      const { group } = customEvent.detail

      if (group === null) {
        setCurrentGroupWithCache(null)
        useAttendanceStore.setState({
          groupMembers: [],
          recentAttendance: [],
          isPanelLoading: false,
          isPanelRefreshing: false,
        })

        attendanceManager
          .getGroups()
          .then((groups) => {
            setAttendanceGroups(groups)
          })
          .catch((error) => {
            console.error("[useAttendanceGroups] Error refreshing groups:", error)
          })
        return
      }

      handleSelectGroup(group).catch(console.error)
    }

    window.addEventListener("selectGroup", handleSelectGroupEvent as EventListener)
    return () => {
      window.removeEventListener("selectGroup", handleSelectGroupEvent as EventListener)
    }
  }, [handleSelectGroup, setAttendanceGroups, setCurrentGroupWithCache])

  useEffect(() => {
    if (!isShellReady || hasInitializedPanelDataRef.current) return

    hasInitializedPanelDataRef.current = true

    if (!currentGroup?.id) {
      useAttendanceStore.setState({
        groupMembers: [],
        recentAttendance: [],
        isPanelLoading: false,
        isPanelRefreshing: false,
      })
      return
    }

    loadSelectedGroupData(currentGroup.id).catch((error) => {
      console.error("Failed to load initial group data:", error)
    })
  }, [isShellReady, currentGroup?.id])

  return {
    currentGroup,
    setCurrentGroup: setCurrentGroupWithCache,
    currentGroupRef,
    memberCacheRef,
    attendanceGroups,
    setAttendanceGroups,
    groupMembers,
    recentAttendance,
    showGroupManagement,
    setShowGroupManagement,
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    groupToDelete,
    setGroupToDelete,
    newGroupName,
    setNewGroupName,
    loadAttendanceData: refreshAttendanceData,
    loadAttendanceDataRef,
    handleSelectGroup,
    handleCreateGroup,
    handleDeleteGroup,
    confirmDeleteGroup,
    cancelDeleteGroup,
  }
}
