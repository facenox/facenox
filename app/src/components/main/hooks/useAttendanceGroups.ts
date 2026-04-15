import { useRef, useCallback, useEffect } from "react"
import { attendanceManager } from "@/services"
import { persistentSettings } from "@/services/PersistentSettingsService"
import type { AttendanceGroup, AttendanceMember, AttendanceRecord } from "@/types/recognition"
import { useAttendanceStore, useUIStore } from "@/components/main/stores"

const PANEL_SWITCH_SKELETON_DELAY_MS = 120
const MODAL_EXIT_DURATION_MS = 260

interface PanelDataCacheEntry {
  members: AttendanceMember[]
  records: AttendanceRecord[]
}

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
    attendanceCooldownSeconds: settings.attendance_cooldown_seconds ?? 300,
    enableSpoofDetection: settings.enable_liveness_detection ?? false,
    maxRecognitionFacesPerFrame: settings.max_recognition_faces_per_frame ?? 6,
    dataRetentionDays: settings.data_retention_days ?? 0,
    attendanceGroups: groups,
    groupMembers: [],
    recentAttendance: [],
    isPanelLoading: Boolean(resolvedGroup),
    isPanelRefreshing: false,
    isPanelSwitchPending: false,
  })

  useAttendanceStore.getState().setCurrentGroup(resolvedGroup)
}

export async function loadSelectedGroupData(
  groupId: string,
  options: {
    preserveExisting?: boolean
    delaySkeleton?: boolean
    onResolvedData?: (members: AttendanceMember[], records: AttendanceRecord[]) => void
  } = {},
): Promise<void> {
  const preserveExisting = options.preserveExisting ?? false
  const delaySkeleton = options.delaySkeleton ?? false
  const onResolvedData = options.onResolvedData
  let hasShownLoading = false
  let skeletonDelayTimer: ReturnType<typeof setTimeout> | null = null

  if (preserveExisting) {
    useAttendanceStore.setState({
      isPanelLoading: false,
      isPanelRefreshing: true,
      isPanelSwitchPending: false,
    })
  } else if (delaySkeleton) {
    useAttendanceStore.setState({
      isPanelLoading: false,
      isPanelRefreshing: false,
      isPanelSwitchPending: true,
    })

    skeletonDelayTimer = setTimeout(() => {
      if (useAttendanceStore.getState().currentGroup?.id !== groupId) return

      hasShownLoading = true
      useAttendanceStore.setState({
        isPanelLoading: true,
        isPanelRefreshing: false,
        isPanelSwitchPending: false,
        groupMembers: [],
        recentAttendance: [],
      })
    }, PANEL_SWITCH_SKELETON_DELAY_MS)
  } else {
    useAttendanceStore.setState({
      isPanelLoading: true,
      isPanelRefreshing: false,
      isPanelSwitchPending: false,
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

    if (skeletonDelayTimer) {
      clearTimeout(skeletonDelayTimer)
    }

    onResolvedData?.(members, records)

    if (useAttendanceStore.getState().currentGroup?.id !== groupId) {
      return
    }

    useAttendanceStore.setState({
      groupMembers: members,
      recentAttendance: records,
      isPanelLoading: false,
      isPanelRefreshing: false,
      isPanelSwitchPending: false,
    })
  } catch (error) {
    if (skeletonDelayTimer) {
      clearTimeout(skeletonDelayTimer)
    }

    if (useAttendanceStore.getState().currentGroup?.id === groupId) {
      useAttendanceStore.setState({
        isPanelLoading: false,
        isPanelRefreshing: false,
        isPanelSwitchPending: false,
        ...(hasShownLoading ?
          {}
        : {
            groupMembers: [],
            recentAttendance: [],
          }),
      })
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
  const panelDataCacheRef = useRef<Map<string, PanelDataCacheEntry>>(new Map())
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

  const cachePanelData = useCallback(
    (groupId: string, members: AttendanceMember[], records: AttendanceRecord[]) => {
      panelDataCacheRef.current.set(groupId, { members, records })
    },
    [],
  )

  const applyCachedPanelData = useCallback((groupId: string): boolean => {
    const cachedData = panelDataCacheRef.current.get(groupId)
    if (!cachedData) return false

    useAttendanceStore.setState({
      groupMembers: cachedData.members,
      recentAttendance: cachedData.records,
      isPanelLoading: false,
      isPanelRefreshing: true,
      isPanelSwitchPending: false,
    })

    return true
  }, [])

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
          isPanelSwitchPending: false,
        })
        return
      }

      if (currentGroupValue?.id !== resolvedGroup.id) {
        setCurrentGroupWithCache(resolvedGroup)
        applyCachedPanelData(resolvedGroup.id)
      } else {
        useAttendanceStore.setState({ currentGroup: resolvedGroup })
        currentGroupRef.current = resolvedGroup
      }

      const shouldPreserveExisting =
        currentGroupValue?.id === resolvedGroup.id && !useAttendanceStore.getState().isPanelLoading

      await loadSelectedGroupData(resolvedGroup.id, {
        preserveExisting: shouldPreserveExisting,
        onResolvedData: (members, records) => cachePanelData(resolvedGroup.id, members, records),
      })
    } catch (error) {
      console.error("Failed to refresh attendance data:", error)
    }
  }, [applyCachedPanelData, cachePanelData, setAttendanceGroups, setCurrentGroupWithCache])

  useEffect(() => {
    loadAttendanceDataRef.current = refreshAttendanceData
  }, [refreshAttendanceData])

  const handleSelectGroup = useCallback(
    async (group: AttendanceGroup) => {
      setCurrentGroupWithCache(group)

      try {
        const usedCachedData = applyCachedPanelData(group.id)

        await loadSelectedGroupData(group.id, {
          preserveExisting: usedCachedData,
          delaySkeleton: !usedCachedData,
          onResolvedData: (members, records) => cachePanelData(group.id, members, records),
        })
      } catch (error) {
        console.error("Failed to load data for selected group:", error)
      }
    },
    [applyCachedPanelData, cachePanelData, setCurrentGroupWithCache],
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

      panelDataCacheRef.current.delete(groupToDelete.id)

      if (currentGroup?.id === groupToDelete.id) {
        setCurrentGroupWithCache(null)
      }

      await refreshAttendanceData()
    } catch (error) {
      console.error("Failed to delete group:", error)
      setError("Failed to delete group")
    } finally {
      setShowDeleteConfirmation(false)
      setTimeout(() => {
        setGroupToDelete(null)
      }, MODAL_EXIT_DURATION_MS)
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
    setTimeout(() => {
      setGroupToDelete(null)
    }, MODAL_EXIT_DURATION_MS)
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
          isPanelSwitchPending: false,
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
        isPanelSwitchPending: false,
      })
      return
    }

    loadSelectedGroupData(currentGroup.id, {
      onResolvedData: (members, records) => cachePanelData(currentGroup.id, members, records),
    }).catch((error) => {
      console.error("Failed to load initial group data:", error)
    })
  }, [cachePanelData, isShellReady, currentGroup?.id])

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
