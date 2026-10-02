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

  // Security / Admin Lock
  adminPinEnabled: boolean
  adminPin: string
  isPinPromptOpen: boolean
  pendingSettingsSection: string | undefined
  pendingGroupSection: GroupSection | undefined
  pendingPinCallback: (() => void) | null

  // Settings UI
  showSettings: boolean
  groupInitialSection: GroupSection | undefined
  settingsInitialSection: string | undefined
  lastSettingsSection: string
  lastGroupInitialSection: GroupSection
  lastGroupId: string | null
  hasSeenIntro: boolean
  pendingCloudSetup: boolean
  antiSpoofDetectionInfoDismissed: boolean
  enrollmentInfoDismissed: boolean
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
  requestOpenSettings: (section?: string, groupSection?: GroupSection) => void
  openPinPrompt: (onSuccess: () => void) => void
  closePinPrompt: () => void
  verifyPin: (enteredPin: string) => boolean
  setAdminPinSettings: (settings: { adminPinEnabled?: boolean; adminPin?: string }) => void
  setGroupInitialSection: (section: GroupSection | undefined) => void
  setSettingsInitialSection: (section: string | undefined) => void
  setLastSettingsSection: (section: string) => void
  setLastGroupInitialSection: (section: GroupSection) => void
  setLastGroupId: (id: string | null) => void
  setHasSeenIntro: (seen: boolean) => void
  setPendingCloudSetup: (pending: boolean) => void
  setAntiSpoofDetectionInfoDismissed: (dismissed: boolean) => void
  setEnrollmentInfoDismissed: (dismissed: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSidebarWidth: (width: number) => void
  setQuickSettings: (settings: QuickSettings | ((prev: QuickSettings) => QuickSettings)) => void
  setAudioSettings: (
    settings: AudioSettings | ((prev: AudioSettings) => AudioSettings) | Partial<AudioSettings>,
  ) => void
  setIsHydrated: (isHydrated: boolean) => void
}

const loadInitialSettings = async () => {
  const [quickSettings, audioSettings, uiState, security] = await Promise.all([
    persistentSettings.getQuickSettings(),
    persistentSettings.getAudioSettings(),
    persistentSettings.getUIState(),
    persistentSettings.getSecuritySettings(),
  ])

  return {
    quickSettings,
    audioSettings,
    adminPinEnabled: security.adminPinEnabled ?? false,
    adminPin: security.adminPin ?? "1234",
    hasSeenIntro: uiState.hasSeenIntro,
    pendingCloudSetup: uiState.pendingCloudSetup,
    antiSpoofDetectionInfoDismissed: uiState.antiSpoofDetectionInfoDismissed,
    enrollmentInfoDismissed: uiState.enrollmentInfoDismissed,
    sidebarCollapsed: uiState.sidebarCollapsed,
    sidebarWidth: uiState.sidebarWidth,
  }
}

let errorTimer: NodeJS.Timeout | null = null
let successTimer: NodeJS.Timeout | null = null
let warningTimer: NodeJS.Timeout | null = null

export const useUIStore = create<UIState>((set, get) => ({
  // Initial state
  error: null,
  success: null,
  warning: null,

  adminPinEnabled: false,
  adminPin: "1234",
  isPinPromptOpen: false,
  pendingSettingsSection: undefined,
  pendingGroupSection: undefined,
  pendingPinCallback: null,

  showSettings: false,
  groupInitialSection: undefined,
  settingsInitialSection: undefined,
  lastSettingsSection: "group",
  lastGroupInitialSection: "overview" as GroupSection,
  lastGroupId: null,
  hasSeenIntro: false,
  pendingCloudSetup: false, // Set when user picks "Connect to Cloud" during intro
  antiSpoofDetectionInfoDismissed: false,
  enrollmentInfoDismissed: false,
  isHydrated: false, // Wait for hydration before rendering decisions

  sidebarCollapsed: false,
  sidebarWidth: 300,

  quickSettings: {
    cameraMirrored: true,
    showRecognitionNames: true,
  },

  audioSettings: {
    recognitionSoundEnabled: true,
    recognitionSoundUrl: "./assets/sounds/Recognition_Success.wav",
  },

  // Actions
  setError: (error) => {
    set({ error })
    if (errorTimer) clearTimeout(errorTimer)
    if (error) {
      errorTimer = setTimeout(() => set({ error: null }), 4500)
    }
  },
  setSuccess: (success) => {
    set({ success })
    if (successTimer) clearTimeout(successTimer)
    if (success) {
      successTimer = setTimeout(() => set({ success: null }), 4500)
    }
  },
  setWarning: (warning) => {
    set({ warning })
    if (warningTimer) clearTimeout(warningTimer)
    if (warning) {
      warningTimer = setTimeout(() => set({ warning: null }), 4500)
    }
  },
  setShowSettings: (show) => set({ showSettings: show }),

  requestOpenSettings: (section, groupSection) => {
    const { adminPinEnabled } = get()
    if (adminPinEnabled) {
      set({
        isPinPromptOpen: true,
        pendingSettingsSection: section || (groupSection ? "group" : undefined),
        pendingGroupSection: groupSection,
        pendingPinCallback: null,
      })
    } else {
      set({
        settingsInitialSection: section || (groupSection ? "group" : undefined),
        groupInitialSection: groupSection,
        showSettings: true,
      })
    }
  },

  openPinPrompt: (onSuccess) => {
    const { adminPinEnabled } = get()
    if (adminPinEnabled) {
      set({
        isPinPromptOpen: true,
        pendingPinCallback: onSuccess,
        pendingSettingsSection: undefined,
        pendingGroupSection: undefined,
      })
    } else {
      onSuccess()
    }
  },

  closePinPrompt: () => {
    set({
      isPinPromptOpen: false,
      pendingSettingsSection: undefined,
      pendingGroupSection: undefined,
      pendingPinCallback: null,
    })
  },

  verifyPin: (enteredPin: string) => {
    const { adminPin, pendingSettingsSection, pendingGroupSection, pendingPinCallback } = get()
    if (enteredPin === adminPin) {
      if (pendingPinCallback) {
        pendingPinCallback()
      } else {
        set({
          settingsInitialSection:
            pendingSettingsSection || (pendingGroupSection ? "group" : undefined),
          groupInitialSection: pendingGroupSection,
          showSettings: true,
        })
      }
      set({
        isPinPromptOpen: false,
        pendingSettingsSection: undefined,
        pendingGroupSection: undefined,
        pendingPinCallback: null,
      })
      return true
    }
    return false
  },

  setAdminPinSettings: (settings) => {
    set((state) => ({
      adminPinEnabled: settings.adminPinEnabled ?? state.adminPinEnabled,
      adminPin: settings.adminPin ?? state.adminPin,
    }))
  },

  setGroupInitialSection: (section) => set({ groupInitialSection: section }),
  setSettingsInitialSection: (section) => set({ settingsInitialSection: section }),
  setLastSettingsSection: (section) => set({ lastSettingsSection: section }),
  setLastGroupInitialSection: (section) => set({ lastGroupInitialSection: section }),
  setLastGroupId: (id) => set({ lastGroupId: id }),

  setHasSeenIntro: (seen) => set({ hasSeenIntro: seen }),
  setPendingCloudSetup: (pending) => set({ pendingCloudSetup: pending }),
  setAntiSpoofDetectionInfoDismissed: (dismissed) =>
    set({ antiSpoofDetectionInfoDismissed: dismissed }),
  setEnrollmentInfoDismissed: (dismissed) => set({ enrollmentInfoDismissed: dismissed }),
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

  if (state.pendingCloudSetup !== prevState.pendingCloudSetup) {
    persistentSettings
      .setUIState({ pendingCloudSetup: state.pendingCloudSetup })
      .catch(console.error)
  }

  if (state.antiSpoofDetectionInfoDismissed !== prevState.antiSpoofDetectionInfoDismissed) {
    persistentSettings
      .setUIState({
        antiSpoofDetectionInfoDismissed: state.antiSpoofDetectionInfoDismissed,
      })
      .catch(console.error)
  }

  if (state.enrollmentInfoDismissed !== prevState.enrollmentInfoDismissed) {
    persistentSettings
      .setUIState({
        enrollmentInfoDismissed: state.enrollmentInfoDismissed,
      })
      .catch(console.error)
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

  if (
    state.adminPinEnabled !== prevState.adminPinEnabled ||
    state.adminPin !== prevState.adminPin
  ) {
    persistentSettings
      .setSecuritySettings({
        adminPinEnabled: state.adminPinEnabled,
        adminPin: state.adminPin,
      })
      .catch(console.error)
  }
})

// Load Settings from store on initialization
if (typeof window !== "undefined") {
  loadInitialSettings()
    .then(
      ({
        quickSettings,
        audioSettings,
        adminPinEnabled,
        adminPin,
        hasSeenIntro,
        pendingCloudSetup,
        antiSpoofDetectionInfoDismissed,
        enrollmentInfoDismissed,
        sidebarCollapsed,
        sidebarWidth,
      }) => {
        useUIStore.setState({
          quickSettings,
          audioSettings,
          adminPinEnabled: adminPinEnabled ?? false,
          adminPin: adminPin ?? "1234",
          hasSeenIntro,
          pendingCloudSetup,
          antiSpoofDetectionInfoDismissed,
          enrollmentInfoDismissed,
          sidebarCollapsed: sidebarCollapsed ?? false,
          sidebarWidth: sidebarWidth ?? 300,
          isHydrated: true,
        })
      },
    )
    .catch(() => {
      useUIStore.setState({ isHydrated: true })
    })
}
