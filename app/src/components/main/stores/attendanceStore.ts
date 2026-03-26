import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import type { AttendanceGroup, AttendanceMember, AttendanceRecord } from "@/types/recognition"
import type { CooldownInfo } from "@/components/main/types"
import { persistentSettings } from "@/services/PersistentSettingsService"
import { attendanceManager } from "@/services/AttendanceManager"

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
  maxRecognitionFacesPerFrame: number
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
  setMaxRecognitionFacesPerFrame: (count: number) => void
  setDataRetentionDays: (days: number) => void
}

const loadInitialSettings = async (): Promise<Partial<AttendanceState>> => {
  const attendanceSettings = await persistentSettings.getAttendanceSettings()
  const dbSettings = await attendanceManager.getSettings().catch(() => null)

  return {
    attendanceCooldownSeconds: attendanceSettings.attendanceCooldownSeconds,
    enableSpoofDetection: dbSettings?.enable_liveness_detection ?? true,
    maxRecognitionFacesPerFrame: dbSettings?.max_recognition_faces_per_frame ?? 6,
    dataRetentionDays: dbSettings?.data_retention_days ?? 0,
    // Cooldowns are session-only spam filter state - never restore across restarts.
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

    attendanceCooldownSeconds: 8,
    enableSpoofDetection: true,
    maxRecognitionFacesPerFrame: 6,
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
    },

    setAttendanceCooldownSeconds: (seconds) => {
      set({ attendanceCooldownSeconds: seconds })
      persistentSettings
        .setAttendanceSettings({ attendanceCooldownSeconds: seconds })
        .catch(console.error)
    },
    setEnableSpoofDetection: (enabled) => {
      set({ enableSpoofDetection: enabled })
      attendanceManager.updateSettings({ enable_liveness_detection: enabled }).catch(console.error)
    },
    setMaxRecognitionFacesPerFrame: (count) => {
      set({ maxRecognitionFacesPerFrame: count })
      attendanceManager
        .updateSettings({ max_recognition_faces_per_frame: count })
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
