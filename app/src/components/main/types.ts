// Shared types for Main component

import type { AttendanceGroup, AttendanceMember, AttendanceRecord } from "@/types/recognition"
import type { ExtendedFaceRecognitionResponse } from "@/components/main/utils"

export interface DetectionResult {
  faces: {
    bbox: {
      x: number
      y: number
      width: number
      height: number
    }
    renderOpacity?: number
    confidence: number
    track_id?: number
    landmarks_5: number[][]
    liveness?: {
      is_real: boolean | null
      confidence?: number
      logit_diff?: number
      real_logit?: number
      spoof_logit?: number
      status:
        | "real"
        | "spoof"
        | "candidate_real"
        | "unknown"
        | "error"
        | "move_closer"
        | "center_face"
      attack_type?: string
      message?: string
    }
    overlayGuidance?: {
      label: string
      tone: "warning" | "failure"
    }
    recognition?: ExtendedFaceRecognitionResponse
  }[]
  model_used: string
}

export interface WebSocketFaceData {
  bbox?: number[]
  confidence?: number
  track_id?: number
  landmarks_5?: number[][] // Required by our pipeline; validated at mapping time.
  liveness?: {
    is_real?: boolean | null
    confidence?: number
    logit_diff?: number
    real_logit?: number
    spoof_logit?: number
    status?:
      | "real"
      | "spoof"
      | "candidate_real"
      | "unknown"
      | "error"
      | "move_closer"
      | "center_face"
    attack_type?: string
    message?: string
  }
  recognition?: ExtendedFaceRecognitionResponse
}

export interface WebSocketDetectionResponse {
  faces?: WebSocketFaceData[]
  model_used?: string
  timestamp?: number
  frame_timestamp?: number
  frame_dropped?: boolean
  suggested_skip?: number
  performance_metrics?: {
    actual_fps?: number
    overload_counter?: number
    samples_count?: number
    queue_size?: number
    dropped_frames?: number
    max_performance_mode?: boolean
  }
}

export interface AttendanceEvent {
  type: "attendance_event"
  person_id: string
  group_id: string
  event_type: "check_in" | "check_out"
  timestamp: string
  check_in_time?: string
  check_out_time?: string
  total_hours?: number
  time_health?: {
    warning_message?: string
    online_verification_status?: string
    online_drift_seconds?: number
  }
  member?: {
    name?: string
    role?: string
  }
  bbox?: {
    x?: number
    y?: number
    width?: number
    height?: number
  }
  track_id?: number
}

export interface WebSocketConnectionMessage {
  message?: string
  status?: string
}

export interface WebSocketErrorMessage {
  message?: string
  error?: string
}

export interface TrackedFace {
  id: string
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
  lastSeen: number
  trackingHistory: {
    timestamp: number
    bbox: { x: number; y: number; width: number; height: number }
    confidence: number
  }[]
  isLocked: boolean
  personId?: string
  occlusionCount: number
  angleConsistency: number
  livenessStatus?:
    | "real"
    | "spoof"
    | "candidate_real"
    | "unknown"
    | "error"
    | "move_closer"
    | "center_face"
  unknownFramesCount?: number
}

export interface CooldownInfo {
  personId: string
  memberName?: string
  startTime: number
  lastKnownBbox?: { x: number; y: number; width: number; height: number }
  // Store the cooldown duration that was active when this cooldown was created
  // This prevents premature removal when the setting changes
  cooldownDurationSeconds: number
}

// Re-export needed types
export type { AttendanceGroup, AttendanceMember, AttendanceRecord }
