import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { useAttendanceGroups } from "./useAttendanceGroups"
import { useFaceRecognition } from "./useFaceRecognition"
import { useAttendanceStore, useDetectionStore } from "@/components/main/stores"
import { useGroupStore } from "@/components/group/stores"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { DetectionResult } from "@/components/main/types"
import { createAttendanceRecord } from "@/test/fixtures"

const { manager, settings } = vi.hoisted(() => ({
  manager: {
    getGroups: vi.fn(),
    getGroupMembers: vi.fn(),
    getRecords: vi.fn(),
    getMember: vi.fn(),
    getGroupStats: vi.fn(),
  },
  settings: {
    setUIState: vi.fn().mockResolvedValue(undefined),
    getUIState: vi.fn().mockResolvedValue({}),
  },
}))
vi.mock("@/services", () => ({ attendanceManager: manager, backendService: {} }))
vi.mock("@/services/AttendanceManager", () => ({ attendanceManager: manager }))
vi.mock("@/services/PersistentSettingsService", () => ({ persistentSettings: settings }))

const group = (id: string): AttendanceGroup => ({
  id,
  name: id,
  created_at: new Date(),
  is_active: true,
  settings: {},
})
const member = (groupId: string, name: string): AttendanceMember => ({
  person_id: "one",
  group_id: groupId,
  name,
  joined_at: new Date(),
  is_active: true,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((r, j) => {
    resolve = r
    reject = j
  })
  return { promise, resolve, reject }
}

function useRecognitionWithGroups() {
  const groups = useAttendanceGroups()
  const recognition = useFaceRecognition({
    currentGroupRef: groups.currentGroupRef,
    memberCacheRef: groups.memberCacheRef,
    calculateAngleConsistencyRef: { current: () => 1 },
  })
  return { groups, recognition }
}

function frame(name?: string): DetectionResult {
  return {
    model_used: "face_detector",
    faces: [
      {
        bbox: { x: 0, y: 0, width: 100, height: 100 },
        confidence: 0.99,
        track_id: 1,
        landmarks_5: [],
        recognition: {
          success: true,
          person_id: "one",
          name,
          similarity: 0.99,
          processing_time: 0,
          error: null,
        },
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAttendanceStore.setState({
    currentGroup: group("A"),
    attendanceGroups: [group("A"), group("B")],
    groupMembers: [],
    recentAttendance: [],
    isShellReady: false,
    isPanelLoading: false,
    isPanelSwitchPending: false,
    isPanelRefreshing: false,
    panelDataError: null,
  })
  useDetectionStore.getState().resetDetectionState()
  useGroupStore.setState({ selectedGroup: group("A"), members: [], loading: false })
  manager.getGroups.mockResolvedValue([group("A"), group("B")])
  manager.getGroupMembers.mockResolvedValue([])
  manager.getRecords.mockResolvedValue([])
  manager.getGroupStats.mockResolvedValue({})
})

it("updates cached recognition metadata when the same group's member profiles refresh", async () => {
  manager.getMember.mockResolvedValue(member("A", "Old Name"))
  const { result } = renderHook(useRecognitionWithGroups)
  await act(async () => {
    await result.current.recognition.performFaceRecognition(frame())
  })
  expect(useDetectionStore.getState().currentRecognitionResults.get(1)?.name).toBe("Old Name")

  manager.getGroupMembers.mockResolvedValue([member("A", "New Name")])
  await act(async () => {
    await result.current.groups.loadAttendanceData()
  })
  await act(async () => {
    await result.current.recognition.performFaceRecognition(frame())
  })

  expect(useAttendanceStore.getState().groupMembers[0].name).toBe("New Name")
  expect(useDetectionStore.getState().currentRecognitionResults.get(1)?.name).toBe("New Name")
  expect(manager.getMember).toHaveBeenCalledTimes(1)
})

it("uses the server's current recognition name over previously cached metadata", async () => {
  manager.getMember.mockResolvedValue(member("A", "Old Name"))
  const { result } = renderHook(useRecognitionWithGroups)
  await act(async () => {
    await result.current.recognition.performFaceRecognition(frame("Old Name"))
  })
  await act(async () => {
    await result.current.recognition.performFaceRecognition(frame("New Name"))
  })
  expect(useDetectionStore.getState().currentRecognitionResults.get(1)?.name).toBe("New Name")
})

it("does not let a late panel response overwrite the selected group's members", async () => {
  const older = deferred<AttendanceMember[]>()
  const membersB = [member("B", "B Member")]
  manager.getGroupMembers.mockImplementation((id: string) =>
    id === "A" ? older.promise : Promise.resolve(membersB),
  )
  const { result } = renderHook(useAttendanceGroups)
  let loadingA!: Promise<void>
  act(() => {
    loadingA = result.current.handleSelectGroup(group("A"))
  })
  await act(async () => {
    useGroupStore.getState().setSelectedGroup(group("B"))
    await result.current.handleSelectGroup(group("B"))
  })
  await act(async () => {
    older.resolve([member("A", "A Member")])
    await loadingA
  })
  expect(useAttendanceStore.getState().currentGroup?.id).toBe("B")
  expect(useAttendanceStore.getState().groupMembers).toEqual(membersB)
  expect(useGroupStore.getState().members).toEqual(membersB)
  expect(result.current.memberCacheRef.current.get("one")?.name).toBe("B Member")
})

it("does not restore an old selection when a background group-list refresh completes", async () => {
  const older = deferred<AttendanceGroup[]>()
  manager.getGroups.mockReturnValueOnce(older.promise)
  manager.getGroupMembers.mockResolvedValue([member("B", "B Member")])
  const { result } = renderHook(useAttendanceGroups)
  let refreshing!: Promise<void>
  act(() => {
    refreshing = result.current.loadAttendanceData()
  })
  await act(async () => {
    await result.current.handleSelectGroup(group("B"))
  })
  await act(async () => {
    older.resolve([group("A"), group("B")])
    await refreshing
  })
  expect(useAttendanceStore.getState().currentGroup?.id).toBe("B")
  expect(useAttendanceStore.getState().groupMembers[0].group_id).toBe("B")
})

it("keeps confirmed members after a failed refresh and across its retry", async () => {
  const known = [member("A", "Saved member")]
  const records = [createAttendanceRecord({ group_id: "A", person_id: "one" })]
  manager.getGroupMembers.mockResolvedValue(known)
  manager.getRecords.mockResolvedValue(records)
  const { result } = renderHook(useAttendanceGroups)
  await act(async () => {
    await result.current.loadAttendanceData()
  })
  manager.getGroupMembers.mockRejectedValueOnce(new Error("HTTP 503"))
  await act(async () => {
    await result.current.loadAttendanceData()
  })
  expect(useAttendanceStore.getState().panelDataError).toBeTruthy()
  expect(useAttendanceStore.getState().groupMembers).toEqual(known)
  expect(useAttendanceStore.getState().recentAttendance).toEqual(records)
  const pending = deferred<AttendanceMember[]>()
  manager.getGroupMembers.mockReturnValue(pending.promise)
  let retry!: Promise<void>
  await act(async () => {
    retry = result.current.loadAttendanceData()
    await Promise.resolve()
  })
  expect(useAttendanceStore.getState().isPanelRefreshing).toBe(true)
  expect(useAttendanceStore.getState().isPanelLoading).toBe(false)
  expect(useAttendanceStore.getState().groupMembers).toEqual(known)
  await act(async () => {
    pending.resolve(known)
    await retry
  })
  expect(useAttendanceStore.getState().panelDataError).toBeNull()
})

it("keeps previously loaded attendance after the record endpoint fails", async () => {
  const known = [member("A", "Saved member")]
  const records = [createAttendanceRecord({ group_id: "A", person_id: "one" })]
  manager.getGroupMembers.mockResolvedValue(known)
  manager.getRecords.mockResolvedValue(records)
  const { result } = renderHook(useAttendanceGroups)
  await act(async () => {
    await result.current.loadAttendanceData()
  })
  manager.getRecords.mockRejectedValueOnce(new Error("HTTP 503"))
  await act(async () => {
    await result.current.loadAttendanceData()
  })
  expect(useAttendanceStore.getState().panelDataError).toBeTruthy()
  expect(useAttendanceStore.getState().groupMembers).toEqual(known)
  expect(useAttendanceStore.getState().recentAttendance).toEqual(records)
})

it("keeps the selection and loaded members when group-list refresh fails", async () => {
  const known = [member("A", "Saved member")]
  useAttendanceStore.setState({ groupMembers: known })
  manager.getGroups.mockRejectedValueOnce(new Error("HTTP 503"))
  const { result } = renderHook(useAttendanceGroups)
  await act(async () => {
    await result.current.loadAttendanceData()
  })
  expect(useAttendanceStore.getState().currentGroup?.id).toBe("A")
  expect(useAttendanceStore.getState().groupMembers).toEqual(known)
  expect(useAttendanceStore.getState().panelDataError).toBeTruthy()
})

it.each(["group list", "member data"])(
  "ignores a stale failed %s refresh after a newer refresh succeeds",
  async (phase) => {
    const oldGroups = deferred<AttendanceGroup[]>()
    const oldMembers = deferred<AttendanceMember[]>()
    if (phase === "group list") manager.getGroups.mockReturnValueOnce(oldGroups.promise)
    const known = [member("A", "Current member")]
    manager.getGroupMembers.mockResolvedValue(known)
    if (phase === "member data") manager.getGroupMembers.mockReturnValueOnce(oldMembers.promise)
    const { result } = renderHook(useAttendanceGroups)
    let older!: Promise<void>
    await act(async () => {
      older = result.current.loadAttendanceData()
      await Promise.resolve()
    })
    await act(async () => {
      await result.current.loadAttendanceData()
    })
    expect(useAttendanceStore.getState().groupMembers).toEqual(known)
    await act(async () => {
      if (phase === "group list") oldGroups.reject(new Error("Old HTTP 503"))
      else oldMembers.reject(new Error("Old HTTP 503"))
      await older
    })
    expect(useAttendanceStore.getState().panelDataError).toBeNull()
    expect(useAttendanceStore.getState().groupMembers).toEqual(known)
  },
)
