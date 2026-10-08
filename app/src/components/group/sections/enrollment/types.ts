export interface DetectedFace {
  faceId: string
  imageId: string
  bbox: [number, number, number, number]
  confidence: number
  landmarks_5?: number[][]
  qualityScore: number
  isAcceptable: boolean
  suggestions: string[]
  assignedPersonId: string | null
  previewUrl: string
  filename?: string
  parsedName?: string
  parsedRole?: string
  isAutoMatched?: boolean
  isNewMember?: boolean
  customMemberName?: string
}

export interface BulkEnrollmentResult {
  personId: string
  memberName: string
  success: boolean
  error?: string
  qualityWarning?: string
}

export interface BulkEnrollResponseItem {
  person_id: string
  member_name?: string
  success: boolean
  error?: string
  quality_warning?: string
}

export interface CapturedFrame {
  id: string
  dataUrl: string
  width: number
  height: number
  bbox?: [number, number, number, number]
  landmarks_5?: number[][]
  status: "processing" | "success" | "error" | "ready" | "enrolled"
  error?: string
  label?: string
  file?: File
  angle?: string
}

export type CaptureSource = "live" | "upload"
