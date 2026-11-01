import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

interface ScanDataState {
  isShellReady: boolean
  shellBootstrapError: string | null
  isPanelLoading: boolean
  isPanelSwitchPending: boolean
  panelDataError: string | null
  attendanceGroups: AttendanceGroup[]
  currentGroup: AttendanceGroup | null
  groupMembers: AttendanceMember[]
}

type ScanReadinessReason =
  "ready" | "loading" | "error" | "no_groups" | "no_selection" | "no_faces" | "no_camera"
export interface ScanReadiness {
  canStart: boolean
  reason: ScanReadinessReason
  tooltip?: string
}

export function getScanReadiness(state: ScanDataState, hasCameraDevices: boolean): ScanReadiness {
  if (state.shellBootstrapError || state.panelDataError) {
    return { canStart: false, reason: "error", tooltip: "Attendance data couldn't be loaded" }
  }
  if (!state.isShellReady) {
    return { canStart: false, reason: "loading", tooltip: "Loading groups and settings" }
  }
  if (!state.attendanceGroups.length) {
    return { canStart: false, reason: "no_groups", tooltip: "Create a group to start scanning" }
  }
  if (!state.currentGroup) {
    return { canStart: false, reason: "no_selection", tooltip: "Select a group to start scanning" }
  }
  if (state.isPanelLoading || state.isPanelSwitchPending) {
    return { canStart: false, reason: "loading", tooltip: "Loading group members" }
  }
  const groupId = state.currentGroup.id
  const hasEnrolledFaces = state.groupMembers.some(
    (member) =>
      member.is_active &&
      member.has_face_data &&
      (groupId === "all" || member.group_id === groupId),
  )
  if (!hasEnrolledFaces) {
    return {
      canStart: false,
      reason: "no_faces",
      tooltip: "Enroll at least one member to start scanning",
    }
  }
  if (!hasCameraDevices) {
    return { canStart: false, reason: "no_camera", tooltip: "No camera detected" }
  }
  return { canStart: true, reason: "ready" }
}
