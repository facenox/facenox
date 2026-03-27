export interface FaceRecognitionRequest {
  image: string
  bbox: number[]
  group_id: string
  landmarks_5: number[][]
  enable_liveness_detection: boolean
}

export interface FaceRecognitionResponse {
  success: boolean
  person_id: string | null
  name?: string
  similarity: number
  processing_time: number
  error: string | null
}

export interface BatchFaceRecognitionItem extends FaceRecognitionResponse {
  track_id: number
}

export interface BatchFaceRecognitionResponse {
  success: boolean
  results: BatchFaceRecognitionItem[]
  processing_time: number
}

export interface FaceRegistrationRequest {
  image: string
  person_id: string
  bbox: number[]
  group_id: string
  landmarks_5: number[][]
  enable_liveness_detection: boolean
}

export interface FaceRegistrationResponse {
  success: boolean
  person_id: string
  total_persons: number
  processing_time: number
  error: string | null
}

export interface PersonRemovalRequest {
  person_id: string
}

export interface PersonRemovalResponse {
  success: boolean
  person_id?: string
  message: string
  total_persons?: number
  error?: string
}

export interface SimilarityThresholdRequest {
  threshold: number
}

export interface SimilarityThresholdResponse {
  success: boolean
  message: string
  threshold: number
  error?: string
}

export interface PersonInfo {
  person_id: string
  embedding_count: number
  last_seen?: string
}

export interface DatabaseStatsResponse {
  total_persons: number
  persons: PersonInfo[]
}

export interface PersonUpdateResponse {
  success: boolean
  message: string
  updated_records: number
}

export interface PersonListResponse {
  success: boolean
  persons: {
    person_id: string
    embedding_count: number
  }[]
  total_count: number
}

export interface DatabaseClearResponse {
  success: boolean
  message: string
  total_persons: number
}

export interface RecognitionResult {
  person_id?: string
  similarity?: number
  is_recognized: boolean
}

export interface FaceWithRecognition {
  bbox: {
    x: number
    y: number
    width: number
    height: number
  }
  confidence: number
  track_id?: number
  liveness?: {
    is_real: boolean | null
    logit_diff?: number
    real_logit?: number
    spoof_logit?: number
    confidence?: number
    status: "real" | "spoof" | "error" | "move_closer"
    label?: string
    attack_type?: string
    message?: string
  }
  recognition?: RecognitionResult
}

export interface DetectionWithRecognitionResult {
  faces: FaceWithRecognition[]
  model_used: string
}

export type AttendanceStatus = "present" | "absent"

export interface AttendanceGroup {
  id: string
  name: string
  recognizer_model?: string
  created_at: Date
  is_active: boolean
  settings: {
    late_threshold_minutes?: number
    late_threshold_enabled?: boolean
    class_start_time?: string
    track_checkout?: boolean
  }
}

export interface AttendanceMember {
  person_id: string
  group_id: string
  name: string
  role?: string
  email?: string
  joined_at: Date
  is_active: boolean
  has_face_data?: boolean
  has_consent: boolean
}

export interface AttendanceRecord {
  id: string
  person_id: string
  group_id: string
  timestamp: Date
  confidence: number
  location?: string
  notes?: string
  is_manual: boolean
  event_type?: "check_in" | "check_out"
  created_by?: string
}

export interface AttendanceSession {
  id: string
  person_id: string
  group_id: string
  date: string
  check_in_time?: Date
  check_out_time?: Date
  total_hours?: number
  status: AttendanceStatus
  is_late: boolean
  late_minutes?: number
  notes?: string
}

export interface AttendanceStats {
  total_members: number
  present_today: number
  absent_today: number
  late_today: number
}

export interface AttendanceReport {
  group_id: string
  date_range: {
    start: Date
    end: Date
  }
  members: {
    person_id: string
    name: string
    total_days: number
    present_days: number
    absent_days: number
    late_days: number
    attendance_rate: number
  }[]
  summary: {
    total_working_days: number
    average_attendance_rate: number
    most_punctual: string
    most_absent: string
  }
}

export interface AttendanceSettings {
  late_threshold_minutes: number
  enable_location_tracking: boolean
  enable_liveness_detection: boolean
  confidence_threshold?: number
  attendance_cooldown_seconds: number
  max_recognition_faces_per_frame: number
  data_retention_days?: number
}

export interface AttendanceEvent {
  id: string
  person_id: string
  group_id: string
  timestamp: Date
  confidence: number
  location?: string
  processed: boolean
  event_type?: "check_in" | "check_out"
  error?: string
}

// Bulk Operations
export interface BulkDetectResultItem {
  image_id: string
  success: boolean
  faces: {
    bbox: [number, number, number, number]
    confidence: number
    landmarks_5?: number[][]
    quality_score: number
    is_acceptable: boolean
    suggestions?: string[]
  }[]
  total_faces?: number
  error?: string
}

export interface BulkDetectResponse {
  success: boolean
  group_id: string
  total_images: number
  results: BulkDetectResultItem[]
}

export interface BulkRegisterResultItem {
  index: number
  person_id: string
  member_name?: string
  success: boolean
  error?: string
  quality_warning?: string
}

export interface BulkRegisterResponse {
  success: boolean
  group_id: string
  success_count: number
  failed_count: number
  results: BulkRegisterResultItem[]
}
