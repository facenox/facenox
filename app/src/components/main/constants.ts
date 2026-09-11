type LivenessStatus =
  | "real"
  | "spoof"
  | "candidate_real"
  | "unknown"
  | "error"
  | "move_closer"
  | "center_face"
  | "glare"
  | "too_dark"
  | "look_at_camera"

export const NON_LOGGING_ANTISPOOF_STATUSES = new Set<LivenessStatus>([
  "spoof",
  "candidate_real",
  "unknown",
  "error",
  "move_closer",
  "center_face",
  "glare",
  "too_dark",
  "look_at_camera",
])

export const TRACKING_HISTORY_LIMIT = 20
