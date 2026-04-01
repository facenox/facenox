import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPersistentSettings = {
  setUIState: vi.fn().mockResolvedValue(undefined),
  setAttendanceSettings: vi.fn().mockResolvedValue(undefined),
}

const mockAttendanceManager = {
  updateSettings: vi.fn().mockResolvedValue(undefined),
}

vi.mock("@/services/PersistentSettingsService", () => ({
  persistentSettings: mockPersistentSettings,
}))

vi.mock("@/services/AttendanceManager", () => ({
  attendanceManager: mockAttendanceManager,
}))

async function loadStore() {
  vi.resetModules()
  const module = await import("@/components/main/stores/attendanceStore")
  return module.useAttendanceStore
}

describe("attendanceStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("setCurrentGroup updates state and persists the selected group ID", async () => {
    const useAttendanceStore = await loadStore()
    const group = {
      id: "group-1",
      name: "Morning Class",
      created_at: new Date(),
      is_active: true,
      settings: {},
    }

    useAttendanceStore.getState().setCurrentGroup(group)
    await Promise.resolve()

    expect(useAttendanceStore.getState().currentGroup).toEqual(group)
    expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
      selectedGroupId: "group-1",
    })
  })

  it("setPersistentCooldowns supports direct maps and updater functions", async () => {
    const useAttendanceStore = await loadStore()
    const initialMap = new Map([
      ["alice-group-1", { personId: "alice", startTime: 1, cooldownDurationSeconds: 8 }],
    ])

    useAttendanceStore.getState().setPersistentCooldowns(initialMap)
    expect(useAttendanceStore.getState().persistentCooldowns).toBe(initialMap)

    useAttendanceStore.getState().setPersistentCooldowns((prev) => {
      const next = new Map(prev)
      next.set("bob-group-1", {
        personId: "bob",
        startTime: 2,
        cooldownDurationSeconds: 8,
      })
      return next
    })

    expect(useAttendanceStore.getState().persistentCooldowns.get("bob-group-1")).toEqual({
      personId: "bob",
      startTime: 2,
      cooldownDurationSeconds: 8,
    })
  })

  it("setAttendanceCooldownSeconds persists through persistentSettings", async () => {
    const useAttendanceStore = await loadStore()

    useAttendanceStore.getState().setAttendanceCooldownSeconds(15)
    await Promise.resolve()

    expect(useAttendanceStore.getState().attendanceCooldownSeconds).toBe(15)
    expect(mockPersistentSettings.setAttendanceSettings).toHaveBeenCalledWith({
      attendanceCooldownSeconds: 15,
    })
  })

  it("sends spoof detection and max recognition changes to attendanceManager", async () => {
    const useAttendanceStore = await loadStore()

    useAttendanceStore.getState().setEnableSpoofDetection(false)
    useAttendanceStore.getState().setMaxRecognitionFacesPerFrame(12)
    await Promise.resolve()

    expect(mockAttendanceManager.updateSettings).toHaveBeenNthCalledWith(1, {
      enable_liveness_detection: false,
    })
    expect(mockAttendanceManager.updateSettings).toHaveBeenNthCalledWith(2, {
      max_recognition_faces_per_frame: 12,
    })
  })
})
