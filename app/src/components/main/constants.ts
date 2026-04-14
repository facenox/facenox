type LivenessStatus = "real" | "spoof" | "error" | "move_closer" | "center_face"

export const NON_LOGGING_ANTISPOOF_STATUSES = new Set<LivenessStatus>([
  "spoof",
  "error",
  "move_closer",
  "center_face",
])

export const TRACKING_HISTORY_LIMIT = 20
