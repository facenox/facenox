import { act, renderHook } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { useFaceRecognition } from "./useFaceRecognition"
import { useDetectionStore } from "@/components/main/stores"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { DetectionResult } from "@/components/main/types"

const { getMember } = vi.hoisted(() => ({ getMember: vi.fn() }))
vi.mock("@/services", () => ({ attendanceManager: { getMember } }))
vi.mock("@/components/main/hooks/useAttendanceGroups", () => ({ ALL_GROUPS_ID: "all" }))
vi.mock("@/services/PersistentSettingsService", () => ({
  persistentSettings: {
    getUIState: vi.fn().mockResolvedValue({}),
  },
}))

function group(id: string): AttendanceGroup {
  return { id, name: id, created_at: new Date(), is_active: true, settings: {} }
}

function member(id: string, groupId: string): AttendanceMember {
  return { person_id: id, group_id: groupId, name: id, joined_at: new Date(), is_active: true }
}

function frame(id: string): DetectionResult {
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
          person_id: id,
          name: id,
          similarity: 0.99,
          processing_time: 0,
          error: null,
        },
      },
    ],
  }
}

function options() {
  return {
    currentGroupRef: { current: group("A") },
    memberCacheRef: { current: new Map<string, AttendanceMember | null>() },
    calculateAngleConsistencyRef: { current: () => 1 },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDetectionStore.getState().resetDetectionState()
})

it.each(["A", "B"])(
  "keeps the newest result when an older lookup finishes in group %s",
  async (newGroup) => {
    const older = deferred<AttendanceMember>()
    getMember.mockReturnValueOnce(older.promise).mockResolvedValueOnce(member("Bob", newGroup))
    const refs = options()
    const { result } = renderHook(() => useFaceRecognition(refs))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.performFaceRecognition(frame("Alice"))
    })
    if (newGroup !== "A") {
      act(() => {
        refs.currentGroupRef.current = group(newGroup)
        refs.memberCacheRef.current = new Map()
        useDetectionStore.getState().resetDetectionState()
      })
    }
    await act(async () => {
      await result.current.performFaceRecognition(frame("Bob"))
    })
    await act(async () => {
      older.resolve(member("Alice", "A"))
      await pending
    })
    expect(useDetectionStore.getState().currentRecognitionResults.get(1)?.person_id).toBe("Bob")
    expect(useDetectionStore.getState().trackedFaces.get("track_1")?.personId).toBe("Bob")
  },
)

it("discards a pending result when the group changes before another frame arrives", async () => {
  const older = deferred<AttendanceMember>()
  getMember.mockReturnValueOnce(older.promise)
  const refs = options()
  const { result } = renderHook(() => useFaceRecognition(refs))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.performFaceRecognition(frame("Alice"))
  })
  refs.currentGroupRef.current = group("B")
  await act(async () => {
    older.resolve(member("Alice", "A"))
    await pending
  })
  expect(useDetectionStore.getState().currentRecognitionResults.size).toBe(0)
  expect(useDetectionStore.getState().trackedFaces.size).toBe(0)
})

it("does not restore a recognized face after a newer empty frame clears it", async () => {
  const older = deferred<AttendanceMember>()
  getMember.mockReturnValueOnce(older.promise)
  const refs = options()
  const { result } = renderHook(() => useFaceRecognition(refs))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.performFaceRecognition(frame("Alice"))
  })
  await act(async () => {
    await result.current.performFaceRecognition({ model_used: "face_detector", faces: [] })
    older.resolve(member("Alice", "A"))
    await pending
  })
  expect(useDetectionStore.getState().currentRecognitionResults.size).toBe(0)
  expect(useDetectionStore.getState().trackedFaces.size).toBe(0)
})

it("discards pending work after member metadata is refreshed", async () => {
  const older = deferred<AttendanceMember>()
  getMember.mockReturnValueOnce(older.promise)
  const refs = options()
  const { result } = renderHook(() => useFaceRecognition(refs))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.performFaceRecognition(frame("Alice"))
  })
  const updated = { ...member("Alice", "A"), name: "Updated Alice" }
  refs.memberCacheRef.current = new Map([["Alice", updated]])
  await act(async () => {
    older.resolve(member("Alice", "A"))
    await pending
  })
  expect(refs.memberCacheRef.current.get("Alice")?.name).toBe("Updated Alice")
  expect(useDetectionStore.getState().currentRecognitionResults.size).toBe(0)
})

it("does not update recognition state after unmount", async () => {
  const older = deferred<AttendanceMember>()
  getMember.mockReturnValueOnce(older.promise)
  const refs = options()
  const { result, unmount } = renderHook(() => useFaceRecognition(refs))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.performFaceRecognition(frame("Alice"))
  })
  unmount()
  await act(async () => {
    older.resolve(member("Alice", "A"))
    await pending
  })
  expect(useDetectionStore.getState().currentRecognitionResults.size).toBe(0)
  expect(useDetectionStore.getState().trackedFaces.size).toBe(0)
})

it("still publishes successful sequential recognition results", async () => {
  getMember.mockImplementation((id: string) => Promise.resolve(member(id, "A")))
  const refs = options()
  const { result } = renderHook(() => useFaceRecognition(refs))
  await act(async () => {
    await result.current.performFaceRecognition(frame("Alice"))
  })
  expect(useDetectionStore.getState().currentRecognitionResults.get(1)?.person_id).toBe("Alice")
  await act(async () => {
    await result.current.performFaceRecognition(frame("Bob"))
  })
  expect(useDetectionStore.getState().currentRecognitionResults.get(1)?.person_id).toBe("Bob")
})
