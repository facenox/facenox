import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Display } from "@/components/settings/sections/Display"
import { Notifications } from "@/components/settings/sections/Notifications"
import { Database } from "@/components/settings/sections/Database"
import { Attendance } from "@/components/settings/sections/Attendance"
import { About } from "@/components/settings/sections/About"
import { CloudSync } from "@/components/settings/sections/CloudSync"
import { GroupPanel, type GroupSection } from "@/components/group"
import { useGroupModals } from "@/components/group/hooks"
import { useGroupUIStore } from "@/components/group/stores"
import type {
  QuickSettings,
  AttendanceSettings,
  AudioSettings,
  SettingsOverview,
} from "@/components/settings/types"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

interface ContentPanelProps {
  activeSection: string
  groupInitialSection: GroupSection | undefined
  setGroupInitialSection: (section: GroupSection) => void
  validInitialGroup: AttendanceGroup | null
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
}

export const ContentPanel: React.FC<ContentPanelProps> = ({
  activeSection,
  groupInitialSection,
  setGroupInitialSection,
  validInitialGroup,
  triggerCreateGroup,
  deselectMemberTrigger,
  setDeselectMemberTrigger,
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
  groups,
  isLoading,
  handleClearDatabase,
  loadSystemData,
  onGroupsChanged,
  members,
  reportsExportHandlers,
  addMemberHandler,
  hasSelectedMember,
  dropdownGroups,
  groupSections,
}) => {
  const { openEditGroup } = useGroupModals()
  const registrationSource = useGroupUIStore((state) => state.lastRegistrationSource)
  const registrationMode = useGroupUIStore((state) => state.lastRegistrationMode)
  const handleRegistrationBack = useGroupUIStore((state) => state.handleRegistrationBack)
  const generalTitles: Record<string, string> = {
    attendance: "Attendance",
    display: "Display",
    notifications: "Notifications",
    database: "Database",
    cloudsync: "Cloud Beta",
    about: "About",
  }
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-secondary)]">
      {/* Section Header */}
      <div className="px-10 pt-10 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center text-xl font-semibold">
            {activeSection === "group" ?
              <div className="flex flex-col">
                <span className="mb-0.5 text-[11px] font-medium text-cyan-400/60">
                  {dropdownValue ?
                    dropdownGroups.find((g) => g.id === dropdownValue)?.name
                  : "Group Management"}
                </span>
                <span className="text-xl font-semibold text-white">
                  {groupInitialSection ?
                    groupSections.find((s) => s.id === groupInitialSection)?.label
                  : "Overview"}
                </span>
              </div>
            : <div className="flex flex-col">
                <span className="mb-0.5 text-[11px] font-medium text-white/30">General</span>
                <span className="text-xl font-semibold text-white">
                  {generalTitles[activeSection] ||
                    activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}
                </span>
              </div>
            }
          </h2>

          <div className="flex items-center gap-4">
            {activeSection === "group" &&
              groupInitialSection === "members" &&
              validInitialGroup &&
              addMemberHandler &&
              members.length > 0 && (
                <button
                  onClick={addMemberHandler}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium text-white/40 transition-all hover:bg-white/10 hover:text-white/80">
                  <i className="fa-solid fa-user-plus text-[10px]"></i>
                  Add Member
                </button>
              )}
            {activeSection === "group" &&
              groupInitialSection === "overview" &&
              validInitialGroup && (
                <button
                  onClick={openEditGroup}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium text-white/40 transition-all hover:bg-white/10 hover:text-white/80">
                  <svg
                    className="mb-0.5 h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                      strokeWidth={2.5}
                    />
                  </svg>
                  Edit Group
                </button>
              )}
            {activeSection === "group" &&
              groupInitialSection === "reports" &&
              reportsExportHandlers && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={reportsExportHandlers.exportCSV}
                    className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium text-white/40 transition-all hover:bg-white/10 hover:text-white/80">
                    <i className="fa-solid fa-file-csv text-[10px]"></i>
                    Export CSV
                  </button>
                </div>
              )}
            {activeSection === "group" &&
              groupInitialSection === "registration" &&
              registrationSource && (
                <button
                  onClick={() => {
                    if (registrationMode === "single" && hasSelectedMember) {
                      setDeselectMemberTrigger(Date.now())
                      return
                    }
                    handleRegistrationBack()
                  }}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium text-white/50 transition-all hover:bg-white/10 hover:text-white">
                  <i className="fa-solid fa-arrow-left text-[10px]"></i>
                  Back
                </button>
              )}
          </div>
        </div>
      </div>

      {/* Section Content */}
      <div
        className={`relative flex flex-1 flex-col ${activeSection === "group" ? "min-h-0 overflow-hidden" : "custom-scroll overflow-x-hidden overflow-y-auto"}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.995 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ willChange: "opacity, transform" }}
            className="relative flex min-h-0 w-full flex-1 flex-col">
            {activeSection === "group" && (
              <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                <GroupPanel
                  onBack={handleGroupBack}
                  initialSection={groupInitialSection}
                  initialGroup={validInitialGroup}
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
                onSpoofDetectionToggle={(enabled) =>
                  updateAttendanceSetting({ enableSpoofDetection: enabled })
                }
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
                groups={groups}
                isLoading={isLoading}
                onClearDatabase={handleClearDatabase}
                onGroupsChanged={() => {
                  loadSystemData()
                  if (onGroupsChanged) onGroupsChanged()
                }}
              />
            )}
            {activeSection === "cloudsync" && <CloudSync />}
            {activeSection === "about" && <About />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
