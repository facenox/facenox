import React from "react"
import { motion } from "framer-motion"
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Clock,
  SlidersHorizontal,
  Monitor,
  Database,
  Cloud,
  Info,
  Layers,
  X,
} from "lucide-react"
import { useSettings } from "./hooks/useSettings"
import { Sidebar } from "./Sidebar"
import { ContentPanel } from "./ContentPanel"
import { useGroupUIStore } from "@/components/group/stores"
import type { QuickSettings, AttendanceSettings, AudioSettings } from "./types"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { GroupSection } from "@/components/group"

export type { QuickSettings, AttendanceSettings }
export type { AudioSettings } from "./types"

const SETTINGS_OVERLAY_ANIMATION_DURATION = 0.15
const SETTINGS_PANEL_ANIMATION_DURATION = 0.18

interface SettingsProps {
  onBack: () => void
  isModal?: boolean
  quickSettings: QuickSettings
  onQuickSettingsChange: (settings: QuickSettings) => void
  audioSettings: AudioSettings
  onAudioSettingsChange: (settings: Partial<AudioSettings>) => void
  attendanceSettings: AttendanceSettings
  onAttendanceSettingsChange: (settings: Partial<AttendanceSettings>) => void
  initialGroupSection?: GroupSection
  currentGroup?: AttendanceGroup | null
  currentGroupMembers?: AttendanceMember[]
  onGroupSelect?: (group: AttendanceGroup) => void
  onGroupsChanged?: () => void
  initialGroups?: AttendanceGroup[]
  initialSection?: string
  streamRef?: React.RefObject<MediaStream | null>
}

export const Settings = React.forwardRef<HTMLDivElement, SettingsProps>((props, ref) => {
  const { isModal, onBack } = props
  const settings = useSettings({
    ...props,
    initialGroups: props.initialGroups || [],
    currentGroupMembers: props.currentGroupMembers || [],
    currentGroup: props.currentGroup || null,
  })

  React.useEffect(() => {
    if (!isModal) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return

      const activeTag = document.activeElement?.tagName
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return

      const groupUIState = useGroupUIStore.getState()
      const isZustandSubModalOpen =
        groupUIState.showAddMemberModal ||
        groupUIState.showEditMemberModal ||
        groupUIState.showCreateGroupModal ||
        groupUIState.showEditGroupModal ||
        !!groupUIState.lastEnrollmentMode

      const isDomSubModalOpen =
        !!document.querySelector(".z-100:not(.pointer-events-none)") ||
        !!document.querySelector('[role="dialog"]')

      if (isZustandSubModalOpen || isDomSubModalOpen || settings.hasSelectedMember) return

      onBack()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isModal, onBack, settings.hasSelectedMember])

  const groupSections = [
    { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
    { id: "reports" as const, label: "Reports", icon: BarChart3 },
    { id: "members" as const, label: "Members", icon: Users },
    { id: "settings" as const, label: "Rules", icon: Clock },
  ]

  const sections = [
    { id: "groups", label: "Groups", icon: Layers },
    { id: "attendance", label: "General", icon: SlidersHorizontal },
    { id: "display", label: "Display & audio", icon: Monitor },
    { id: "database", label: "Data & storage", icon: Database },
    { id: "remote-sync", label: "Cloud sync", icon: Cloud },
    { id: "about", label: "About", icon: Info },
  ]

  const mainContent = (
    <div className="flex h-full w-full min-w-0 bg-[var(--bg-secondary)] text-white">
      <Sidebar
        activeSection={settings.activeSection}
        setActiveSection={settings.setActiveSection}
        groupInitialSection={settings.groupInitialSection}
        setGroupInitialSection={settings.setGroupInitialSection}
        dropdownGroups={settings.dropdownGroups}
        dropdownValue={settings.dropdownValue}
        onGroupSelect={props.onGroupSelect}
        setTriggerCreateGroup={settings.setTriggerCreateGroup}
        setEnrollmentState={settings.setEnrollmentState}
        sections={sections}
        groupSections={groupSections}
      />

      <ContentPanel
        onOpenGroup={(group) => {
          props.onGroupSelect?.(group)
          settings.setActiveSection("group")
          settings.setGroupInitialSection("members")
        }}
        activeSection={settings.activeSection}
        groupInitialSection={settings.groupInitialSection}
        setGroupInitialSection={settings.setGroupInitialSection}
        validInitialGroup={settings.validInitialGroup}
        currentGroupMembers={props.currentGroupMembers || []}
        triggerCreateGroup={settings.triggerCreateGroup}
        deselectMemberTrigger={settings.deselectMemberTrigger}
        setDeselectMemberTrigger={settings.setDeselectMemberTrigger}
        setHasSelectedMember={settings.setHasSelectedMember}
        hasSelectedMember={settings.hasSelectedMember}
        handleExportHandlersReady={settings.handleExportHandlersReady}
        handleAddMemberHandlerReady={settings.handleAddMemberHandlerReady}
        handleGroupsChanged={settings.handleGroupsChanged}
        handleGroupBack={settings.handleGroupBack}
        quickSettings={props.quickSettings}
        toggleQuickSetting={settings.toggleQuickSetting}
        audioSettings={props.audioSettings}
        updateAudioSetting={settings.updateAudioSetting}
        streamRef={props.streamRef}
        attendanceSettings={{
          ...props.attendanceSettings,
          forceLiveness: settings.forceLiveness,
          ...(settings.policyOverrides.trackCheckout !== undefined && {
            trackCheckout: settings.policyOverrides.trackCheckout,
          }),
          ...(settings.policyOverrides.lateThresholdEnabled !== undefined && {
            lateThresholdEnabled: settings.policyOverrides.lateThresholdEnabled,
          }),
          ...(settings.policyOverrides.lateThresholdMinutes !== undefined && {
            lateThresholdMinutes: settings.policyOverrides.lateThresholdMinutes,
          }),
          ...(settings.policyOverrides.attendanceCooldownSeconds !== undefined && {
            attendanceCooldownSeconds: settings.policyOverrides.attendanceCooldownSeconds,
          }),
          cloudRetentionDays: settings.policyOverrides.dataRetentionDays,
        }}
        updateAttendanceSetting={settings.updateAttendanceSetting}
        dropdownValue={settings.dropdownValue}
        systemData={settings.systemData}
        timeHealthState={settings.timeHealthState}
        groups={settings.groups}
        isLoading={settings.isLoading}
        handleClearDatabase={settings.handleClearDatabase}
        loadSystemData={settings.loadSystemData}
        onGroupsChanged={props.onGroupsChanged}
        members={settings.members}
        reportsExportHandlers={settings.reportsExportHandlers}
        addMemberHandler={settings.addMemberHandler}
        dropdownGroups={settings.dropdownGroups}
        groupSections={groupSections}
        setActiveSection={settings.setActiveSection}
      />
    </div>
  )

  if (props.isModal) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: SETTINGS_OVERLAY_ANIMATION_DURATION, ease: "easeOut" }}
        className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs [@media(max-height:760px)_and_(max-width:1100px)]:inset-x-0 [@media(max-height:760px)_and_(max-width:1100px)]:top-[32px] [@media(max-height:760px)_and_(max-width:1100px)]:bottom-0 [@media(max-height:760px)_and_(max-width:1100px)]:items-stretch">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{
            duration: SETTINGS_PANEL_ANIMATION_DURATION,
            ease: [0.16, 1, 0.3, 1], // Custom "snappy" cubic-bezier
          }}
          className="relative mt-6 flex h-[92vh] w-full max-w-[96%] min-w-0 flex-col overflow-hidden rounded-xl border border-white/6 bg-[var(--bg-secondary)] md:h-[92vh] lg:h-[90vh] lg:max-w-[96%] [@media(max-height:760px)_and_(max-width:1100px)]:mt-0 [@media(max-height:760px)_and_(max-width:1100px)]:h-full [@media(max-height:760px)_and_(max-width:1100px)]:max-w-full [@media(max-height:760px)_and_(max-width:1100px)]:rounded-none [@media(max-height:760px)_and_(max-width:1100px)]:border-0">
          <button
            onClick={props.onBack}
            className="absolute top-[14px] right-[14px] z-50 rounded-lg border-none bg-transparent p-1 text-white/35 shadow-none transition-all duration-200 hover:bg-white/[0.06] hover:text-white active:scale-95"
            aria-label="Close settings">
            <X className="size-4" />
          </button>
          {mainContent}
        </motion.div>
      </motion.div>
    )
  }

  return mainContent
})

Settings.displayName = "Settings"
