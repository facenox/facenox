import { useState, useMemo, useEffect, memo, useCallback } from "react"
import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  createDisplayNameMap,
  getLocalDateString,
  formatDuration,
  generateGroupDisplayNames,
} from "@/utils"
import { Dropdown, Tooltip, MemberTooltip } from "@/components/shared"
import type { AttendanceGroup, AttendanceRecord, AttendanceMember } from "@/components/main/types"
import {
  buildRecordCheckInStatusMap,
  limitAttendanceRecords,
  processAttendanceRecords,
  type AttendanceRecordScope,
} from "@/components/main/components/attendancePanelUtils"

import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { ManualEntryModal } from "./ManualEntryModal"
import { ManualCorrectionModal } from "./ManualCorrectionModal"

interface AttendancePanelProps {
  handleSelectGroup: (group: AttendanceGroup) => void
  refreshAttendanceData: () => Promise<void>
}

const sidebarActionButtonClassName =
  "flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.08] bg-white/[0.02] text-white/45 transition-all duration-200 hover:bg-white/[0.05] hover:text-white focus:border-white/20 focus:text-white focus:outline-none"

const sidebarActionIconClassName =
  "pointer-events-none text-sm text-current transition-colors duration-200"

const ScrollCenteredEmptyState = memo(function ScrollCenteredEmptyState({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`flex min-h-0 flex-1 items-center justify-center pl-[10px] ${className}`}>
      {children}
    </div>
  )
})

const SidebarTopSkeleton = memo(function SidebarTopSkeleton() {
  return (
    <div className="shrink-0 px-3 py-2 pb-1.5" data-testid="attendance-panel-shell-skeleton">
      <div className="flex items-center gap-0">
        <div className="h-9 flex-1 rounded-l-lg border border-r-0 border-white/10 bg-white/5" />
        <div className="h-9 w-9 border border-r-0 border-white/10 bg-white/5" />
        <div className="h-9 w-9 rounded-r-lg border border-white/10 bg-white/5" />
      </div>
    </div>
  )
})

const AttendanceListSkeleton = memo(function AttendanceListSkeleton({
  showSearch = false,
}: {
  showSearch?: boolean
}) {
  return (
    <>
      {showSearch && (
        <div className="shrink-0 px-3 pb-3" data-testid="attendance-panel-search-skeleton">
          <div className="flex items-center">
            <div className="h-9 flex-1 rounded-l-lg border border-r-0 border-white/10 bg-white/4" />
            <div className="h-9 w-9 border border-r-0 border-white/10 bg-white/4" />
            <div className="h-9 w-9 rounded-r-lg border border-white/10 bg-white/4" />
          </div>
        </div>
      )}

      <div className="hover-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="border-b border-l-2 border-white/5 border-l-transparent py-2.5 pr-3 pl-4">
            <div className="flex items-center gap-3 py-0.5">
              <div className="h-3.5 flex-1 rounded bg-white/7" />
              <div className="h-5 w-16 rounded-full border border-white/10 bg-white/5" />
              <div className="h-3 w-12 rounded bg-white/7" />
            </div>
          </div>
        ))}
      </div>
    </>
  )
})

const AttendanceRecordItem = memo(
  ({
    record,
    displayName,
    member,
    classStartTime,
    lateThresholdMinutes,
    lateThresholdEnabled,
    trackCheckoutEnabled,
    hasCheckedInEarlier,
    onVoidManual,
  }: {
    record: AttendanceRecord
    displayName: string
    member?: AttendanceMember | null
    classStartTime: string
    lateThresholdMinutes: number
    lateThresholdEnabled: boolean
    trackCheckoutEnabled: boolean
    hasCheckedInEarlier: boolean
    onVoidManual?: (record: AttendanceRecord) => void
  }) => {
    const [isHovered, setIsHovered] = useState(false)

    const calculateTimeStatus = () => {
      try {
        if (!classStartTime && !record.event_type) return null

        const effectiveEventType =
          record.event_type || (hasCheckedInEarlier ? "check_out" : "check_in")

        if (trackCheckoutEnabled && effectiveEventType === "check_out") {
          return {
            status: "check-out",
            minutes: 0,
            label: "TIME OUT",
            color: "text-cyan-400",
            pillColor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
            borderColor: "border-l-cyan-500",
            avatarColor: "bg-cyan-500/10 text-cyan-400",
          }
        }

        const [startHours, startMinutes] = classStartTime.split(":").map(Number)

        const startDate = new Date(record.timestamp)
        startDate.setHours(startHours, startMinutes, 0, 0)

        const diffMs = record.timestamp.getTime() - startDate.getTime()
        const diffMinutes = Math.floor(diffMs / 60000)

        const severeLateThreshold = 30
        const earlyThreshold = -5

        if (lateThresholdEnabled) {
          if (diffMinutes > lateThresholdMinutes) {
            const minutesLate = diffMinutes
            return {
              status: minutesLate > severeLateThreshold ? "severe-late" : "late",
              minutes: minutesLate,
              label: `${formatDuration(minutesLate)} LATE`,
              color: minutesLate > severeLateThreshold ? "text-red-400" : "text-orange-400",
              pillColor:
                minutesLate > severeLateThreshold ?
                  "bg-red-500/10 text-red-400/90"
                : "bg-orange-500/10 text-orange-400/90",
              borderColor:
                minutesLate > severeLateThreshold ? "border-l-red-500" : "border-l-orange-500",
              avatarColor:
                minutesLate > severeLateThreshold ?
                  "bg-red-500/10 text-red-500/70"
                : "bg-orange-500/10 text-orange-500/70",
            }
          }

          if (diffMinutes < earlyThreshold) {
            const minutesEarly = Math.abs(diffMinutes)
            return {
              status: "early",
              minutes: minutesEarly,
              label: `${formatDuration(minutesEarly)} EARLY`,
              color: "text-cyan-400/80",
              pillColor: "bg-cyan-500/10 text-cyan-400/90",
              borderColor: "border-l-transparent",
              avatarColor: "bg-cyan-500/10 text-cyan-400",
            }
          }
        }

        return {
          status: "on-time",
          minutes: 0,
          label:
            trackCheckoutEnabled ? "TIME IN"
            : lateThresholdEnabled ? "ON TIME"
            : "",
          color: "text-white/55",
          pillColor: "bg-white/5 text-white/45",
          borderColor: "border-l-transparent",
          avatarColor: "bg-white/5 text-white/45",
        }
      } catch {
        return null
      }
    }

    const timeStatus = calculateTimeStatus()

    return (
      <div
        onMouseEnter={() => {
          if (onVoidManual) {
            setIsHovered(true)
          }
        }}
        onMouseLeave={() => setIsHovered(false)}
        className={`group relative border-b border-l-2 border-white/5 py-2.5 pr-3 pl-4 transition-colors hover:bg-[rgba(22,28,36,0.52)] ${timeStatus?.borderColor || "border-l-transparent"}`}>
        <div className="flex items-center gap-3 py-0.5">
          <div className="min-w-0 flex-1 truncate">
            <MemberTooltip
              member={member}
              position="top"
              showEnrollment={false}
              role={record.event_type === "check_out" ? "Exiting" : "Present"}>
              <span className="cursor-help text-[13px] font-medium text-white/90 hover:text-white">
                {displayName}
              </span>
            </MemberTooltip>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {timeStatus?.label && (
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider uppercase ${timeStatus.pillColor}`}>
                {timeStatus.label}
              </span>
            )}

            <div className="relative flex h-6 w-[54px] shrink-0 items-center justify-center overflow-hidden">
              <AnimatePresence initial={false}>
                {isHovered && onVoidManual ?
                  <motion.div
                    key="trash-btn"
                    initial={{ opacity: 0, scale: 0.9, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 8 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute flex h-6 w-6 items-center justify-center">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onVoidManual(record)
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full border-none bg-transparent p-0 text-red-500/50 shadow-none transition-all outline-none hover:bg-red-500/15 hover:text-red-400"
                      aria-label={`Remove manual attendance for ${displayName}`}>
                      <i className="fa-regular fa-trash-can text-[12px]"></i>
                    </button>
                  </motion.div>
                : <motion.span
                    key="time-text"
                    initial={{ opacity: 0, scale: 0.95, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute block w-full text-center font-mono text-[11px] text-white/55 tabular-nums">
                    {record.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </motion.span>
                }
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    )
  },
)

AttendanceRecordItem.displayName = "AttendanceRecordItem"

export const AttendancePanel = memo(function AttendancePanel({
  handleSelectGroup,
  refreshAttendanceData,
}: AttendancePanelProps) {
  const {
    attendanceGroups,
    currentGroup,
    recentAttendance,
    groupMembers,
    isShellReady,
    isPanelLoading,
    isPanelSwitchPending,
    setShowGroupManagement,
  } = useAttendanceStore()

  const { setShowSettings, setGroupInitialSection, setSettingsInitialSection } = useUIStore()
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [isManualCorrectionOpen, setIsManualCorrectionOpen] = useState(false)
  const [recordToVoid, setRecordToVoid] = useState<AttendanceRecord | null>(null)

  const todayPresentPersonIds = useMemo(() => {
    const today = getLocalDateString()
    return new Set(
      recentAttendance
        .filter((record) => !record.is_voided && getLocalDateString(record.timestamp) === today)
        .map((record) => record.person_id),
    )
  }, [recentAttendance])

  const lateTrackingSettings = useMemo(() => {
    if (!currentGroup?.settings) {
      return {
        lateThresholdEnabled: false,
        lateThresholdMinutes: 5,
        classStartTime: new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      }
    }

    return {
      lateThresholdEnabled: currentGroup.settings.late_threshold_enabled ?? false,
      lateThresholdMinutes: currentGroup.settings.late_threshold_minutes ?? 5,
      classStartTime:
        currentGroup.settings.class_start_time ??
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
    }
  }, [currentGroup])

  const handleOpenSettingsForEnrollment = useCallback(() => {
    // Force active settings tab to "group" (Group Management) to override cached history
    setSettingsInitialSection("group")
    setGroupInitialSection("members")
    setShowSettings(true)
  }, [setGroupInitialSection, setSettingsInitialSection, setShowSettings])

  const unenrolledMembersCount = useMemo(() => {
    return groupMembers.filter((m) => m.is_active && !m.has_face_data).length
  }, [groupMembers])

  const [searchQuery, setSearchQuery] = useState("")
  const [recordScope, setRecordScope] = useState<AttendanceRecordScope>("today")
  const [displayLimit, setDisplayLimit] = useState(20)
  const effectiveRecordScope: AttendanceRecordScope =
    recentAttendance.length === 0 ? "all" : recordScope

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [])

  const handleRecordScopeChange = useCallback((scope: AttendanceRecordScope | null) => {
    if (scope) {
      setRecordScope(scope)
    }
  }, [])

  const handleLoadMore = useCallback(() => {
    setDisplayLimit((prev) => prev + 20)
  }, [])

  const displayNameMap = useMemo(() => {
    return createDisplayNameMap(groupMembers)
  }, [groupMembers])

  const memberMap = useMemo(() => {
    const map = new Map<string, (typeof groupMembers)[0]>()
    groupMembers.forEach((m) => map.set(m.person_id, m))
    return map
  }, [groupMembers])

  const processedRecords = useMemo(() => {
    return processAttendanceRecords({
      recentAttendance,
      displayNameMap,
      recordScope: effectiveRecordScope,
      searchQuery,
      sortField: "time",
      sortOrder: "desc",
    })
  }, [recentAttendance, displayNameMap, effectiveRecordScope, searchQuery])

  const visibleRecords = useMemo(() => {
    return limitAttendanceRecords(processedRecords, displayLimit)
  }, [processedRecords, displayLimit])

  const hasMore = processedRecords.length > displayLimit

  useEffect(() => {
    const timer = setTimeout(() => setDisplayLimit(20), 0)
    return () => clearTimeout(timer)
  }, [recordScope, searchQuery])

  if (!isShellReady) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <SidebarTopSkeleton />
        <AttendanceListSkeleton />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {attendanceGroups.length > 0 ?
        <div className="shrink-0 px-3 py-2 pb-1.5">
          <div className="flex items-center">
            <div className="min-w-30 flex-1">
              <Dropdown
                options={generateGroupDisplayNames(attendanceGroups).map((group) => ({
                  value: group.id,
                  label: group.displayName,
                }))}
                value={
                  currentGroup && attendanceGroups.some((g) => g.id === currentGroup.id) ?
                    currentGroup.id
                  : null
                }
                onChange={(groupId) => {
                  if (groupId) {
                    const group = attendanceGroups.find((g) => g.id === groupId)
                    if (group) handleSelectGroup(group)
                  }
                }}
                placeholder="Select group..."
                emptyMessage="No groups available"
                maxHeight={256}
                buttonClassName="text-xs h-9 !bg-white/[0.02] hover:!bg-white/[0.05] !border-white/[0.08] border-r-0 rounded-r-none focus:ring-0! focus:border-white/20!"
                allowClear={false}
                showPlaceholderOption={false}
              />
            </div>
            <Tooltip content="Create Group" position="top">
              <button
                onClick={() => setShowGroupManagement(true)}
                className={`${sidebarActionButtonClassName} rounded-none border-r-0`}
                aria-label="Create Group">
                <i className={`fa-solid fa-plus ${sidebarActionIconClassName}`}></i>
              </button>
            </Tooltip>
            <Tooltip content="Members" position="top">
              <button
                onClick={() => setShowManualEntry(true)}
                className={`${sidebarActionButtonClassName} rounded-l-none rounded-r-lg`}
                aria-label="Members">
                <i className={`fa-solid fa-users ${sidebarActionIconClassName}`}></i>
              </button>
            </Tooltip>
          </div>

          {/* Biometric Enrollment Handoff Banner */}
          {currentGroup && unenrolledMembersCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-3 py-2 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-2.5 w-[3px] shrink-0 animate-pulse rounded-[1px] bg-amber-400" />
                <span className="truncate text-[11.5px] font-medium text-amber-300/90">
                  {unenrolledMembersCount} member{unenrolledMembersCount === 1 ? "" : "s"} need face
                  enrollment
                </span>
              </div>
              <button
                onClick={handleOpenSettingsForEnrollment}
                className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[10.5px] font-bold tracking-wider text-amber-300 uppercase transition-all duration-150 hover:border-amber-500/50 hover:bg-amber-500/25 active:scale-95">
                Enroll →
              </button>
            </motion.div>
          )}
        </div>
      : <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="text-center text-xs text-white/55">No groups created</div>
            <button
              onClick={() => setShowGroupManagement(true)}
              className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white">
              <i className="fa-solid fa-plus text-xs"></i>
              Create Group
            </button>
          </div>
        </div>
      }

      {!isPanelLoading && !isPanelSwitchPending && recentAttendance.length > 0 && (
        <div className="shrink-0 px-3 pb-3">
          <div className="group/bar flex min-w-0 flex-1 items-center">
            <div className="relative flex-1">
              <svg
                className="absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-white/25 transition-colors group-focus-within/bar:text-white/45"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search name..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="h-9 w-full rounded-l-lg rounded-r-none border border-r-0 border-white/5 bg-white/5 py-2 pr-3 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none group-focus-within/bar:border-white/20 placeholder:text-white/30 focus:bg-white/[0.08]"
              />
            </div>

            <div className="shrink-0">
              <Tooltip
                content={`Show: ${
                  recordScope === "today" ? "Today"
                  : recordScope === "yesterday" ? "Yesterday"
                  : recordScope === "week" ? "This Week"
                  : "All records"
                }`}
                position="top">
                <Dropdown
                  className="w-9"
                  options={[
                    { value: "today", label: "Today" },
                    { value: "yesterday", label: "Yesterday" },
                    { value: "week", label: "This Week" },
                    { value: "all", label: "All" },
                  ]}
                  value={recordScope}
                  onChange={(val) => handleRecordScopeChange(val as AttendanceRecordScope)}
                  trigger={
                    <span className="inline-flex h-4 w-4 items-center justify-center">
                      <i className={`fa-solid fa-calendar-day ${sidebarActionIconClassName}`} />
                    </span>
                  }
                  menuWidth={120}
                  buttonClassName={`h-9 w-full !border-white/5 !bg-white/5 group-focus-within/bar:!border-white/20 border border-l-0 rounded-l-none rounded-r-lg px-0 text-white/45 transition-all duration-200 hover:!bg-white/[0.08] hover:text-white focus:!border-white/20 focus:text-white focus:outline-none`}
                  showPlaceholderOption={false}
                  allowClear={false}
                />
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      {attendanceGroups.length > 0 &&
        (isPanelLoading ? <AttendanceListSkeleton showSearch={Boolean(currentGroup)} />
        : isPanelSwitchPending ? <div className="flex min-h-0 flex-1" />
        : <div
            className="hover-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto"
            style={{
              maskImage: "linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)",
            }}>
            <AnimatePresence mode="wait">
              {visibleRecords.length > 0 ?
                <motion.div
                  key={`records-${recordScope}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
                  {(() => {
                    const recordCheckInStatus = buildRecordCheckInStatusMap(processedRecords)

                    return visibleRecords.map((record, idx) => {
                      const displayName = displayNameMap.get(record.person_id) || "Unknown"
                      const hasCheckedInEarlier = recordCheckInStatus.get(record.id) ?? false
                      const member = memberMap.get(record.person_id)

                      return (
                        <AttendanceRecordItem
                          key={record.id || `record-${idx}`}
                          record={record}
                          displayName={displayName}
                          member={member}
                          classStartTime={lateTrackingSettings.classStartTime}
                          lateThresholdMinutes={lateTrackingSettings.lateThresholdMinutes}
                          lateThresholdEnabled={lateTrackingSettings.lateThresholdEnabled}
                          trackCheckoutEnabled={currentGroup?.settings?.track_checkout ?? false}
                          hasCheckedInEarlier={hasCheckedInEarlier}
                          onVoidManual={(record) => {
                            setRecordToVoid(record)
                            setIsManualCorrectionOpen(true)
                          }}
                        />
                      )
                    })
                  })()}

                  {hasMore && (
                    <div className="px-2 py-2">
                      <button
                        onClick={handleLoadMore}
                        className="w-full rounded-lg border border-white/5 bg-white/5 py-2 text-xs font-semibold text-white/80 transition-all hover:border-white/10 hover:bg-white/[0.08] active:scale-[0.99]">
                        Load More ({processedRecords.length - displayLimit} remaining)
                      </button>
                    </div>
                  )}
                </motion.div>
              : searchQuery ?
                <motion.div
                  key="empty-search"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-1 flex-col">
                  <ScrollCenteredEmptyState>
                    <div className="text-center text-sm text-white/65">
                      No results for &quot;{searchQuery}&quot;
                    </div>
                  </ScrollCenteredEmptyState>
                </motion.div>
              : <motion.div
                  key="empty-other"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-1 flex-col">
                  {!currentGroup ?
                    <ScrollCenteredEmptyState>
                      <div className="flex flex-col items-center justify-center text-center">
                        <i className="fa-regular fa-folder-open mb-2 text-base text-white/20" />
                        <p className="text-xs text-white/50">Select a group to view records</p>
                      </div>
                    </ScrollCenteredEmptyState>
                  : effectiveRecordScope === "today" ?
                    <ScrollCenteredEmptyState>
                      <div className="flex flex-col items-center justify-center text-center">
                        <i className="fa-regular fa-clock mb-2 text-base text-white/20" />
                        <p className="text-xs text-white/50">No records today</p>
                      </div>
                    </ScrollCenteredEmptyState>
                  : groupMembers.length === 0 ?
                    <ScrollCenteredEmptyState>
                      <div className="flex flex-col items-center justify-center space-y-3 text-center">
                        <p className="text-xs text-white/50">This group has no members</p>
                        <button
                          onClick={handleOpenSettingsForEnrollment}
                          className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white">
                          <i className="fa-solid fa-user-plus text-xs"></i>
                          Add Member
                        </button>
                      </div>
                    </ScrollCenteredEmptyState>
                  : !groupMembers.some((m) => m.has_face_data) ?
                    <ScrollCenteredEmptyState>
                      <div className="flex flex-col items-center justify-center space-y-3 p-4 text-center">
                        <p className="text-xs text-white/50">No enrolled members</p>
                        <button
                          onClick={handleOpenSettingsForEnrollment}
                          className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white">
                          <i className="fa-solid fa-user-plus text-xs"></i>
                          Enroll Member
                        </button>
                      </div>
                    </ScrollCenteredEmptyState>
                  : <ScrollCenteredEmptyState>
                      <div className="flex flex-col items-center justify-center text-center">
                        <i className="fa-regular fa-calendar mb-2 text-base text-white/20" />
                        <p className="text-xs text-white/50">No records for this period</p>
                      </div>
                    </ScrollCenteredEmptyState>
                  }
                </motion.div>
              }
            </AnimatePresence>
          </div>)}
      <ManualEntryModal
        isOpen={showManualEntry}
        onClose={() => setShowManualEntry(false)}
        onSuccess={refreshAttendanceData}
        members={groupMembers}
        presentPersonIds={todayPresentPersonIds}
        onAddMember={handleOpenSettingsForEnrollment}
        currentGroup={currentGroup}
      />
      {recordToVoid && (
        <ManualCorrectionModal
          isOpen={isManualCorrectionOpen}
          record={recordToVoid}
          displayName={displayNameMap.get(recordToVoid.person_id) || "Member"}
          onClose={() => {
            setIsManualCorrectionOpen(false)
            setTimeout(() => {
              setRecordToVoid(null)
            }, 260)
          }}
          onVoided={refreshAttendanceData}
        />
      )}
    </div>
  )
})
