import React, { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Display } from "@/components/settings/sections/Display"
import { Notifications } from "@/components/settings/sections/Notifications"
import { Database } from "@/components/settings/sections/Database"
import { Attendance } from "@/components/settings/sections/Attendance"
import { About } from "@/components/settings/sections/About"
import { RemoteSync } from "@/components/settings/sections/RemoteSync"
import { AntiSpoofDetectionModal } from "@/components/settings/AntiSpoofDetectionModal"
import { GroupPanel, type GroupSection } from "@/components/group"
import { SectionHeader } from "./components/SectionHeader"
import { useGroupModals } from "@/components/group/hooks"
import { useGroupUIStore } from "@/components/group/stores"
import { useUIStore } from "@/components/main/stores"
import type {
  QuickSettings,
  AttendanceSettings,
  AudioSettings,
  SettingsOverview,
  TimeHealthOverview,
} from "@/components/settings/types"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

const SETTINGS_SECTION_TRANSITION_DURATION = 0.18

interface ContentPanelProps {
  activeSection: string
  groupInitialSection: GroupSection | undefined
  setGroupInitialSection: (section: GroupSection) => void
  validInitialGroup: AttendanceGroup | null
  currentGroupMembers: AttendanceMember[]
  triggerCreateGroup: number
  deselectMemberTrigger: number
  setDeselectMemberTrigger: (trigger: number) => void
  setHasSelectedMember: (hasSelected: boolean) => void
  handleExportHandlersReady: (handlers: { exportCSV: () => void }) => void
  handleAddMemberHandlerReady: (handler: () => void) => void
  handleGroupsChanged: (newGroup?: AttendanceGroup) => void
  handleGroupBack: () => void
  quickSettings: QuickSettings
  toggleQuickSetting: (key: keyof QuickSettings) => void
  audioSettings: AudioSettings
  updateAudioSetting: (updates: Partial<AudioSettings>) => void
  attendanceSettings: AttendanceSettings
  updateAttendanceSetting: (updates: Partial<AttendanceSettings>) => void
  dropdownValue: string | null
  systemData: SettingsOverview
  timeHealthState: TimeHealthOverview
  groups: AttendanceGroup[]
  isLoading: boolean
  handleClearDatabase: () => void
  loadSystemData: () => void
  onGroupsChanged?: () => void
  members: AttendanceMember[]
  reportsExportHandlers: {
    exportCSV: () => void
  } | null
  addMemberHandler: (() => void) | null
  hasSelectedMember: boolean
  dropdownGroups: AttendanceGroup[]
  groupSections: { id: GroupSection; label: string; icon: string }[]
  setActiveSection: (section: string) => void
}

export const ContentPanel: React.FC<ContentPanelProps> = ({
  activeSection,
  groupInitialSection,
  setGroupInitialSection,
  validInitialGroup,
  currentGroupMembers,
  triggerCreateGroup,
  deselectMemberTrigger,
  setHasSelectedMember,
  handleExportHandlersReady,
  handleAddMemberHandlerReady,
  handleGroupsChanged,
  handleGroupBack,
  quickSettings,
  toggleQuickSetting,
  audioSettings,
  updateAudioSetting,
  attendanceSettings,
  updateAttendanceSetting,
  dropdownValue,
  systemData,
  timeHealthState,
  groups,
  isLoading,
  handleClearDatabase,
  loadSystemData,
  onGroupsChanged,
  members,
  reportsExportHandlers,
  addMemberHandler,
  dropdownGroups,
  groupSections,
  setActiveSection,
}) => {
  const { openEditGroup } = useGroupModals()
  const registrationMode = useGroupUIStore((state) => state.lastRegistrationMode)
  const resetRegistration = useGroupUIStore((state) => state.resetRegistration)
  const antiSpoofDetectionInfoDismissed = useUIStore(
    (state) => state.antiSpoofDetectionInfoDismissed,
  )
  const setAntiSpoofDetectionInfoDismissed = useUIStore(
    (state) => state.setAntiSpoofDetectionInfoDismissed,
  )
  const [isAntiSpoofModalOpen, setIsAntiSpoofModalOpen] = useState(false)
  const [dontShowAntiSpoofInfoAgain, setDontShowAntiSpoofInfoAgain] = useState(false)
  const isGroupSection = activeSection === "group"

  // Dynamic Header Logic
  const headerProps = useMemo(() => {
    const generalTitles: Record<string, string> = {
      attendance: "Attendance",
      display: "Display",
      notifications: "Notifications",
      database: "Database",
      cloudsync: "Remote Sync",
      about: "About",
    }
    if (isGroupSection) {
      const groupName =
        dropdownValue ?
          dropdownGroups.find((g) => g.id === dropdownValue)?.name
        : "Group Management"

      const sectionLabel =
        groupInitialSection ?
          groupSections.find((s) => s.id === groupInitialSection)?.label
        : "Overview"

      // Actions
      let actions: React.ReactNode = null
      if (
        groupInitialSection === "members" &&
        validInitialGroup &&
        addMemberHandler &&
        members.length > 0 &&
        !registrationMode
      ) {
        actions = (
          <button
            onClick={addMemberHandler}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/60 transition-all hover:bg-white/10 hover:text-white">
            <i className="fa-solid fa-user-plus text-[10px]"></i>
            ADD MEMBER
          </button>
        )
      } else if (groupInitialSection === "members" && registrationMode) {
        actions = (
          <button
            onClick={resetRegistration}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/60 transition-all hover:bg-white/10 hover:text-white">
            <i className="fa-solid fa-arrow-left text-[10px]"></i>
            BACK TO MEMBERS
          </button>
        )
      } else if (groupInitialSection === "overview" && validInitialGroup) {
        actions = (
          <button
            onClick={openEditGroup}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/60 transition-all hover:bg-white/10 hover:text-white">
            <i className="fa-solid fa-pen-to-square text-[10px]"></i>
            EDIT GROUP
          </button>
        )
      } else if (groupInitialSection === "reports" && reportsExportHandlers) {
        actions = (
          <button
            onClick={reportsExportHandlers.exportCSV}
            className="flex items-center gap-2 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-[11px] font-bold text-cyan-400 transition-all hover:bg-cyan-500/20">
            <i className="fa-solid fa-file-csv text-[10px]"></i>
            EXPORT CSV
          </button>
        )
      }

      return {
        title: sectionLabel || "Overview",
        eyebrow: groupName,
        eyebrowColor: "text-cyan-400/80",
        actions,
        isGroupSection: true,
      }
    }

    return {
      title:
        generalTitles[activeSection] ||
        activeSection.charAt(0).toUpperCase() + activeSection.slice(1),
      eyebrow: "General Settings",
      eyebrowColor: "text-white/30",
      actions: null,
      isGroupSection: false,
    }
  }, [
    activeSection,
    isGroupSection,
    dropdownValue,
    dropdownGroups,
    groupInitialSection,
    groupSections,
    validInitialGroup,
    addMemberHandler,
    members.length,
    registrationMode,
    resetRegistration,
    openEditGroup,
    reportsExportHandlers,
  ])

  const handleSpoofDetectionToggle = (enabled: boolean) => {
    const isTurningOn = enabled && !attendanceSettings.enableSpoofDetection
    if (isTurningOn && !antiSpoofDetectionInfoDismissed) {
      setDontShowAntiSpoofInfoAgain(false)
      setIsAntiSpoofModalOpen(true)
      return
    }

    updateAttendanceSetting({ enableSpoofDetection: enabled })
  }

  const handleConfirmAntiSpoofDetection = () => {
    if (dontShowAntiSpoofInfoAgain) {
      setAntiSpoofDetectionInfoDismissed(true)
    }

    updateAttendanceSetting({ enableSpoofDetection: true })
    setIsAntiSpoofModalOpen(false)
  }

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-secondary)]">
        <SectionHeader {...headerProps} />

        {/* Section Content */}
        <div
          className={`relative flex flex-1 flex-col ${isGroupSection ? "min-h-0 overflow-hidden" : "custom-scroll overflow-x-hidden overflow-y-auto"}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, scale: 0.995 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.995 }}
              transition={{ duration: SETTINGS_SECTION_TRANSITION_DURATION, ease: "easeOut" }}
              style={{ willChange: "opacity, transform" }}
              className="relative flex min-h-0 w-full flex-1 flex-col">
              {activeSection === "group" && (
                <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                  <GroupPanel
                    onBack={handleGroupBack}
                    initialSection={groupInitialSection}
                    initialGroup={validInitialGroup}
                    embeddedGroups={dropdownGroups}
                    embeddedMembers={currentGroupMembers}
                    triggerCreateGroup={triggerCreateGroup}
                    deselectMemberTrigger={deselectMemberTrigger}
                    onHasSelectedMemberChange={setHasSelectedMember}
                    onExportHandlersReady={handleExportHandlersReady}
                    onAddMemberHandlerReady={handleAddMemberHandlerReady}
                    onGroupsChanged={handleGroupsChanged}
                    onSectionChange={setGroupInitialSection}
                    isEmbedded={true}
                  />
                </div>
              )}
              {activeSection === "display" && (
                <Display quickSettings={quickSettings} toggleQuickSetting={toggleQuickSetting} />
              )}
              {activeSection === "notifications" && (
                <Notifications
                  audioSettings={audioSettings}
                  onAudioSettingsChange={updateAudioSetting}
                />
              )}
              {activeSection === "attendance" && (
                <Attendance
                  attendanceSettings={attendanceSettings}
                  onLateThresholdChange={(minutes) =>
                    updateAttendanceSetting({ lateThresholdMinutes: minutes })
                  }
                  onLateThresholdToggle={(enabled) =>
                    updateAttendanceSetting({ lateThresholdEnabled: enabled })
                  }
                  onAttendanceCooldownChange={(seconds) =>
                    updateAttendanceSetting({ attendanceCooldownSeconds: seconds })
                  }
                  onSpoofDetectionToggle={handleSpoofDetectionToggle}
                  onMaxRecognitionFacesChange={(count) =>
                    updateAttendanceSetting({ maxRecognitionFacesPerFrame: count })
                  }
                  onTrackCheckoutToggle={(enabled) =>
                    updateAttendanceSetting({ trackCheckout: enabled })
                  }
                  onDataRetentionChange={(days) =>
                    updateAttendanceSetting({ dataRetentionDays: days })
                  }
                  hasSelectedGroup={!!dropdownValue}
                />
              )}
              {activeSection === "database" && (
                <Database
                  systemData={systemData}
                  timeHealthState={timeHealthState}
                  onRefreshTimeHealth={loadSystemData}
                  groups={groups}
                  isLoading={isLoading}
                  onClearDatabase={handleClearDatabase}
                  onGroupsChanged={() => {
                    loadSystemData()
                    if (onGroupsChanged) onGroupsChanged()
                  }}
                />
              )}
              {activeSection === "cloudsync" && (
                <RemoteSync onNavigateToDB={() => setActiveSection("database")} />
              )}
              {activeSection === "about" && <About />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <AntiSpoofDetectionModal
        isOpen={isAntiSpoofModalOpen}
        dontShowAgain={dontShowAntiSpoofInfoAgain}
        onClose={() => setIsAntiSpoofModalOpen(false)}
        onConfirm={handleConfirmAntiSpoofDetection}
        onDontShowAgainChange={setDontShowAntiSpoofInfoAgain}
      />
    </>
  )
}
