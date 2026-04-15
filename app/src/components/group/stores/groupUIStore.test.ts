import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockPersistentSettings = {
  getUIState: vi.fn(),
  setUIState: vi.fn().mockResolvedValue(undefined),
}

vi.mock("@/services/PersistentSettingsService", () => ({
  persistentSettings: mockPersistentSettings,
}))

async function loadStore() {
  vi.resetModules()
  const module = await import("@/components/group/stores/groupUIStore")
  return module.useGroupUIStore
}

describe("groupUIStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPersistentSettings.getUIState.mockResolvedValue({
      groupSidebarCollapsed: false,
      activeGroupSection: "overview",
      lastRegistrationSource: null,
      lastRegistrationMode: null,
    })
  })

  it("persists active section changes only when the section changes", async () => {
    const useGroupUIStore = await loadStore()
    await waitFor(() => expect(useGroupUIStore.getState().activeSection).toBe("overview"))

    useGroupUIStore.getState().setActiveSection("members")
    useGroupUIStore.getState().setActiveSection("members")

    await waitFor(() => {
      expect(mockPersistentSettings.setUIState).toHaveBeenCalledTimes(1)
      expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
        activeGroupSection: "members",
      })
    })
  })

  it("persists sidebar collapse state through both setter and toggle", async () => {
    const useGroupUIStore = await loadStore()

    useGroupUIStore.getState().setIsSidebarCollapsed(true)
    useGroupUIStore.getState().toggleSidebar()

    await waitFor(() => {
      expect(mockPersistentSettings.setUIState).toHaveBeenNthCalledWith(1, {
        groupSidebarCollapsed: true,
      })
      expect(mockPersistentSettings.setUIState).toHaveBeenNthCalledWith(2, {
        groupSidebarCollapsed: false,
      })
    })
  })

  it("supports registration deep-linking and back navigation", async () => {
    const useGroupUIStore = await loadStore()

    useGroupUIStore.getState().jumpToRegistration("member-1", "upload")
    expect(useGroupUIStore.getState()).toMatchObject({
      activeSection: "registration",
      preSelectedMemberId: "member-1",
      lastRegistrationSource: "upload",
      lastRegistrationMode: "single",
    })

    useGroupUIStore.getState().handleRegistrationBack()

    await waitFor(() => {
      expect(useGroupUIStore.getState().preSelectedMemberId).toBeNull()
      expect(useGroupUIStore.getState().lastRegistrationMode).toBeNull()
      expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
        lastRegistrationSource: "upload",
        lastRegistrationMode: null,
      })
    })

    useGroupUIStore.getState().handleRegistrationBack()

    await waitFor(() => {
      expect(useGroupUIStore.getState().lastRegistrationSource).toBeNull()
      expect(mockPersistentSettings.setUIState).toHaveBeenCalledWith({
        lastRegistrationSource: null,
        lastRegistrationMode: null,
      })
    })
  })

  it("opens and closes member edit state correctly", async () => {
    vi.useFakeTimers()
    const useGroupUIStore = await loadStore()
    const member = {
      person_id: "member-1",
      group_id: "group-1",
      name: "Alice",
      joined_at: new Date(),
      is_active: true,
      has_consent: true,
    }

    useGroupUIStore.getState().openEditMember(member)
    expect(useGroupUIStore.getState().editingMember).toEqual(member)
    expect(useGroupUIStore.getState().showEditMemberModal).toBe(true)

    useGroupUIStore.getState().closeEditMember()
    expect(useGroupUIStore.getState().showEditMemberModal).toBe(false)
    expect(useGroupUIStore.getState().editingMember).toEqual(member)

    vi.advanceTimersByTime(260)
    expect(useGroupUIStore.getState().editingMember).toBeNull()
    vi.useRealTimers()
  })
})
