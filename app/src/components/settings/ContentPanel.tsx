import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  UserPlus,
  Plus,
  ArrowLeft,
  FileSpreadsheet,
  Layers,
  ChevronDown,
  Download,
  Check,
  X,
  Pencil,
} from "lucide-react"
import { Display } from "@/components/settings/sections/Display"
import { DataStorage } from "@/components/settings/sections/DataStorage"
import { Groups } from "@/components/settings/sections/Groups"
import { CreateGroup } from "@/components/group/modals/CreateGroup"
import { ClockHealth } from "@/components/settings/sections/ClockHealth"
import { Attendance } from "@/components/settings/sections/Attendance"
import { About } from "@/components/settings/sections/About"
import { Sync, type RemoteSyncConfig } from "@/components/settings/sections/Sync"
import { AntiSpoofDetectionModal } from "@/components/settings/AntiSpoofDetectionModal"
import { AuditLogExportModal } from "@/components/settings/AuditLogExportModal"
import { GroupPanel, type GroupSection } from "@/components/group"
import { SectionHeader } from "./components/SectionHeader"
import { useGroupUIStore } from "@/components/group/stores"
import { useUIStore } from "@/components/main/stores"
import { attendanceManager } from "@/services"
import { Tooltip, Dropdown } from "@/components/shared"
import { isOfficialCloudUrl } from "../../services/syncDefaults"
import type {
  QuickSettings,
  AttendanceSettings,
  AudioSettings,
  SettingsOverview,
  TimeHealthOverview,
} from "@/components/settings/types"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

interface ContentPanelProps {
  onCreateGroup?: () => void
  onOpenGroup?: (group: AttendanceGroup) => void
  activeSection: string
  groupInitialSection: GroupSection | undefined
  setGroupInitialSection: (section: GroupSection) => void
  validInitialGroup: AttendanceGroup | null
  currentGroupMembers: AttendanceMember[]
  triggerCreateGroup: number
  deselectMemberTrigger: number
  setDeselectMemberTrigger: (trigger: number) => void
  setHasSelectedMember: (hasSelected: boolean) => void
  handleExportHandlersReady: (handlers: {
    exportCSV: () => void
    exportAllGroupsCSV?: () => void
  }) => void
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
    exportAllGroupsCSV?: () => void
  } | null
  addMemberHandler: (() => void) | null
  hasSelectedMember: boolean
  dropdownGroups: AttendanceGroup[]
  groupSections: {
    id: GroupSection
    label: string
    icon: React.ComponentType<{ className?: string }>
  }[]
  setActiveSection: (section: string) => void
  streamRef?: React.RefObject<MediaStream | null>
}

export const ContentPanel: React.FC<ContentPanelProps> = ({
  onCreateGroup,
  onOpenGroup,
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
  streamRef,
  attendanceSettings,
  updateAttendanceSetting,
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
  const enrollmentMode = useGroupUIStore((state) => state.lastEnrollmentMode)
  const resetEnrollment = useGroupUIStore((state) => state.resetEnrollment)

  const [isEditingGroupName, setIsEditingGroupName] = useState(false)
  const [groupNameInput, setGroupNameInput] = useState("")
  const [isSavingGroupName, setIsSavingGroupName] = useState(false)
  const groupNameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditingGroupName) {
      setGroupNameInput(validInitialGroup?.name || "")
      const timer = setTimeout(() => {
        groupNameInputRef.current?.focus()
        groupNameInputRef.current?.select()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isEditingGroupName, validInitialGroup?.name])

  // Auto-cancel group name edit mode whenever navigating sections or switching groups
  useEffect(() => {
    setIsEditingGroupName(false)
  }, [activeSection, groupInitialSection, validInitialGroup?.id])

  const handleSaveGroupName = async () => {
    if (!validInitialGroup) return
    const trimmed = groupNameInput.trim()
    if (!trimmed || trimmed === validInitialGroup.name) {
      setIsEditingGroupName(false)
      return
    }

    if (trimmed.length > 100) {
      setError("Group name cannot exceed 100 characters.")
      return
    }

    setIsSavingGroupName(true)
    try {
      await attendanceManager.updateGroup(validInitialGroup.id, {
        name: trimmed,
      })
      setIsEditingGroupName(false)
      const updatedGroup = { ...validInitialGroup, name: trimmed }
      handleGroupsChanged(updatedGroup)
      setSuccess("Group name updated.")
    } catch (err) {
      console.error("Failed to update group name:", err)
      setError(err instanceof Error ? err.message : "Failed to update group name")
    } finally {
      setIsSavingGroupName(false)
    }
  }

  const handleCancelGroupNameEdit = useCallback(() => {
    setIsEditingGroupName(false)
    setGroupNameInput(validInitialGroup?.name || "")
  }, [validInitialGroup?.name])
  const antiSpoofDetectionInfoDismissed = useUIStore(
    (state) => state.antiSpoofDetectionInfoDismissed,
  )
  const setAntiSpoofDetectionInfoDismissed = useUIStore(
    (state) => state.setAntiSpoofDetectionInfoDismissed,
  )
  const setSuccess = useUIStore((state) => state.setSuccess)
  const setError = useUIStore((state) => state.setError)
  const [isAntiSpoofModalOpen, setIsAntiSpoofModalOpen] = useState(false)
  const [dontShowAntiSpoofInfoAgain, setDontShowAntiSpoofInfoAgain] = useState(false)
  const [isAuditLogModalOpen, setIsAuditLogModalOpen] = useState(false)
  const [isPaired, setIsPaired] = useState(false)
  const [canManageGroups, setCanManageGroups] = useState(false)
  const showCreateGroupModal = useGroupUIStore((state) => state.showCreateGroupModal)
  const openCreateGroup = useGroupUIStore((state) => state.openCreateGroup)
  const closeCreateGroup = useGroupUIStore((state) => state.closeCreateGroup)
  const [syncConfig, setSyncConfig] = useState<RemoteSyncConfig | null>(null)

  useEffect(() => {
    if (!window.electronAPI?.sync) return

    const fetchConfig = () => {
      window.electronAPI.sync
        .getConfig()
        .then((c) => setIsPaired(c.connected))
        .catch(console.error)
    }

    fetchConfig()

    const unsubscribe = window.electronAPI.sync.onDataChanged(() => {
      fetchConfig()
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (activeSection === "remote-sync") {
      window.electronAPI.sync.getConfig().then((cfg) => {
        setSyncConfig(cfg as RemoteSyncConfig)
      })
    }
  }, [activeSection])

  /** Audit log export — owned here so the page header can surface the action. */
  const handleExportAuditLog = useCallback(
    async (startDate?: string, endDate?: string) => {
      try {
        await attendanceManager.downloadAuditLog(startDate, endDate)
        setSuccess("Audit log downloaded.")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to export audit log.")
      }
    },
    [setSuccess, setError],
  )

  // Dynamic Header Logic
  const headerProps = useMemo(() => {
    const isGroupSection = activeSection === "group"

    const generalTitles: Record<string, string> = {
      groups: "Groups",
      attendance: "General",
      display: "Display & audio",
      notifications: "Display & audio",
      database: "Data & storage",
      "remote-sync": "Cloud sync",
      about: "About",
    }
    if (isGroupSection) {
      const groupName = validInitialGroup?.name || "Group management"

      const sectionLabel =
        groupInitialSection ?
          groupSections.find((s) => s.id === groupInitialSection)?.label
        : "Overview"

      // Actions
      let actions: React.ReactNode = null
      if (
        groupInitialSection === "members" &&
        validInitialGroup &&
        members.length > 0 &&
        !enrollmentMode
      ) {
        actions = (
          <div className="flex items-center gap-2">
            <button
              onClick={() => addMemberHandler?.()}
              disabled={!addMemberHandler}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97] disabled:opacity-50">
              <UserPlus className="size-3" />
              Add member
            </button>
          </div>
        )
      } else if (groupInitialSection === "members" && enrollmentMode) {
        actions = (
          <button
            onClick={resetEnrollment}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97]">
            <ArrowLeft className="size-3" />
            Back to members
          </button>
        )
      } else if (groupInitialSection === "reports") {
        actions =
          dropdownGroups.length > 1 ?
            <Dropdown
              options={[
                {
                  value: "current",
                  label: "Export current group",
                  icon: <FileSpreadsheet className="size-3.5" />,
                },
                {
                  value: "all",
                  label: "Export all groups",
                  icon: <Layers className="size-3.5" />,
                },
              ]}
              value={null}
              onChange={(val) => {
                if (val === "current") {
                  reportsExportHandlers?.exportCSV()
                } else if (val === "all") {
                  reportsExportHandlers?.exportAllGroupsCSV?.()
                }
              }}
              showPlaceholderOption={false}
              allowClear={false}
              align="right"
              menuWidth={180}
              className="inline-flex items-center"
              buttonClassName="!border-0 !bg-transparent !p-0 hover:!bg-transparent focus:!bg-transparent"
              trigger={
                <button
                  type="button"
                  disabled={!reportsExportHandlers}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium tracking-wide text-white/80 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-[0.97] disabled:opacity-40">
                  <FileSpreadsheet className="size-3" />
                  <span>Export</span>
                  <ChevronDown className="ml-0.5 size-2.5 opacity-70" />
                </button>
              }
            />
          : <button
              onClick={() => reportsExportHandlers?.exportCSV()}
              disabled={!reportsExportHandlers}
              title="Export CSV for this group"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium tracking-wide text-white/80 transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white active:scale-[0.97] disabled:opacity-40">
              <FileSpreadsheet className="size-3" />
              Export CSV
            </button>
      }

      const isOverview = !groupInitialSection || groupInitialSection === "overview"

      return {
        title: sectionLabel || "Overview",
        eyebrow: groupName,
        eyebrowColor: "text-white/45",
        onEyebrowClick: isOverview ? undefined : () => setGroupInitialSection("overview"),
        actions,
        isGroupSection: true,
      }
    }

    return {
      title:
        generalTitles[activeSection] ||
        activeSection.charAt(0).toUpperCase() + activeSection.slice(1),
      eyebrow: activeSection === "groups" ? "Manage" : "Settings",
      eyebrowColor: "text-white/45",
      actions:
        activeSection === "groups" ?
          <button
            onClick={onCreateGroup ?? openCreateGroup}
            disabled={!canManageGroups}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97] disabled:opacity-50">
            <Plus aria-hidden="true" className="size-3" />
            Create group
          </button>
        : activeSection === "database" ?
          <button
            onClick={() => setIsAuditLogModalOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-bold tracking-wide text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97]">
            <Download className="size-3" />
            Audit log
          </button>
        : activeSection === "remote-sync" && syncConfig?.connected ?
          (() => {
            const isQuota =
              syncConfig.lastSyncMessage?.includes("Plan limit exceeded") ||
              syncConfig.lastSyncMessage?.includes("PLAN_QUOTA_HARD_EXCEEDED") ||
              syncConfig.lastSyncMessage?.includes("Plan member limit exceeded") ||
              syncConfig.lastSyncMessage?.includes("Total active members reached")

            return (
              <div className="flex items-center gap-2">
                {!isOfficialCloudUrl(syncConfig.remoteBaseUrl) && (
                  <Tooltip
                    content={`Custom sync destination: ${syncConfig.remoteBaseUrl}`}
                    position="bottom">
                    <span className="text-[9px] font-extrabold tracking-widest text-white/45 uppercase select-none">
                      Custom server
                    </span>
                  </Tooltip>
                )}
                <Tooltip
                  content={`Linked to ${syncConfig.organizationName || "Facenox Cloud"} • Location: ${syncConfig.siteName || "Default Branch"}`}
                  position="bottom">
                  <div
                    className={`cursor-help rounded border px-2 py-0.5 text-[9px] font-extrabold tracking-widest uppercase transition-all duration-200 ${
                      syncConfig.lastSyncStatus === "error" ?
                        isQuota ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                        : "border-red-500/20 bg-red-500/10 text-red-400"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    }`}>
                    {syncConfig.lastSyncStatus === "error" ?
                      isQuota ?
                        "Plan limit"
                      : "Sync warning"
                    : "Synced"}
                  </div>
                </Tooltip>
              </div>
            )
          })()
        : null,
      isGroupSection: false,
    }
  }, [
    activeSection,
    dropdownGroups.length,
    groupInitialSection,
    groupSections,
    validInitialGroup,
    addMemberHandler,
    members.length,
    enrollmentMode,
    resetEnrollment,
    reportsExportHandlers,
    setGroupInitialSection,
    syncConfig,
    canManageGroups,
    openCreateGroup,
    onCreateGroup,
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

  const motionProps = {
    initial: { opacity: 0, scale: 0.995 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.995 },
    transition: { duration: 0.18, ease: "easeOut" as const },
  }

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-secondary)]">
        <SectionHeader>
          <SectionHeader.Breadcrumbs>
            {headerProps.isGroupSection ?
              <>
                <AnimatePresence mode="wait" initial={false}>
                  {isEditingGroupName ?
                    <motion.div
                      key="editing-group-name"
                      initial={{ opacity: 0, scale: 0.96, x: -4 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.96, x: -4 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="flex max-w-full min-w-0 items-center gap-1.5">
                      <input
                        ref={groupNameInputRef}
                        type="text"
                        maxLength={100}
                        size={Math.max(8, groupNameInput.length + 1)}
                        style={{ fieldSizing: "content" } as React.CSSProperties}
                        value={groupNameInput}
                        onChange={(e) => setGroupNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.keyCode === 13) {
                            e.preventDefault()
                            e.stopPropagation()
                            handleSaveGroupName()
                          } else if (e.key === "Escape" || e.key === "Esc" || e.keyCode === 27) {
                            e.preventDefault()
                            e.stopPropagation()
                            handleCancelGroupNameEdit()
                          }
                        }}
                        disabled={isSavingGroupName}
                        className="w-auto max-w-full min-w-[120px] shrink rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[13px] font-semibold tracking-wide text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all duration-200 outline-none placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.08]"
                      />
                      <Tooltip content="Save (Enter)" position="bottom" offset={6}>
                        <button
                          type="button"
                          onClick={handleSaveGroupName}
                          disabled={!groupNameInput.trim() || isSavingGroupName}
                          aria-label="Save name"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-none bg-transparent p-0 text-cyan-400/80 transition-all duration-150 hover:bg-cyan-500/10 hover:text-cyan-300 focus:outline-none active:scale-95 disabled:opacity-30">
                          <Check className="size-3" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Cancel (Esc)" position="bottom" offset={6}>
                        <button
                          type="button"
                          onClick={handleCancelGroupNameEdit}
                          disabled={isSavingGroupName}
                          aria-label="Cancel"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-none bg-transparent p-0 text-white/35 transition-all duration-150 hover:bg-white/5 hover:text-white/75 focus:outline-none active:scale-95">
                          <X className="size-3" />
                        </button>
                      </Tooltip>
                    </motion.div>
                  : <motion.div
                      key="viewing-group-name"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="group/group-title flex min-w-0 items-center gap-1.5 overflow-hidden">
                      <Tooltip
                        content={validInitialGroup?.name || "Group management"}
                        position="bottom"
                        offset={6}>
                        <SectionHeader.Breadcrumb
                          key="group-name"
                          active={!groupInitialSection || groupInitialSection === "overview"}
                          onClick={
                            !groupInitialSection || groupInitialSection === "overview" ?
                              undefined
                            : () => setGroupInitialSection("overview")
                          }>
                          {validInitialGroup?.name || "Group management"}
                        </SectionHeader.Breadcrumb>
                      </Tooltip>
                      {validInitialGroup &&
                        (!groupInitialSection || groupInitialSection === "overview") && (
                          <Tooltip content="Edit group name" position="bottom" offset={6}>
                            <button
                              type="button"
                              onClick={() => {
                                setGroupNameInput(validInitialGroup?.name || "")
                                setIsEditingGroupName(true)
                              }}
                              aria-label="Edit group name"
                              className="flex h-5 w-5 shrink-0 items-center justify-center border-none bg-transparent p-0 text-white/35 transition-colors duration-150 hover:text-cyan-400 focus:outline-none active:scale-95">
                              <Pencil className="size-2.5" />
                            </button>
                          </Tooltip>
                        )}
                    </motion.div>
                  }
                </AnimatePresence>
                <AnimatePresence mode="popLayout">
                  {groupInitialSection && groupInitialSection !== "overview" && (
                    <motion.div
                      key={groupInitialSection}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="inline-flex shrink-0 items-center gap-2">
                      <SectionHeader.Separator />
                      <SectionHeader.Breadcrumb active>
                        {groupSections.find((s) => s.id === groupInitialSection)?.label ||
                          "Overview"}
                      </SectionHeader.Breadcrumb>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            : <>
                <SectionHeader.Breadcrumb key="settings-label">
                  {activeSection === "groups" ? "Manage" : "Settings"}
                </SectionHeader.Breadcrumb>
                <AnimatePresence mode="popLayout">
                  {
                    <motion.div
                      key={activeSection}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="inline-flex shrink-0 items-center gap-2">
                      <SectionHeader.Separator />
                      <SectionHeader.Breadcrumb active>
                        {headerProps.title}
                      </SectionHeader.Breadcrumb>
                    </motion.div>
                  }
                </AnimatePresence>
              </>
            }
          </SectionHeader.Breadcrumbs>

          <SectionHeader.Actions>
            {headerProps.actions && (
              <motion.div
                key={headerProps.title + "-actions"}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}>
                {headerProps.actions}
              </motion.div>
            )}
          </SectionHeader.Actions>
        </SectionHeader>

        {/* Section Content */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {activeSection === "group" && (
              <motion.div
                key="group"
                {...motionProps}
                className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
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
              </motion.div>
            )}

            {(activeSection === "display" || activeSection === "notifications") && (
              <motion.div
                key="display"
                {...motionProps}
                className="custom-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
                <Display
                  quickSettings={quickSettings}
                  toggleQuickSetting={toggleQuickSetting}
                  audioSettings={audioSettings}
                  onAudioSettingsChange={updateAudioSetting}
                  streamRef={streamRef}
                />
              </motion.div>
            )}

            {activeSection === "attendance" && (
              <motion.div
                key="attendance"
                {...motionProps}
                className="custom-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
                <Attendance
                  attendanceSettings={attendanceSettings}
                  onSpoofDetectionToggle={handleSpoofDetectionToggle}
                  onMaxRecognitionFacesChange={(count) =>
                    updateAttendanceSetting({ maxRecognitionFacesPerFrame: count })
                  }
                  onDataRetentionChange={(days) =>
                    updateAttendanceSetting({ dataRetentionDays: days })
                  }
                  isPaired={isPaired}
                />
                <ClockHealth
                  timeHealthState={timeHealthState}
                  onRefreshTimeHealth={loadSystemData}
                />
              </motion.div>
            )}

            {activeSection === "groups" && (
              <motion.div
                key="groups"
                {...motionProps}
                className="custom-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
                <Groups
                  groups={groups}
                  onOpenGroup={onOpenGroup}
                  onManagementChange={setCanManageGroups}
                  onGroupsChanged={() => {
                    loadSystemData()
                    onGroupsChanged?.()
                  }}
                />
              </motion.div>
            )}

            {activeSection === "database" && (
              <motion.div
                key="database"
                {...motionProps}
                className="custom-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
                <DataStorage
                  systemData={systemData}
                  groups={groups}
                  isLoading={isLoading}
                  onClearDatabase={handleClearDatabase}
                  onNavigateToSync={() => setActiveSection("remote-sync")}
                  onGroupsChanged={() => {
                    loadSystemData()
                    if (onGroupsChanged) onGroupsChanged()
                  }}
                />
              </motion.div>
            )}

            {activeSection === "remote-sync" && (
              <motion.div
                key="remote-sync"
                {...motionProps}
                className="custom-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
                <Sync
                  onNavigateToDB={() => setActiveSection("database")}
                  onStatusChange={setSyncConfig}
                />
              </motion.div>
            )}

            {activeSection === "about" && (
              <motion.div
                key="about"
                {...motionProps}
                className="custom-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
                <About />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {activeSection === "groups" && (
        <CreateGroup
          isOpen={showCreateGroupModal}
          existingGroups={groups}
          onClose={closeCreateGroup}
          onSuccess={() => {
            loadSystemData()
            onGroupsChanged?.()
            setSuccess("Group created successfully.")
          }}
        />
      )}
      <AntiSpoofDetectionModal
        isOpen={isAntiSpoofModalOpen}
        dontShowAgain={dontShowAntiSpoofInfoAgain}
        onClose={() => setIsAntiSpoofModalOpen(false)}
        onConfirm={handleConfirmAntiSpoofDetection}
        onDontShowAgainChange={setDontShowAntiSpoofInfoAgain}
      />
      <AuditLogExportModal
        isOpen={isAuditLogModalOpen}
        onClose={() => setIsAuditLogModalOpen(false)}
        onExport={handleExportAuditLog}
      />
    </>
  )
}
