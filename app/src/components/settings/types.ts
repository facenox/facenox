import type { AttendanceTimeHealth } from "@/types/recognition"

// Settings types

export interface QuickSettings {
  showRecognitionNames: boolean
  cameraMirrored: boolean
  // Present in UI store; kept optional to avoid breaking older saved settings
  showLandmarks?: boolean
}

export interface AudioSettings {
  recognitionSoundEnabled: boolean
  recognitionSoundUrl: string | null
}

export interface AttendanceSettings {
  lateThresholdEnabled: boolean
  lateThresholdMinutes: number
  classStartTime: string
  attendanceCooldownSeconds: number
  enableSpoofDetection: boolean
  maxRecognitionFacesPerFrame: number
  trackCheckout: boolean
  dataRetentionDays?: number
}

export interface SettingsOverview {
  totalPersons: number | null
  totalMembers: number | null
  lastUpdated: string
}

export interface TimeHealthOverview {
  timeHealth: AttendanceTimeHealth | null
  loading: boolean
}
