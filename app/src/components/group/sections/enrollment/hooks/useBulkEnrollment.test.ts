import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useBulkEnrollment } from "./useBulkEnrollment"
import { attendanceManager } from "@/services/AttendanceManager"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

vi.mock("@/services/AttendanceManager", () => ({
  attendanceManager: {
    bulkDetectFaces: vi.fn(),
    bulkEnrollFaces: vi.fn(),
    addMember: vi.fn(),
  },
}))

vi.mock("@/utils/imageHelpers", () => ({
  makeId: () => "mock-face-id-1",
  readFileAsDataUrl: () => Promise.resolve("data:image/jpeg;base64,mock"),
}))

const mockGroup: AttendanceGroup = {
  id: "group-1",
  name: "Class 10-A",
  created_at: new Date("2026-10-08T00:00:00Z"),
  is_active: true,
  settings: {},
}

const mockMembers: AttendanceMember[] = [
  {
    id: "mem-1",
    person_id: "person-juan",
    name: "Juan Dela Cruz",
    role: "Student",
    group_id: "group-1",
    joined_at: new Date("2026-10-08T00:00:00Z"),
    is_active: true,
  },
]
describe("useBulkEnrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    class MockImage {
      _src = ""
      onload: (() => void) | null = null
      width = 100
      height = 100
      set src(val: string) {
        this._src = val
        setTimeout(() => this.onload?.(), 0)
      }
      get src() {
        return this._src
      }
    }
    // @ts-expect-error Mocking Image for JSDOM
    global.Image = MockImage
  })

  it("auto-matches filename with existing member if name matches", async () => {
    const file = new File(["test"], "Juan_Dela_Cruz.jpg", { type: "image/jpeg" })

    vi.mocked(attendanceManager.bulkDetectFaces).mockResolvedValueOnce({
      success: true,
      group_id: "group-1",
      total_images: 1,
      results: [
        {
          image_id: "image_0",
          success: true,
          faces: [
            {
              bbox: [10, 10, 100, 100],
              confidence: 0.98,
              landmarks_5: [[10, 10]],
              quality_score: 95,
              is_acceptable: true,
              suggestions: [],
            },
          ],
        },
      ],
    })

    const { result } = renderHook(() => useBulkEnrollment(mockGroup, mockMembers))

    await act(async () => {
      const fileList = {
        0: file,
        length: 1,
        item: () => file,
      } as unknown as FileList

      await result.current.handleFilesSelected(fileList)
    })

    expect(result.current.detectedFaces.length).toBe(1)
    const detected = result.current.detectedFaces[0]
    expect(detected?.assignedPersonId).toBe("person-juan")
    expect(detected?.isAutoMatched).toBe(true)
    expect(detected?.isNewMember).toBe(false)
  })

  it("marks face as isNewMember if filename has no existing member match", async () => {
    const file = new File(["test"], "Maria_Santos.jpg", { type: "image/jpeg" })

    vi.mocked(attendanceManager.bulkDetectFaces).mockResolvedValueOnce({
      success: true,
      group_id: "group-1",
      total_images: 1,
      results: [
        {
          image_id: "image_0",
          success: true,
          faces: [
            {
              bbox: [10, 10, 100, 100],
              confidence: 0.95,
              landmarks_5: [[10, 10]],
              quality_score: 90,
              is_acceptable: true,
              suggestions: [],
            },
          ],
        },
      ],
    })

    const { result } = renderHook(() => useBulkEnrollment(mockGroup, mockMembers))

    await act(async () => {
      const fileList = {
        0: file,
        length: 1,
        item: () => file,
      } as unknown as FileList

      await result.current.handleFilesSelected(fileList)
    })

    expect(result.current.detectedFaces.length).toBe(1)
    const detected = result.current.detectedFaces[0]
    expect(detected?.assignedPersonId).toBeNull()
    expect(detected?.isNewMember).toBe(true)
    expect(detected?.customMemberName).toBe("Maria Santos")
  })
})
