import { expect, it } from "vitest"
import { getScanReadiness } from "./scanReadiness"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures"

const group = createAttendanceGroup({ id: "A" })
const ready = {
  isShellReady: true,
  shellBootstrapError: null,
  isPanelLoading: false,
  isPanelSwitchPending: false,
  panelDataError: null,
  attendanceGroups: [group],
  currentGroup: group,
  groupMembers: [createAttendanceMember({ group_id: "A", is_active: true, has_face_data: true })],
}

it("requires confirmed member data on startup and while switching", () => {
  expect(getScanReadiness({ ...ready, isPanelLoading: true }, true).reason).toBe("loading")
  expect(getScanReadiness({ ...ready, isPanelSwitchPending: true }, true).reason).toBe("loading")
  expect(getScanReadiness(ready, true).canStart).toBe(true)
})

it("does not accept enrollment belonging to another group or an inactive member", () => {
  for (const member of [
    createAttendanceMember({ group_id: "B", has_face_data: true }),
    createAttendanceMember({ group_id: "A", is_active: false, has_face_data: true }),
  ])
    expect(getScanReadiness({ ...ready, groupMembers: [member] }, true).canStart).toBe(false)
  expect(getScanReadiness({ ...ready, currentGroup: { ...group, id: "all" } }, true).canStart).toBe(
    true,
  )
})

it("blocks failed or unavailable data and missing cameras", () => {
  expect(getScanReadiness({ ...ready, panelDataError: "Failed" }, true).reason).toBe("error")
  expect(
    getScanReadiness({ ...ready, isShellReady: false, shellBootstrapError: "Failed" }, true).reason,
  ).toBe("error")
  expect(getScanReadiness({ ...ready, attendanceGroups: [] }, true).reason).toBe("no_groups")
  expect(getScanReadiness({ ...ready, currentGroup: null }, true).reason).toBe("no_selection")
  expect(getScanReadiness(ready, false).reason).toBe("no_camera")
})

it("returns group-specific or global enrollment tooltip depending on whether All Groups is selected", () => {
  const noFaces = { ...ready, groupMembers: [] }
  expect(getScanReadiness(noFaces, true).tooltip).toBe(
    "Enroll at least one member in this group to start scanning",
  )
  expect(
    getScanReadiness({ ...noFaces, currentGroup: { ...group, id: "all" } }, true).tooltip,
  ).toBe("Enroll at least one member to start scanning")
})
