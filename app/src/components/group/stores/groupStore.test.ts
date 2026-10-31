import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AttendanceMember } from "@/types/recognition"

const mockPersistentSettings = {
  setUIState: vi.fn().mockResolvedValue(undefined),
}

const mockAttendanceManager = {
  getGroups: vi.fn(),
  getGroupMembers: vi.fn(),
  deleteGroup: vi.fn().mockResolvedValue(true),
  exportData: vi.fn().mockResolvedValue('{"ok":true}'),
}

vi.mock("@/services", () => ({
  attendanceManager: mockAttendanceManager,
}))

vi.mock("@/services/PersistentSettingsService", () => ({
  persistentSettings: mockPersistentSettings,
}))

async function loadStore() {
  vi.resetModules()
  const module = await import("@/components/group/stores/groupStore")
  return module.useGroupStore
}

function createGroup(id: string, name: string) {
  return {
    id,
    name,
    created_at: new Date(),
    is_active: true,
    settings: {},
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createMember(groupId: string, name: string): AttendanceMember {
  return { person_id: name, group_id: groupId, name, joined_at: new Date(), is_active: true }
}

describe("groupStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reset uses current attendance state and clears transient group state", async () => {
    const useGroupStore = await loadStore()
    const { useAttendanceStore } = await import("@/components/main/stores/attendanceStore")
    const group = createGroup("current-group", "Current")
    useAttendanceStore.setState({
      currentGroup: group,
      attendanceGroups: [group],
      groupMembers: [],
    })
    useGroupStore.setState({
      selectedGroup: createGroup("stale-group", "Stale"),
      loading: true,
      error: "Previous error",
      lastDeletedGroupId: "stale-group",
      overviewRecords: { stale: { range: [] } },
    })

    expect(() => useGroupStore.getState().reset()).not.toThrow()
    expect(useGroupStore.getState()).toMatchObject({
      selectedGroup: group,
      groups: [group],
      members: [],
      loading: false,
      error: null,
      lastDeletedGroupId: null,
      overviewRecords: {},
      overviewStats: {},
    })
    expect(typeof useGroupStore.getState().fetchGroups).toBe("function")
    expect(mockPersistentSettings.setUIState).not.toHaveBeenCalled()
  })

  it("setSelectedGroup persists the selected group and clears members when unset", async () => {
    const useGroupStore = await loadStore()
    const group = createGroup("group-1", "Morning Class")

    useGroupStore.getState().setSelectedGroup(group)
    await Promise.resolve()

    expect(useGroupStore.getState().selectedGroup).toEqual(group)
    expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
      selectedGroupId: "group-1",
    })

    useGroupStore.setState({
      members: [
        {
          person_id: "member-1",
          group_id: "group-1",
          name: "Alice",
          joined_at: new Date(),
          is_active: true,
        },
      ],
    })

    useGroupStore.getState().setSelectedGroup(null)
    await Promise.resolve()

    expect(useGroupStore.getState().members).toEqual([])
    expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
      selectedGroupId: null,
    })
  })

  it("fetchGroups preserves an existing selected group when it still exists", async () => {
    const useGroupStore = await loadStore()
    const selected = createGroup("group-1", "Morning Class")
    useGroupStore.setState({ selectedGroup: selected })
    mockAttendanceManager.getGroups.mockResolvedValue([
      createGroup("group-1", "Morning Class Updated"),
      createGroup("group-2", "Evening Class"),
    ])

    await useGroupStore.getState().fetchGroups()

    expect(useGroupStore.getState().groups).toHaveLength(2)
    expect(useGroupStore.getState().selectedGroup?.name).toBe("Morning Class Updated")
    expect(useGroupStore.getState().loading).toBe(false)
  })

  it("fetchGroups clears selection when the selected group no longer exists", async () => {
    const useGroupStore = await loadStore()
    useGroupStore.setState({
      selectedGroup: createGroup("group-1", "Morning Class"),
      members: [
        {
          person_id: "member-1",
          group_id: "group-1",
          name: "Alice",
          joined_at: new Date(),
          is_active: true,
        },
      ],
    })
    mockAttendanceManager.getGroups.mockResolvedValue([createGroup("group-2", "Evening Class")])

    await useGroupStore.getState().fetchGroups()

    expect(useGroupStore.getState().selectedGroup).toBeNull()
    expect(useGroupStore.getState().members).toEqual([])
  })

  it("fetchGroupDetails loads members for a group", async () => {
    const useGroupStore = await loadStore()
    useGroupStore.getState().setSelectedGroup(createGroup("group-1", "Morning Class"))
    const members = [
      {
        person_id: "member-1",
        group_id: "group-1",
        name: "Alice",
        joined_at: new Date(),
        is_active: true,
      },
    ]
    mockAttendanceManager.getGroupMembers.mockResolvedValue(members)

    await useGroupStore.getState().fetchGroupDetails("group-1")

    expect(useGroupStore.getState().members).toEqual(members)
  })

  it("ignores a late response from the previously selected group", async () => {
    const store = await loadStore()
    const older = deferred<AttendanceMember[]>()
    const membersB = [createMember("group-b", "B Member")]
    mockAttendanceManager.getGroupMembers
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(membersB)

    store.getState().setSelectedGroup(createGroup("group-a", "A"))
    const loadingA = store.getState().fetchGroupDetails("group-a")
    store.getState().setSelectedGroup(createGroup("group-b", "B"))
    await store.getState().fetchGroupDetails("group-b")
    older.resolve([createMember("group-a", "A Member")])
    await loadingA

    expect(store.getState().selectedGroup?.id).toBe("group-b")
    expect(store.getState().members).toEqual(membersB)
    expect(store.getState().loading).toBe(false)
  })

  it("does not show an older request's error or stop the current loading state", async () => {
    const store = await loadStore()
    const older = deferred<AttendanceMember[]>()
    const latest = deferred<AttendanceMember[]>()
    mockAttendanceManager.getGroupMembers
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise)
    store.getState().setSelectedGroup(createGroup("group-a", "A"))
    const loadingA = store.getState().fetchGroupDetails("group-a")
    store.getState().setSelectedGroup(createGroup("group-b", "B"))
    const loadingB = store.getState().fetchGroupDetails("group-b")
    older.reject(new Error("Old request failed"))
    await loadingA

    expect(store.getState().error).toBeNull()
    expect(store.getState().loading).toBe(true)
    latest.resolve([createMember("group-b", "B Member")])
    await loadingB
    expect(store.getState().loading).toBe(false)
  })

  it("keeps the latest members when requests for the same group complete out of order", async () => {
    const store = await loadStore()
    const older = deferred<AttendanceMember[]>()
    const latestMembers = [createMember("group-a", "Updated Member")]
    mockAttendanceManager.getGroupMembers
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(latestMembers)
    store.getState().setSelectedGroup(createGroup("group-a", "A"))
    const first = store.getState().fetchGroupDetails("group-a")
    await store.getState().fetchGroupDetails("group-a")
    older.resolve([createMember("group-a", "Old Member")])
    await first
    expect(store.getState().members).toEqual(latestMembers)
  })

  it("deleteGroup dispatches the reset selection event and refreshes groups", async () => {
    const useGroupStore = await loadStore()
    const group = createGroup("group-1", "Morning Class")
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")
    useGroupStore.setState({ selectedGroup: group })
    mockAttendanceManager.getGroups.mockResolvedValue([])

    await useGroupStore.getState().deleteGroup("group-1")

    expect(mockAttendanceManager.deleteGroup).toHaveBeenCalledWith("group-1")
    expect(dispatchSpy).toHaveBeenCalled()
    expect(useGroupStore.getState().selectedGroup).toBeNull()
    expect(useGroupStore.getState().lastDeletedGroupId).toBeNull()
  })

  it("exportData creates and clicks a download link", async () => {
    const useGroupStore = await loadStore()
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test")
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const appendSpy = vi.spyOn(document.body, "appendChild")
    const removeSpy = vi.spyOn(document.body, "removeChild")
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined)

    await useGroupStore.getState().exportData()

    expect(mockAttendanceManager.exportData).toHaveBeenCalled()
    expect(createObjectURLSpy).toHaveBeenCalled()
    expect(anchorClickSpy).toHaveBeenCalled()
    expect(appendSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:test")
  })
})
