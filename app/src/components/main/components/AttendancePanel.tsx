import { useState, useMemo, useEffect, memo, useCallback } from "react"
import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { createDisplayNameMap, getLocalDateString, formatDuration } from "@/utils"
import { Dropdown, Tooltip, MemberTooltip } from "@/components/shared"
import type { AttendanceGroup, AttendanceRecord, AttendanceMember } from "@/components/main/types"
import {
  buildRecordCheckInStatusMap,
  limitAttendanceRecords,
  processAttendanceRecords,
  type AttendanceRecordScope,
  type AttendanceSortField,
  type AttendanceSortOrder,
} from "@/components/main/components/attendancePanelUtils"

import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { ManualEntryModal } from "./ManualEntryModal"
import { ManualCorrectionModal } from "./ManualCorrectionModal"

interface AttendancePanelProps {
  handleSelectGroup: (group: AttendanceGroup) => void
  refreshAttendanceData: () => Promise<void>
}

const sidebarActionButtonClassName =
  "flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-[rgba(22,28,36,0.68)] text-white/45 transition-all duration-200 hover:bg-[rgba(28,35,44,0.82)] hover:text-white focus:border-white/20 focus:text-white focus:outline-none"

const sidebarDropdownIconButtonClassName =
  "h-9 w-full border border-white/10 bg-[rgba(22,28,36,0.68)] px-0 text-white/45 transition-all duration-200 hover:bg-[rgba(28,35,44,0.82)] hover:text-white focus:border-white/20 focus:text-white focus:outline-none"

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
              color: minutesLate > severeLateThreshold ? "text-red-400" : "text-amber-400",
              pillColor:
                minutesLate > severeLateThreshold ?
                  "bg-red-500/15 text-red-400 border-red-500/30"
                : "bg-amber-500/15 text-amber-400 border-amber-500/30",
              borderColor:
                minutesLate > severeLateThreshold ? "border-l-red-500" : "border-l-amber-500",
              avatarColor:
                minutesLate > severeLateThreshold ?
                  "bg-red-500/10 text-red-500/70"
                : "bg-amber-500/10 text-amber-500/70",
            }
          }

          if (diffMinutes < earlyThreshold) {
            const minutesEarly = Math.abs(diffMinutes)
            return {
              status: "early",
              minutes: minutesEarly,
              label: `${formatDuration(minutesEarly)} EARLY`,
              color: "text-cyan-400/80",
              pillColor: "bg-cyan-500/10 text-cyan-400/80 border-cyan-500/20",
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
          color: "text-white/40",
          pillColor: "bg-[rgba(22,28,36,0.62)] text-white/40 border-white/10",
          borderColor: "border-l-transparent",
          avatarColor: "bg-[rgba(22,28,36,0.62)] text-white/40",
        }
      } catch {
        return null
      }
    }

    const timeStatus = calculateTimeStatus()

    return (
      <MemberTooltip
        member={member}
        position="right"
        role={record.event_type === "check_out" ? "Exiting" : "Present"}>
        <div
          onMouseEnter={() => {
            if (onVoidManual) {
              setIsHovered(true)
            }
          }}
          onMouseLeave={() => setIsHovered(false)}
          className={`group relative border-b border-l-2 border-white/5 py-2.5 pr-3 pl-4 transition-colors hover:bg-[rgba(22,28,36,0.52)] ${timeStatus?.borderColor || "border-l-transparent"}`}>
          <div className="flex items-center gap-3 py-0.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/90">
              {displayName}
            </span>

            <div className="flex shrink-0 items-center gap-2">
              {timeStatus?.label && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-tight ${timeStatus.pillColor}`}>
                  {timeStatus.label}
                </span>
              )}

              <div className="flex items-center gap-0">
                <AnimatePresence initial={false}>
                  {isHovered && onVoidManual && (
                    <motion.div
                      key="remove-action"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 36, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-center justify-center overflow-hidden px-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          onVoidManual(record)
                        }}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-none bg-transparent p-0 text-red-500/40 shadow-none transition-all outline-none hover:bg-red-500/15 hover:text-red-400"
                        aria-label={`Remove manual attendance for ${displayName}`}>
                        <i className="fa-regular fa-trash-can text-[10px]"></i>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <span className="block w-[54px] text-right font-mono text-[11px] text-white/40 tabular-nums">
                  {record.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </MemberTooltip>
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
    isPanelRefreshing,
    isPanelSwitchPending,
    setShowGroupManagement,
  } = useAttendanceStore()

  const { setShowSettings, setGroupInitialSection } = useUIStore()
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

  const handleOpenSettingsForRegistration = useCallback(() => {
    setGroupInitialSection("members")
    setShowSettings(true)
  }, [setGroupInitialSection, setShowSettings])

  const [searchQuery, setSearchQuery] = useState("")
  const [recordScope, setRecordScope] = useState<AttendanceRecordScope>("today")
  const [sortField, setSortField] = useState<AttendanceSortField>("time")
  const [sortOrder, setSortOrder] = useState<AttendanceSortOrder>("desc")
  const [displayLimit, setDisplayLimit] = useState(20)
  const effectiveRecordScope: AttendanceRecordScope =
    recentAttendance.length === 0 ? "all" : recordScope

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [])

  const handleSortFieldChange = useCallback((field: AttendanceSortField | null) => {
    if (field) {
      setSortField(field)
      if (field === "time") {
        setSortOrder("desc")
      } else if (field === "name") {
        setSortOrder("asc")
      }
    }
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
      sortField,
      sortOrder,
    })
  }, [recentAttendance, displayNameMap, effectiveRecordScope, searchQuery, sortField, sortOrder])

  const visibleRecords = useMemo(() => {
    return limitAttendanceRecords(processedRecords, displayLimit)
  }, [processedRecords, displayLimit])

  const hasMore = processedRecords.length > displayLimit

  useEffect(() => {
    const timer = setTimeout(() => setDisplayLimit(20), 0)
    return () => clearTimeout(timer)
  }, [recordScope, searchQuery, sortField, sortOrder])

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
                options={attendanceGroups.map((group) => ({
                  value: group.id,
                  label: group.name,
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
                buttonClassName="text-xs h-9 border-r-0 rounded-r-none focus:ring-0! focus:border-white/20!"
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
        </div>
      : <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="text-center text-xs text-white/40">No groups created yet</div>
            <button
              onClick={() => setShowGroupManagement(true)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-xs text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
              <i className="fa-solid fa-plus text-xs"></i>
              Create Group
            </button>
          </div>
        </div>
      }

      {!isPanelLoading && !isPanelSwitchPending && recentAttendance.length > 0 && (
        <div className="shrink-0 px-3 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center">
              <div className="group/search relative h-9 flex-1 rounded-l-lg border border-r-0 border-white/10 bg-white/3">
                <i className="fa-solid fa-magnifying-glass pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[10px] text-white/20 transition-colors group-focus-within/search:text-cyan-400/60" />
                <input
                  type="text"
                  placeholder="Search name..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="h-full w-full border-0 bg-transparent pr-3 pl-8 text-xs text-white transition-all placeholder:text-white/20 focus:bg-white/6 focus:outline-none"
                />
              </div>

              <div className="shrink-0">
                <Tooltip
                  content={`Show: ${recordScope === "today" ? "Today" : "All records"}`}
                  position="top">
                  <Dropdown
                    className="w-9"
                    options={[
                      { value: "today", label: "Today" },
                      { value: "all", label: "All" },
                    ]}
                    value={recordScope}
                    onChange={(val) => handleRecordScopeChange(val as AttendanceRecordScope)}
                    trigger={
                      <span className="inline-flex h-4 w-4 items-center justify-center">
                        <i className={`fa-solid fa-calendar-day ${sidebarActionIconClassName}`} />
                      </span>
                    }
                    menuWidth={110}
                    buttonClassName={`${sidebarDropdownIconButtonClassName} rounded-none border-r-0`}
                    showPlaceholderOption={false}
                    allowClear={false}
                  />
                </Tooltip>
              </div>

              <div className="shrink-0">
                <Tooltip
                  content={`Sort: ${sortField === "time" ? "Latest" : "Name"}`}
                  position="top">
                  <Dropdown
                    className="w-9"
                    options={[
                      { value: "time", label: "Latest" },
                      { value: "name", label: "Name" },
                    ]}
                    value={sortField}
                    onChange={(val) => handleSortFieldChange(val as AttendanceSortField)}
                    trigger={
                      <span className="inline-flex h-4 w-4 items-center justify-center">
                        <i
                          className={`${
                            sortField === "time" ? "fa-solid fa-clock" : (
                              "fa-solid fa-arrow-down-a-z"
                            )
                          } ${sidebarActionIconClassName}`}
                        />
                      </span>
                    }
                    menuWidth={110}
                    buttonClassName={`${sidebarDropdownIconButtonClassName} rounded-r-lg rounded-l-none`}
                    showPlaceholderOption={false}
                    allowClear={false}
                  />
                </Tooltip>
              </div>
            </div>

            {isPanelRefreshing && (
              <div className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/8 px-3 text-[10px] font-semibold tracking-wide text-cyan-300/85 uppercase">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                Refreshing
              </div>
            )}
          </div>
        </div>
      )}

      {attendanceGroups.length > 0 &&
        (isPanelLoading ? <AttendanceListSkeleton showSearch={Boolean(currentGroup)} />
        : isPanelSwitchPending ? <div className="flex min-h-0 flex-1" />
        : <div className="hover-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
            {visibleRecords.length > 0 ?
              <>
                {(() => {
                  const recordCheckInStatus = buildRecordCheckInStatusMap(processedRecords)

                  return visibleRecords.map((record) => {
                    const displayName = displayNameMap.get(record.person_id) || "Unknown"
                    const hasCheckedInEarlier = recordCheckInStatus.get(record.id) ?? false
                    const member = memberMap.get(record.person_id)

                    return (
                      <AttendanceRecordItem
                        key={record.id}
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
                      className="w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] py-2 text-xs text-white/70 transition-colors hover:bg-[rgba(28,35,44,0.82)]">
                      Load More ({processedRecords.length - displayLimit} remaining)
                    </button>
                  </div>
                )}
              </>
            : searchQuery ?
              <ScrollCenteredEmptyState>
                <div className="text-center text-sm text-white/50">
                  No results for &quot;{searchQuery}&quot;
                </div>
              </ScrollCenteredEmptyState>
            : !currentGroup ?
              <ScrollCenteredEmptyState>
                <div className="text-center text-xs text-white/40">
                  Choose a group to see today&apos;s attendance logs
                </div>
              </ScrollCenteredEmptyState>
            : effectiveRecordScope === "today" ?
              <ScrollCenteredEmptyState>
                <div className="text-center text-xs text-white/40">
                  No attendance logs for today
                </div>
              </ScrollCenteredEmptyState>
            : groupMembers.length === 0 ?
              <ScrollCenteredEmptyState>
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="text-center text-xs text-white/40">
                    No members in this group yet
                  </div>
                  <button
                    onClick={handleOpenSettingsForRegistration}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-xs text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
                    <i className="fa-solid fa-user-plus text-xs"></i>
                    Add Member
                  </button>
                </div>
              </ScrollCenteredEmptyState>
            : !groupMembers.some((m) => m.has_face_data) ?
              <ScrollCenteredEmptyState>
                <div className="flex flex-col items-center justify-center space-y-3 p-4 text-center">
                  <div className="text-xs text-white/40">
                    No face biometric data registered yet.
                  </div>
                  <button
                    onClick={handleOpenSettingsForRegistration}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-xs text-white/50 transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
                    <i className="fa-solid fa-user-plus text-xs"></i>
                    Register Face
                  </button>
                </div>
              </ScrollCenteredEmptyState>
            : <ScrollCenteredEmptyState>
                <div className="text-center text-xs text-white/40">No attendance logs yet</div>
              </ScrollCenteredEmptyState>
            }
          </div>)}
      <ManualEntryModal
        isOpen={showManualEntry}
        onClose={() => setShowManualEntry(false)}
        onSuccess={refreshAttendanceData}
        members={groupMembers}
        presentPersonIds={todayPresentPersonIds}
        onAddMember={handleOpenSettingsForRegistration}
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
