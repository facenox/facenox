import type { AudioSettings, QuickSettings } from "../components/settings/types"
import type { UpdateInfo } from "../types/global"

const DEFAULT_SYNC_INTERVAL_MINUTES = 15

export interface PersistentSettingsSchema {
  quickSettings: QuickSettings

  audio: AudioSettings

  attendance: {
    lateThresholdEnabled: boolean
    lateThresholdMinutes: number
    classStartTime: string
    attendanceCooldownSeconds: number
  }

  ui: {
    sidebarCollapsed: boolean
    sidebarWidth: number
    selectedGroupId: string | null
    groupSidebarCollapsed: boolean
    selectedCamera: string
    selectedCameraLabel: string | null
    lastRegistrationSource: string | null
    lastRegistrationMode: string | null
    hasSeenIntro: boolean
    activeGroupSection: string | null
    closeToTrayNoticeDismissed: boolean
  }

  reportScratchpad: Record<
    string,
    {
      columns: string[]
      groupBy: string
      statusFilter: string
    }
  >

  reportViews: Record<string, unknown>
  reportDefaultViewNames: Record<string, string>
  updater: {
    lastChecked: string | null
    cachedInfo: UpdateInfo | null
  }
  sync: {
    enabled: boolean
    cloudBaseUrl: string
    organizationId: string
    organizationName: string
    siteId: string
    siteName: string
    deviceId: string
    deviceName: string
    deviceToken: string
    intervalMinutes: number
    lastSyncedAt: string | null
    lastSyncStatus: "idle" | "success" | "error"
    lastSyncMessage: string | null
  }
}

export const defaultSettings: PersistentSettingsSchema = {
  quickSettings: {
    showFPS: false,
    showRecognitionNames: true,
    cameraMirrored: true,
  },
  audio: {
    recognitionSoundEnabled: true,
    recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
  },
  attendance: {
    lateThresholdEnabled: false,
    lateThresholdMinutes: 5,
    classStartTime: "00:00",
    attendanceCooldownSeconds: 60,
  },
  ui: {
    sidebarCollapsed: false,
    sidebarWidth: 360, // Middle value between MIN_EXPANDED_WIDTH (240) and MAX_WIDTH (480)
    selectedGroupId: null,
    groupSidebarCollapsed: false,
    selectedCamera: "",
    selectedCameraLabel: null,
    lastRegistrationSource: null,
    lastRegistrationMode: null,
    hasSeenIntro: false,
    activeGroupSection: null,
    closeToTrayNoticeDismissed: false,
  },
  reportScratchpad: {},
  reportViews: {},
  reportDefaultViewNames: {},
  updater: {
    lastChecked: null,
    cachedInfo: null,
  },
  sync: {
    enabled: false,
    cloudBaseUrl: "",
    organizationId: "",
    organizationName: "",
    siteId: "",
    siteName: "",
    deviceId: "",
    deviceName: "",
    deviceToken: "",
    intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
    lastSyncedAt: null,
    lastSyncStatus: "idle",
    lastSyncMessage: null,
  },
}
