import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import type { AttendanceGroup, AttendanceMember, AttendanceRecord } from "@/types/recognition"
import type { CooldownInfo } from "@/components/main/types"
import { persistentSettings } from "@/services/PersistentSettingsService"

interface AttendanceState {
  currentGroup: AttendanceGroup | null
  attendanceGroups: AttendanceGroup[]
  groupMembers: AttendanceMember[]
  recentAttendance: AttendanceRecord[]

  showGroupManagement: boolean
  showDeleteConfirmation: boolean
  groupToDelete: AttendanceGroup | null
  newGroupName: string

  persistentCooldowns: Map<string, CooldownInfo>

  attendanceCooldownSeconds: number
  enableSpoofDetection: boolean
  dataRetentionDays: number

  setCurrentGroup: (group: AttendanceGroup | null) => void
  setAttendanceGroups: (groups: AttendanceGroup[]) => void
  setGroupMembers: (members: AttendanceMember[]) => void
  setRecentAttendance: (records: AttendanceRecord[]) => void
  setShowGroupManagement: (show: boolean) => void
  setShowDeleteConfirmation: (show: boolean) => void
  setGroupToDelete: (group: AttendanceGroup | null) => void
  setNewGroupName: (name: string) => void
  setPersistentCooldowns: (
    cooldowns:
      | Map<string, CooldownInfo>
      | ((prev: Map<string, CooldownInfo>) => Map<string, CooldownInfo>),
  ) => void
  setAttendanceCooldownSeconds: (seconds: number) => void
  setEnableSpoofDetection: (enabled: boolean) => void
  setDataRetentionDays: (days: number) => void
}

const loadInitialSettings = async (): Promise<Partial<AttendanceState>> => {
  const attendanceSettings = await persistentSettings.getAttendanceSettings()

  return {
    attendanceCooldownSeconds: attendanceSettings.attendanceCooldownSeconds,
    enableSpoofDetection: attendanceSettings.enableSpoofDetection,
    // Cooldowns are session-only spam filter state — never restore across restarts.
    persistentCooldowns: new Map(),
  }
}

export const useAttendanceStore = create<AttendanceState>()(
  subscribeWithSelector((set, get) => ({
    currentGroup: null,
    attendanceGroups: [],
    groupMembers: [],
    recentAttendance: [],
    showGroupManagement: false,
    showDeleteConfirmation: false,
    groupToDelete: null,
    newGroupName: "",
    persistentCooldowns: new Map(),
    // trackingMode removed
    attendanceCooldownSeconds: 8,
    enableSpoofDetection: true,
    dataRetentionDays: 0,

    setCurrentGroup: (group) => {
      set({ currentGroup: group })
      persistentSettings
        .setUIState({
          selectedGroupId: group?.id || null,
        })
        .catch(console.error)
    },
    setAttendanceGroups: (groups) => set({ attendanceGroups: groups }),
    setGroupMembers: (members) => set({ groupMembers: members }),
    setRecentAttendance: (records) => set({ recentAttendance: records }),
    setShowGroupManagement: (show) => set({ showGroupManagement: show }),
    setShowDeleteConfirmation: (show) => set({ showDeleteConfirmation: show }),
    setGroupToDelete: (group) => set({ groupToDelete: group }),
    setNewGroupName: (name) => set({ newGroupName: name }),
    setPersistentCooldowns: (cooldowns) => {
      const prevCooldowns = get().persistentCooldowns
      const newCooldownsMap = typeof cooldowns === "function" ? cooldowns(prevCooldowns) : cooldowns

      set({ persistentCooldowns: newCooldownsMap })

      // Persist to electron-store
      // Convert Map to plain object for storage
      const obj: Record<string, CooldownInfo> = {}
      newCooldownsMap.forEach((val, key) => {
        obj[key] = val
      })
      persistentSettings.setCooldowns(obj).catch(console.error)
    },
    // setTrackingMode removed
    setAttendanceCooldownSeconds: (seconds) => {
      set({ attendanceCooldownSeconds: seconds })
      persistentSettings
        .setAttendanceSettings({ attendanceCooldownSeconds: seconds })
        .catch(console.error)
    },
    setEnableSpoofDetection: (enabled) => {
      set({ enableSpoofDetection: enabled })
      persistentSettings
        .setAttendanceSettings({ enableSpoofDetection: enabled })
        .catch(console.error)
    },
    setDataRetentionDays: (days) => {
      set({ dataRetentionDays: days })
    },
  })),
)

if (typeof window !== "undefined") {
  loadInitialSettings().then((settings) => {
    useAttendanceStore.setState(settings)
  })

  // Second pass: once groups are set, find the one matching selectedGroupId
  useAttendanceStore.subscribe(
    (state) => state.attendanceGroups,
    (groups: AttendanceGroup[]) => {
      const currentGroup = useAttendanceStore.getState().currentGroup
      if (!currentGroup && groups.length > 0) {
        persistentSettings.getUIState().then((ui) => {
          if (ui.selectedGroupId) {
            const match = groups.find((g: AttendanceGroup) => g.id === ui.selectedGroupId)
            if (match) {
              useAttendanceStore.setState({ currentGroup: match })
            }
          }
        })
      }
    },
  )
}
