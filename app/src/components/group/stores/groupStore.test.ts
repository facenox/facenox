import { beforeEach, describe, expect, it, vi } from "vitest"

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

describe("groupStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
          has_consent: true,
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
          has_consent: true,
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
    const members = [
      {
        person_id: "member-1",
        group_id: "group-1",
        name: "Alice",
        joined_at: new Date(),
        is_active: true,
        has_consent: true,
      },
    ]
    mockAttendanceManager.getGroupMembers.mockResolvedValue(members)

    await useGroupStore.getState().fetchGroupDetails("group-1")

    expect(useGroupStore.getState().members).toEqual(members)
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
