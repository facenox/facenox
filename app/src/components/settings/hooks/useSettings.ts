import { useState, useEffect, useCallback, useMemo } from "react"
import { backendService, attendanceManager, persistentSettings } from "@/services"
import { useDialog } from "@/components/shared"
import { useGroupStore, useGroupUIStore } from "@/components/group/stores"
import { useUIStore, useAttendanceStore } from "@/components/main/stores"
import type { GroupSection } from "@/components/group"
import type { QuickSettings, AttendanceSettings, AudioSettings } from "@/components/settings/types"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

interface UseSettingsProps {
  initialGroupSection?: GroupSection
  initialSection?: string
  initialGroups: AttendanceGroup[]
  currentGroup: AttendanceGroup | null
  currentGroupMembers: AttendanceMember[]
  onQuickSettingsChange: (settings: QuickSettings) => void
  onAudioSettingsChange: (settings: Partial<AudioSettings>) => void
  onAttendanceSettingsChange: (settings: Partial<AttendanceSettings>) => void
  onGroupSelect?: (group: AttendanceGroup) => void
  onGroupsChanged?: () => void
  quickSettings: QuickSettings
}

/**
 * Custom React hook to orchestrate preferences, state synchronizations,
 * anti-spoofing modal triggers, audit logs, and group selections.
 * Decouples raw setting layouts from the global state coordinate system.
 */
export const useSettings = ({
  initialGroupSection,
  initialSection,
  initialGroups,
  currentGroup,
  currentGroupMembers,
  onQuickSettingsChange,
  onAudioSettingsChange,
  onAttendanceSettingsChange,
  onGroupSelect,
  onGroupsChanged,
  quickSettings,
}: UseSettingsProps) => {
  const dialog = useDialog()
  const uiStore = useUIStore()

  const [activeSection, setActiveSectionState] = useState<string>(
    initialSection || (initialGroupSection ? "group" : uiStore.lastSettingsSection) || "group",
  )
  const [groupInitialSection, setGroupInitialSectionState] = useState<GroupSection | undefined>(
    initialGroupSection || uiStore.lastGroupInitialSection || "overview",
  )

  const setActiveSection = useCallback((section: string) => {
    setActiveSectionState(section)
    useUIStore.getState().setLastSettingsSection(section)
  }, [])

  const setGroupInitialSection = useCallback((section: GroupSection) => {
    setGroupInitialSectionState(section)
    useUIStore.getState().setLastGroupInitialSection(section)
  }, [])

  // Reset settings tabs to default when active group changes to avoid editing settings/members of the wrong group
  useEffect(() => {
    if (currentGroup?.id) {
      const store = useUIStore.getState()

      // Only reset active sections if switching to a completely different group context during this session!
      if (store.lastGroupId && store.lastGroupId !== currentGroup.id) {
        store.setLastSettingsSection("group")
        store.setLastGroupInitialSection("overview")
        setActiveSectionState("group")
        setGroupInitialSectionState("overview")
      }

      // Keep track of the active group ID to distinguish real group switches from component remounts
      store.setLastGroupId(currentGroup.id)
    }
  }, [currentGroup?.id])

  const systemData = useAttendanceStore((state) => state.systemStats)
  const timeHealth = useAttendanceStore((state) => state.timeHealth)
  const isStatsLoading = useAttendanceStore((state) => state.isStatsLoading)

  const timeHealthState = useMemo(
    () => ({
      timeHealth,
      loading: isStatsLoading,
    }),
    [timeHealth, isStatsLoading],
  )

  const [isLoading, setIsLoading] = useState(false)
  const [forceLiveness, setForceLiveness] = useState(false)
  const [triggerCreateGroup, setTriggerCreateGroup] = useState(0)
  const [deselectMemberTrigger, setDeselectMemberTrigger] = useState(0)
  const [hasSelectedMember, setHasSelectedMember] = useState(false)
  const [reportsExportHandlers, setReportsExportHandlers] = useState<{
    exportCSV: () => void
    exportAllGroupsCSV?: () => void
  } | null>(null)
  const [addMemberHandler, setAddMemberHandler] = useState<(() => void) | null>(null)

  const enrollmentSource = useGroupUIStore((state) => state.lastEnrollmentSource)
  const enrollmentMode = useGroupUIStore((state) => state.lastEnrollmentMode)
  const setEnrollmentState = useGroupUIStore((state) => state.setEnrollmentState)

  const toggleQuickSetting = (key: keyof QuickSettings) => {
    const newSettings = { ...quickSettings, [key]: !quickSettings[key] }
    onQuickSettingsChange(newSettings)
  }

  const updateAudioSetting = (updates: Partial<AudioSettings>) => {
    onAudioSettingsChange(updates)
  }

  const updateAttendanceSetting = (updates: Partial<AttendanceSettings>) => {
    onAttendanceSettingsChange(updates)
  }

  const loadSystemData = useCallback(async () => {
    try {
      useAttendanceStore.getState().setStatsLoading(true)
      const [faceStats, attendanceStats, timeHealthData] = await Promise.all([
        backendService.getDatabaseStats(),
        attendanceManager.getAttendanceStats(),
        attendanceManager.getTimeHealth().catch(() => null),
      ])
      useAttendanceStore.getState().setSystemStats({
        totalPersons: faceStats.total_persons,
        totalMembers: attendanceStats.total_members,
        lastUpdated: new Date().toISOString(),
      })
      useAttendanceStore.getState().setTimeHealth(timeHealthData)
    } catch (error) {
      console.error("Failed to load system data:", error)
    } finally {
      useAttendanceStore.getState().setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Only fetch if data is null or extremely old
    const stats = useAttendanceStore.getState().systemStats
    const isInitial = stats.totalPersons === null

    if (isInitial) {
      loadSystemData()
    }
  }, [loadSystemData])

  const [policyOverrides, setPolicyOverrides] = useState<{
    trackCheckout?: boolean
    lateThresholdEnabled?: boolean
    lateThresholdMinutes?: number
    attendanceCooldownSeconds?: number
    dataRetentionDays?: number
  }>({})

  const loadPolicy = useCallback(async () => {
    const [
      forceLivenessVal,
      trackCheckout,
      lateThresholdEnabled,
      lateThresholdMinutes,
      attendanceCooldownSeconds,
      dataRetentionDays,
    ] = await Promise.all([
      persistentSettings.get<boolean>("sync.policy.forceLiveness"),
      persistentSettings.get<boolean>("sync.policy.trackCheckout"),
      persistentSettings.get<boolean>("sync.policy.lateThresholdEnabled"),
      persistentSettings.get<number>("sync.policy.lateThresholdMinutes"),
      persistentSettings.get<number>("sync.policy.attendanceCooldownSeconds"),
      persistentSettings.get<number>("sync.policy.dataRetentionDays"),
    ])
    setForceLiveness(!!forceLivenessVal)
    setPolicyOverrides({
      trackCheckout: trackCheckout ?? undefined,
      lateThresholdEnabled: lateThresholdEnabled ?? undefined,
      lateThresholdMinutes: lateThresholdMinutes ?? undefined,
      attendanceCooldownSeconds: attendanceCooldownSeconds ?? undefined,
      dataRetentionDays: dataRetentionDays ?? undefined,
    })
  }, [])

  useEffect(() => {
    loadPolicy()
  }, [loadPolicy])

  useEffect(() => {
    if (!window.electronAPI?.sync?.onDataChanged) return
    const cleanup = window.electronAPI.sync.onDataChanged(() => {
      loadPolicy()
    })
    return cleanup
  }, [loadPolicy])

  useEffect(() => {
    if (activeSection !== "group" || groupInitialSection !== "reports") {
      setReportsExportHandlers(null)
    }
  }, [activeSection, groupInitialSection])

  useEffect(() => {
    if (!currentGroup) {
      setAddMemberHandler(null)
    }
  }, [currentGroup])

  const handleClearDatabase = async (skipConfirmation = false) => {
    if (!skipConfirmation) {
      const ok = await dialog.confirm({
        title: "Clear all face data",
        message:
          "Clear ALL face recognition data? This will delete all enrolled faces and embeddings. This cannot be undone.",
        confirmText: "Clear data",
        cancelText: "Cancel",
        confirmVariant: "danger",
        requireTypedConfirmation: {
          label: 'Type "CLEAR FACE DATA" to continue',
          placeholder: "CLEAR FACE DATA",
          value: "CLEAR FACE DATA",
        },
      })
      if (!ok) return
    }
    setIsLoading(true)
    try {
      await backendService.clearDatabase()
      await loadSystemData()
      await dialog.alert({
        title: "Database cleared",
        message: "Face recognition data cleared successfully.",
      })
    } catch (error) {
      console.error("Failed to clear database:", error)
      await dialog.alert({
        title: "Clear failed",
        message: "Failed to clear face recognition data. Try again.",
        variant: "danger",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Prevent visual stuttering (flickering placeholder/empty-states) during group
  // selection/creation transitions by declaring a virtual self-healing options array.
  // Ensures the newly selected group is instantly recognized by consumers even before
  // background network synchronizations complete.
  const dropdownGroups = useMemo(() => {
    const list = initialGroups.filter((g) => g.id !== "all")
    if (currentGroup && currentGroup.id !== "all" && !list.some((g) => g.id === currentGroup.id)) {
      list.push(currentGroup)
    }
    return list
  }, [initialGroups, currentGroup])

  const validInitialGroup = useMemo(() => {
    if (currentGroup && currentGroup.id !== "all") {
      return currentGroup
    }
    return initialGroups.find((g) => g.id !== "all") ?? null
  }, [currentGroup, initialGroups])

  const handleGroupBack = useCallback(() => {
    setActiveSection("attendance")
  }, [setActiveSection])

  const handleExportHandlersReady = useCallback(
    (handlers: { exportCSV: () => void; exportAllGroupsCSV?: () => void }) => {
      setReportsExportHandlers(handlers)
    },
    [],
  )

  const handleAddMemberHandlerReady = useCallback((handler: () => void) => {
    setAddMemberHandler(() => handler)
  }, [])

  const handleGroupsChangedInternal = useCallback(
    async (newGroup?: AttendanceGroup) => {
      if (newGroup) {
        useGroupStore.getState().setSelectedGroup(newGroup)
        if (onGroupSelect) {
          onGroupSelect(newGroup)
        }
      }

      await loadSystemData()
      onGroupsChanged?.()
    },
    [loadSystemData, onGroupSelect, onGroupsChanged],
  )

  const dropdownValue = validInitialGroup?.id ?? null

  return {
    activeSection,
    setActiveSection,
    groupInitialSection,
    setGroupInitialSection,
    systemData,
    timeHealthState,
    groups: initialGroups,
    isLoading,
    members: currentGroupMembers,
    triggerCreateGroup,
    setTriggerCreateGroup,
    deselectMemberTrigger,
    setDeselectMemberTrigger,
    hasSelectedMember,
    setHasSelectedMember,
    reportsExportHandlers,
    addMemberHandler,
    toggleQuickSetting,
    updateAudioSetting,
    updateAttendanceSetting,
    handleClearDatabase,
    handleGroupBack,
    handleExportHandlersReady,
    handleAddMemberHandlerReady,
    handleGroupsChanged: handleGroupsChangedInternal,
    dropdownGroups,
    dropdownValue,
    validInitialGroup,
    loadSystemData,
    forceLiveness,
    policyOverrides,
    enrollmentSource,
    enrollmentMode,
    setEnrollmentState,
  }
}
