import { create } from "zustand"
import type { AudioSettings, QuickSettings } from "@/components/settings"
import type { GroupSection } from "@/components/group"
import { persistentSettings } from "@/services/PersistentSettingsService"

interface UIState {
  // Error state
  error: string | null

  // Success state
  success: string | null

  // Warning state (non-blocking)
  warning: string | null

  // Settings UI
  showSettings: boolean
  groupInitialSection: GroupSection | undefined
  settingsInitialSection: string | undefined
  hasSeenIntro: boolean
  isHydrated: boolean

  // Sidebar state
  sidebarCollapsed: boolean
  sidebarWidth: number

  // Quick settings
  quickSettings: QuickSettings

  // Audio settings
  audioSettings: AudioSettings

  // Actions
  setError: (error: string | null) => void
  setSuccess: (success: string | null) => void
  setWarning: (warning: string | null) => void
  setShowSettings: (show: boolean) => void
  setGroupInitialSection: (section: GroupSection | undefined) => void
  setSettingsInitialSection: (section: string | undefined) => void
  setHasSeenIntro: (seen: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSidebarWidth: (width: number) => void
  setQuickSettings: (settings: QuickSettings | ((prev: QuickSettings) => QuickSettings)) => void
  setAudioSettings: (
    settings: AudioSettings | ((prev: AudioSettings) => AudioSettings) | Partial<AudioSettings>,
  ) => void
  setIsHydrated: (isHydrated: boolean) => void
}

const loadInitialSettings = async () => {
  const [quickSettings, audioSettings, uiState, groups] = await Promise.all([
    persistentSettings.getQuickSettings(),
    persistentSettings.getAudioSettings(),
    persistentSettings.getUIState(),
    import("@/services").then((m) => m.attendanceManager.getGroups().catch(() => [])),
    import("@/services").then((m) => m.attendanceManager.getSettings().catch(() => null)),
  ])

  // Try to set the initial group right away if possible, to avoid the delay in Main
  if (groups && groups.length > 0) {
    const { useAttendanceStore } = await import("@/components/main/stores/attendanceStore")
    const attendanceStore = useAttendanceStore.getState()

    attendanceStore.setAttendanceGroups(groups)

    const savedGroupId = uiState.selectedGroupId
    let groupToSelect =
      savedGroupId ? groups.find((g: { id: string }) => g.id === savedGroupId) : null
    if (!groupToSelect) groupToSelect = groups[0]

    if (groupToSelect) {
      attendanceStore.setCurrentGroup(groupToSelect)
      // We don't block hydration on member fetching, just group selection
      import("@/services").then((m) => {
        Promise.all([
          m.attendanceManager.getGroupMembers(groupToSelect.id),
          m.attendanceManager.getRecords({ group_id: groupToSelect.id, limit: 100 }),
        ])
          .then(([members, records]) => {
            attendanceStore.setGroupMembers(members)
            attendanceStore.setRecentAttendance(records)
          })
          .catch(console.error)
      })
    }
  }

  return {
    quickSettings,
    audioSettings,
    hasSeenIntro: uiState.hasSeenIntro,
    sidebarCollapsed: uiState.sidebarCollapsed,
    sidebarWidth: uiState.sidebarWidth,
  }
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  error: null,
  success: null,
  warning: null,
  showSettings: false,
  groupInitialSection: undefined,
  settingsInitialSection: undefined,
  hasSeenIntro: false, // Default to false
  isHydrated: false, // Wait for hydration before rendering decisions

  sidebarCollapsed: false,
  sidebarWidth: 300,

  quickSettings: {
    cameraMirrored: true,
    showFPS: false,
    showRecognitionNames: true,
    showLandmarks: true,
  },

  audioSettings: {
    recognitionSoundEnabled: true,
    recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
  },

  // Actions
  setError: (error) => set({ error }),
  setSuccess: (success) => set({ success }),
  setWarning: (warning) => set({ warning }),
  setShowSettings: (show) => set({ showSettings: show }),
  setGroupInitialSection: (section) => set({ groupInitialSection: section }),
  setSettingsInitialSection: (section) => set({ settingsInitialSection: section }),

  setHasSeenIntro: (seen) => set({ hasSeenIntro: seen }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setQuickSettings: (settings) => {
    set((state) => ({
      quickSettings: typeof settings === "function" ? settings(state.quickSettings) : settings,
    }))
  },

  setAudioSettings: (settings) => {
    set((state) => ({
      audioSettings:
        typeof settings === "function" ?
          settings(state.audioSettings)
        : { ...state.audioSettings, ...(settings as Partial<AudioSettings>) },
    }))
  },

  setIsHydrated: (isHydrated: boolean) => set({ isHydrated }),
}))

useUIStore.subscribe((state, prevState) => {
  if (!state.isHydrated) return

  if (state.hasSeenIntro !== prevState.hasSeenIntro) {
    persistentSettings.setUIState({ hasSeenIntro: state.hasSeenIntro }).catch(console.error)
  }

  if (state.sidebarCollapsed !== prevState.sidebarCollapsed) {
    persistentSettings.setUIState({ sidebarCollapsed: state.sidebarCollapsed }).catch(console.error)
  }

  if (state.sidebarWidth !== prevState.sidebarWidth) {
    persistentSettings.setUIState({ sidebarWidth: state.sidebarWidth }).catch(console.error)
  }

  if (state.quickSettings !== prevState.quickSettings) {
    persistentSettings.setQuickSettings(state.quickSettings).catch(console.error)
  }

  if (state.audioSettings !== prevState.audioSettings) {
    persistentSettings.setAudioSettings(state.audioSettings).catch(console.error)
  }
})

// Load Settings from store on initialization
if (typeof window !== "undefined") {
  loadInitialSettings().then(
    ({ quickSettings, audioSettings, hasSeenIntro, sidebarCollapsed, sidebarWidth }) => {
      useUIStore.setState({
        quickSettings,
        audioSettings,
        hasSeenIntro,
        sidebarCollapsed: sidebarCollapsed ?? false,
        sidebarWidth: sidebarWidth ?? 300,
        isHydrated: true,
      })
    },
  )
}
