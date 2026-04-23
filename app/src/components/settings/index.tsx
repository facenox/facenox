import React from "react"
import { motion } from "framer-motion"
import { useSettings } from "./hooks/useSettings"
import { Sidebar } from "./Sidebar"
import { ContentPanel } from "./ContentPanel"
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
}

export const Settings = React.forwardRef<HTMLDivElement, SettingsProps>((props, ref) => {
  const settings = useSettings({
    ...props,
    initialGroups: props.initialGroups || [],
    currentGroupMembers: props.currentGroupMembers || [],
    currentGroup: props.currentGroup || null,
  })

  const groupSections: {
    id: GroupSection
    label: string
    icon: string
  }[] = [
    { id: "overview", label: "Overview", icon: "fa-solid fa-chart-line" },
    { id: "reports", label: "Reports", icon: "fa-solid fa-chart-bar" },
    { id: "members", label: "Members", icon: "fa-solid fa-users" },
  ]

  const sections = [
    { id: "attendance", label: "Attendance", icon: "fa-solid fa-user-check" },
    { id: "display", label: "Display", icon: "fa-solid fa-desktop" },
    { id: "notifications", label: "Notifications", icon: "fa-solid fa-bell" },
    { id: "database", label: "Database", icon: "fa-solid fa-database" },
    { id: "remote-sync", label: "Remote Sync", icon: "fa-solid fa-rotate" },
    { id: "about", label: "About", icon: "fa-solid fa-circle-info" },
  ]

  const mainContent = (
    <div className="flex h-full bg-[var(--bg-secondary)] text-white">
      <Sidebar
        activeSection={settings.activeSection}
        setActiveSection={settings.setActiveSection}
        groupInitialSection={settings.groupInitialSection}
        setGroupInitialSection={settings.setGroupInitialSection}
        dropdownGroups={settings.dropdownGroups}
        dropdownValue={settings.dropdownValue}
        onGroupSelect={props.onGroupSelect}
        setTriggerCreateGroup={settings.setTriggerCreateGroup}
        setRegistrationState={settings.setRegistrationState}
        sections={sections}
        groupSections={groupSections}
      />

      <ContentPanel
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
        attendanceSettings={props.attendanceSettings}
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
        style={{ willChange: "opacity" }}
        className="fixed inset-0 z-60 flex items-center justify-center bg-[rgba(5,7,10,0.76)] [@media(max-height:760px)_and_(max-width:1100px)]:inset-x-0 [@media(max-height:760px)_and_(max-width:1100px)]:top-[32px] [@media(max-height:760px)_and_(max-width:1100px)]:bottom-0 [@media(max-height:760px)_and_(max-width:1100px)]:items-stretch">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{
            duration: SETTINGS_PANEL_ANIMATION_DURATION,
            ease: [0.16, 1, 0.3, 1], // Custom "snappy" cubic-bezier
          }}
          style={{ willChange: "transform, opacity" }}
          className="relative mt-6 w-full max-w-full overflow-hidden rounded-xl border border-white/6 bg-[var(--bg-secondary)] md:h-[92vh] lg:h-[90vh] lg:max-w-[96%] [@media(max-height:760px)_and_(max-width:1100px)]:mt-0 [@media(max-height:760px)_and_(max-width:1100px)]:h-full [@media(max-height:760px)_and_(max-width:1100px)]:max-w-full [@media(max-height:760px)_and_(max-width:1100px)]:rounded-none [@media(max-height:760px)_and_(max-width:1100px)]:border-0">
          <button
            onClick={props.onBack}
            className="absolute top-2 right-2 z-50 border-none bg-transparent p-1.5 text-white/20 shadow-none transition-all duration-200 hover:text-white"
            aria-label="Close Settings">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
          {mainContent}
        </motion.div>
      </motion.div>
    )
  }

  return mainContent
})

Settings.displayName = "Settings"
