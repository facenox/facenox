type LivenessStatus =
  | "real"
  | "spoof"
  | "candidate_real"
  | "unknown"
  | "error"
  | "move_closer"
  | "center_face"

export const NON_LOGGING_ANTISPOOF_STATUSES = new Set<LivenessStatus>([
  "spoof",
  "candidate_real",
  "unknown",
  "error",
  "move_closer",
  "center_face",
])

export const TRACKING_HISTORY_LIMIT = 20
