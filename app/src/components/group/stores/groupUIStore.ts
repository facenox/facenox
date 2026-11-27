import { create } from 'zustand'
import type { AttendanceMember } from '@/types/recognition'
import type { GroupSection } from '@/components/group/types'
import { persistentSettings } from '@/services/PersistentSettingsService'

interface GroupUIState {
  // Navigation
  activeSection: GroupSection

  // Sidebar state
  isSidebarCollapsed: boolean

  // Modal states
  showAddMemberModal: boolean
  addMemberInitialMode: 'single' | 'bulk'
  showEditMemberModal: boolean
  showCreateGroupModal: boolean
  showEditGroupModal: boolean

  // Modal data
  editingMember: AttendanceMember | null
  preSelectedMemberId: string | null
  lastEnrollmentSource: 'upload' | 'camera' | null
  lastEnrollmentMode: 'single' | 'bulk' | 'queue' | null

  // Actions - Navigation
  setActiveSection: (section: GroupSection) => void

  // Actions - Sidebar
  setIsSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void

  // Actions - Modals
  openAddMember: (initialMode?: 'single' | 'bulk') => void
  closeAddMember: () => void
  openAddMemberWithNavigation: () => void // Navigate to members section and open modal
  openEditMember: (member: AttendanceMember) => void
  closeEditMember: () => void
  openCreateGroup: () => void
  closeCreateGroup: () => void
  openEditGroup: () => void
  closeEditGroup: () => void

  // Audit 5.0 Deep Linking
  jumpToEnrollment: (memberId: string, source?: 'upload' | 'camera') => void
  setEnrollmentState: (source: 'upload' | 'camera' | null, mode: 'single' | 'bulk' | 'queue' | null) => void
  handleEnrollmentBack: () => void
  resetEnrollment: () => void
}

const initialState = {
  activeSection: 'overview' as GroupSection,
  isSidebarCollapsed: false, // Will be loaded from store
  showAddMemberModal: false,
  addMemberInitialMode: 'single' as 'single' | 'bulk',
  showEditMemberModal: false,
  showCreateGroupModal: false,
  showEditGroupModal: false,
  editingMember: null as AttendanceMember | null,
  preSelectedMemberId: null as string | null,
  lastEnrollmentSource: null as 'upload' | 'camera' | null,
  lastEnrollmentMode: null as 'single' | 'bulk' | 'queue' | null
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

  // Modals
  openAddMember: (initialMode = 'single') => set({ showAddMemberModal: true, addMemberInitialMode: initialMode }),
  closeAddMember: () => set({ showAddMemberModal: false, addMemberInitialMode: 'single' }),
  openAddMemberWithNavigation: () => {
    set({ showAddMemberModal: true, addMemberInitialMode: 'single' })
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

  jumpToEnrollment: (memberId: string, source: 'upload' | 'camera' = 'camera') => {
    set({
      preSelectedMemberId: memberId,
      lastEnrollmentSource: source,
      lastEnrollmentMode: 'single'
    })
  },

  setEnrollmentState: (source, mode) => {
    set({
      lastEnrollmentSource: source,
      lastEnrollmentMode: mode
    })
    persistentSettings
      .setUIState({
        lastEnrollmentSource: source,
        lastEnrollmentMode: mode
      })
      .catch(console.error)
  },

  handleEnrollmentBack: () => {
    const { lastEnrollmentSource, lastEnrollmentMode } = get()
    if (lastEnrollmentMode) {
      get().setEnrollmentState(lastEnrollmentSource, null)
    } else if (lastEnrollmentSource) {
      get().setEnrollmentState(null, null)
    }
    set({ preSelectedMemberId: null })
  },

  resetEnrollment: () => {
    get().setEnrollmentState(null, null)
    set({ preSelectedMemberId: null })
  }
}))

// Load sidebar state from store on initialization
if (typeof window !== 'undefined') {
  persistentSettings.getUIState().then((uiState) => {
    useGroupUIStore.setState({
      isSidebarCollapsed: uiState.groupSidebarCollapsed,
      activeSection: (uiState.activeGroupSection as GroupSection) || 'overview',
      lastEnrollmentSource: uiState.lastEnrollmentSource as 'upload' | 'camera' | null,
      lastEnrollmentMode: uiState.lastEnrollmentMode as 'single' | 'bulk' | 'queue' | null
    })
  })
}
