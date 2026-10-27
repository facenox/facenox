import type { AttendanceTimeHealth } from "@/types/recognition"

// Settings types

export interface QuickSettings {
  showRecognitionNames: boolean
  cameraMirrored: boolean
  showTrackingBoxes?: boolean
  cameraFitCover?: boolean
  showDetectionPanel?: boolean
  autoStartScan?: boolean
}

export interface AudioSettings {
  recognitionSoundEnabled: boolean
  recognitionSoundUrl: string | null
}

export interface AttendanceSettings {
  attendanceTimezone?: string | null
  lateThresholdEnabled: boolean
  lateThresholdMinutes: number
  classStartTime: string
  classEndTime?: string | null
  attendanceCooldownSeconds: number
  enableSpoofDetection: boolean
  maxRecognitionFacesPerFrame: number
  trackCheckout: boolean
  dataRetentionDays?: number
  cloudRetentionDays?: number
  forceLiveness?: boolean
}

export interface SettingsOverview {
  totalPersons: number | null
  totalMembers: number | null
  lastUpdated: string
}

export interface TimeHealthOverview {
  timeHealth: AttendanceTimeHealth | null
  loading: boolean
  error?: string | null
}
