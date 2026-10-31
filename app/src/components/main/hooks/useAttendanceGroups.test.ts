import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { useAttendanceGroups } from "./useAttendanceGroups"
import { useFaceRecognition } from "./useFaceRecognition"
import { useAttendanceStore, useDetectionStore } from "@/components/main/stores"
import { useGroupStore } from "@/components/group/stores"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { DetectionResult } from "@/components/main/types"

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
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
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
  useAttendanceStore.setState({ currentGroup: group("A"), isShellReady: false })
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
