import type { AudioSettings, QuickSettings } from "../components/settings/types"
import type { UpdateInfo } from "../types/updater"
import { DEFAULT_REMOTE_BASE_URL, DEFAULT_SYNC_INTERVAL_MINUTES } from "./syncDefaults"

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
    lastEnrollmentSource: string | null
    lastEnrollmentMode: string | null
    hasSeenIntro: boolean
    pendingCloudSetup: boolean
    activeGroupSection: string | null
    antiSpoofDetectionInfoDismissed: boolean
    enrollmentInfoDismissed: boolean
  }

  reportScratchpad: Record<
    string,
    {
      columns: string[]
      groupBy: string
      statusFilter: string
      columnsFollowDefault?: boolean
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
    remoteBaseUrl: string
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
  security: {
    adminPinEnabled: boolean
    adminPin: string
  }
  autoExport: {
    enabled: boolean
    time: string
    directory: string
    format: "excel_workbook" | "individual_csvs" | "combined_csv"
    lastExportedDate: string | null
  }
}

export const defaultSettings: PersistentSettingsSchema = {
  quickSettings: {
    showRecognitionNames: true,
    cameraMirrored: true,
    showTrackingBoxes: true,
    cameraFitCover: false,
  },
  audio: {
    recognitionSoundEnabled: true,
    recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
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
    lastEnrollmentSource: null,
    lastEnrollmentMode: null,
    hasSeenIntro: false,
    pendingCloudSetup: false,
    activeGroupSection: null,
    antiSpoofDetectionInfoDismissed: false,
    enrollmentInfoDismissed: false,
  },
  reportScratchpad: {},
  reportViews: {},
  reportDefaultViewNames: {},
  updater: {
    lastChecked: null,
    cachedInfo: null,
  },
  sync: {
    enabled: true,
    remoteBaseUrl: DEFAULT_REMOTE_BASE_URL,
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
  security: {
    adminPinEnabled: false,
    adminPin: "1234",
  },
  autoExport: {
    enabled: false,
    time: "17:00",
    directory: "",
    format: "excel_workbook",
    lastExportedDate: null,
  },
}
