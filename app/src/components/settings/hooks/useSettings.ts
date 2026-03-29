import { useState, useEffect, useCallback, useMemo } from "react"
import { backendService, attendanceManager } from "@/services"
import { useDialog } from "@/components/shared"
import { useGroupUIStore } from "@/components/group/stores"
import type { GroupSection } from "@/components/group"
import type {
  QuickSettings,
  AttendanceSettings,
  AudioSettings,
  SettingsOverview,
  TimeHealthOverview,
} from "@/components/settings/types"
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
  const [activeSection, setActiveSection] = useState<string>(initialSection || "group")
  const [groupInitialSection, setGroupInitialSection] = useState<GroupSection | undefined>(
    initialGroupSection || "overview",
  )
  const [systemData, setSystemData] = useState<SettingsOverview>({
    totalPersons: null,
    totalMembers: null,
    lastUpdated: new Date().toISOString(),
  })
  const [timeHealthState, setTimeHealthState] = useState<TimeHealthOverview>({
    timeHealth: null,
    loading: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [triggerCreateGroup, setTriggerCreateGroup] = useState(0)
  const [deselectMemberTrigger, setDeselectMemberTrigger] = useState(0)
  const [hasSelectedMember, setHasSelectedMember] = useState(false)
  const [reportsExportHandlers, setReportsExportHandlers] = useState<{
    exportCSV: () => void
  } | null>(null)
  const [addMemberHandler, setAddMemberHandler] = useState<(() => void) | null>(null)
  const [isGroupExpanded, setIsGroupExpanded] = useState(true)

  const registrationSource = useGroupUIStore((state) => state.lastRegistrationSource)
  const registrationMode = useGroupUIStore((state) => state.lastRegistrationMode)
  const setRegistrationState = useGroupUIStore((state) => state.setRegistrationState)

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
      setTimeHealthState((prev) => ({ ...prev, loading: true }))
      const [faceStats, attendanceStats, timeHealth] = await Promise.all([
        backendService.getDatabaseStats(),
        attendanceManager.getAttendanceStats(),
        attendanceManager.getTimeHealth().catch(() => null),
      ])
      setSystemData({
        totalPersons: faceStats.total_persons,
        totalMembers: attendanceStats.total_members,
        lastUpdated: new Date().toISOString(),
      })
      setTimeHealthState({
        timeHealth,
        loading: false,
      })
    } catch (error) {
      console.error("Failed to load system data:", error)
      setTimeHealthState((prev) => ({ ...prev, loading: false }))
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSystemData()
    }, 250)
    return () => clearTimeout(timer)
  }, [loadSystemData])

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

  const handleClearDatabase = async () => {
    const ok = await dialog.confirm({
      title: "Clear all face data",
      message:
        "Clear ALL face recognition data? This will delete all registered faces and embeddings. This cannot be undone.",
      confirmText: "Clear data",
      cancelText: "Cancel",
      confirmVariant: "danger",
    })
    if (!ok) return
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
        message: "Failed to clear face recognition data. Please try again.",
        variant: "danger",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const dropdownGroups = useMemo(() => initialGroups, [initialGroups])

  const validInitialGroup = useMemo(() => {
    if (!currentGroup) return null
    return initialGroups.some((group) => group.id === currentGroup.id) ? currentGroup : null
  }, [currentGroup, initialGroups])

  const handleGroupBack = useCallback(() => {
    setActiveSection("attendance")
  }, [])

  const handleExportHandlersReady = useCallback((handlers: { exportCSV: () => void }) => {
    setReportsExportHandlers(handlers)
  }, [])

  const handleAddMemberHandlerReady = useCallback((handler: () => void) => {
    setAddMemberHandler(() => handler)
  }, [])

  const handleGroupsChangedInternal = useCallback(
    async (newGroup?: AttendanceGroup) => {
      await loadSystemData()

      if (newGroup && onGroupSelect) {
        onGroupSelect(newGroup)
      }

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
    isGroupExpanded,
    setIsGroupExpanded,
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
    registrationSource,
    registrationMode,
    setRegistrationState,
  }
}
