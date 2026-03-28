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
  isShellBootstrapping: boolean
  isShellReady: boolean
  shellBootstrapError: string | null
  isPanelLoading: boolean
  isPanelRefreshing: boolean

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
  setShellBootstrapping: (bootstrapping: boolean) => void
  setShellReady: (ready: boolean) => void
  setShellBootstrapError: (error: string | null) => void
  setPanelLoading: (loading: boolean) => void
  setPanelRefreshing: (refreshing: boolean) => void
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

export const useAttendanceStore = create<AttendanceState>()(
  subscribeWithSelector((set, get) => ({
    currentGroup: null,
    attendanceGroups: [],
    groupMembers: [],
    recentAttendance: [],
    isShellBootstrapping: true,
    isShellReady: false,
    shellBootstrapError: null,
    isPanelLoading: false,
    isPanelRefreshing: false,
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
    setShellBootstrapping: (bootstrapping) => set({ isShellBootstrapping: bootstrapping }),
    setShellReady: (ready) => set({ isShellReady: ready }),
    setShellBootstrapError: (error) => set({ shellBootstrapError: error }),
    setPanelLoading: (loading) => set({ isPanelLoading: loading }),
    setPanelRefreshing: (refreshing) => set({ isPanelRefreshing: refreshing }),
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
