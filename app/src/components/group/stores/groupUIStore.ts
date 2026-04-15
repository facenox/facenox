import { create } from "zustand"
import type { AttendanceMember } from "@/types/recognition"
import type { GroupSection } from "@/components/group/types"
import { persistentSettings } from "@/services/PersistentSettingsService"

interface GroupUIState {
  // Navigation
  activeSection: GroupSection

  // Sidebar state
  isSidebarCollapsed: boolean
  isMobileDrawerOpen: boolean

  // Modal states
  showAddMemberModal: boolean
  showEditMemberModal: boolean
  showCreateGroupModal: boolean
  showEditGroupModal: boolean

  // Modal data
  editingMember: AttendanceMember | null
  preSelectedMemberId: string | null
  lastRegistrationSource: "upload" | "camera" | null
  lastRegistrationMode: "single" | "bulk" | "queue" | null

  // Actions - Navigation
  setActiveSection: (section: GroupSection) => void

  // Actions - Sidebar
  setIsSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setIsMobileDrawerOpen: (open: boolean) => void

  // Actions - Modals
  openAddMember: () => void
  closeAddMember: () => void
  openAddMemberWithNavigation: () => void // Navigate to members section and open modal
  openEditMember: (member: AttendanceMember) => void
  closeEditMember: () => void
  openCreateGroup: () => void
  closeCreateGroup: () => void
  openEditGroup: () => void
  closeEditGroup: () => void

  // Audit 5.0 Deep Linking
  jumpToRegistration: (memberId: string, source?: "upload" | "camera") => void
  setRegistrationState: (
    source: "upload" | "camera" | null,
    mode: "single" | "bulk" | "queue" | null,
  ) => void
  handleRegistrationBack: () => void
  resetRegistration: () => void
}

const initialState = {
  activeSection: "overview" as GroupSection,
  isSidebarCollapsed: false, // Will be loaded from store
  isMobileDrawerOpen: false,
  showAddMemberModal: false,
  showEditMemberModal: false,
  showCreateGroupModal: false,
  showEditGroupModal: false,
  editingMember: null as AttendanceMember | null,
  preSelectedMemberId: null as string | null,
  lastRegistrationSource: null as "upload" | "camera" | null,
  lastRegistrationMode: null as "single" | "bulk" | "queue" | null,
}

const MODAL_EXIT_DURATION_MS = 260
let editMemberClearTimer: ReturnType<typeof setTimeout> | null = null

export const useGroupUIStore = create<GroupUIState>((set, get) => ({
  ...initialState,

  // Navigation - only update if section actually changed
  setActiveSection: (section) => {
    const current = get().activeSection
    if (current !== section) {
      set({ activeSection: section })
      persistentSettings.setUIState({ activeGroupSection: section }).catch(console.error)
    }
  },

  // Sidebar
  setIsSidebarCollapsed: (collapsed) => {
    set({ isSidebarCollapsed: collapsed })
    persistentSettings.setUIState({ groupSidebarCollapsed: collapsed }).catch(console.error)
  },

  toggleSidebar: () => {
    const newValue = !get().isSidebarCollapsed
    set({ isSidebarCollapsed: newValue })
    persistentSettings.setUIState({ groupSidebarCollapsed: newValue }).catch(console.error)
  },

  setIsMobileDrawerOpen: (open) => set({ isMobileDrawerOpen: open }),

  // Modals
  openAddMember: () => set({ showAddMemberModal: true }),
  closeAddMember: () => set({ showAddMemberModal: false }),
  openAddMemberWithNavigation: () => {
    set({ showAddMemberModal: true })
  },

  openEditMember: (member) => set({ editingMember: member, showEditMemberModal: true }),
  closeEditMember: () => {
    if (editMemberClearTimer) {
      clearTimeout(editMemberClearTimer)
    }
    set({ showEditMemberModal: false })
    editMemberClearTimer = setTimeout(() => {
      set({ editingMember: null })
      editMemberClearTimer = null
    }, MODAL_EXIT_DURATION_MS)
  },

  openCreateGroup: () => set({ showCreateGroupModal: true }),
  closeCreateGroup: () => set({ showCreateGroupModal: false }),

  openEditGroup: () => set({ showEditGroupModal: true }),
  closeEditGroup: () => set({ showEditGroupModal: false }),

  reset: () => set(initialState),

  jumpToRegistration: (memberId: string, source: "upload" | "camera" = "camera") => {
    set({
      activeSection: "registration",
      preSelectedMemberId: memberId,
      lastRegistrationSource: source,
      lastRegistrationMode: "single",
    })
  },

  setRegistrationState: (source, mode) => {
    set({
      lastRegistrationSource: source,
      lastRegistrationMode: mode,
    })
    persistentSettings
      .setUIState({
        lastRegistrationSource: source,
        lastRegistrationMode: mode,
      })
      .catch(console.error)
  },

  handleRegistrationBack: () => {
    const { lastRegistrationSource, lastRegistrationMode } = get()
    if (lastRegistrationMode) {
      get().setRegistrationState(lastRegistrationSource, null)
    } else if (lastRegistrationSource) {
      get().setRegistrationState(null, null)
    }
    set({ preSelectedMemberId: null })
  },

  resetRegistration: () => {
    get().setRegistrationState(null, null)
    set({ preSelectedMemberId: null })
  },
}))

// Load sidebar state from store on initialization
if (typeof window !== "undefined") {
  persistentSettings.getUIState().then((uiState) => {
    useGroupUIStore.setState({
      isSidebarCollapsed: uiState.groupSidebarCollapsed,
      activeSection: (uiState.activeGroupSection as GroupSection) || "overview",
      lastRegistrationSource: uiState.lastRegistrationSource as "upload" | "camera" | null,
      lastRegistrationMode: uiState.lastRegistrationMode as "single" | "bulk" | "queue" | null,
    })
  })
}
