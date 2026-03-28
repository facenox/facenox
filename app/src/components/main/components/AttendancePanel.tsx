import { useState, useMemo, useEffect, memo, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { createDisplayNameMap } from "@/utils"
import { Dropdown, Tooltip, MemberTooltip } from "@/components/shared"
import type { AttendanceGroup, AttendanceRecord, AttendanceMember } from "@/components/main/types"

import { useAttendanceStore, useUIStore } from "@/components/main/stores"
import { ManualEntryModal } from "./ManualEntryModal"

interface AttendancePanelProps {
  handleSelectGroup: (group: AttendanceGroup) => void
}

type SortField = "time" | "name"
type SortOrder = "asc" | "desc"

const SidebarTopSkeleton = memo(function SidebarTopSkeleton() {
  return (
    <div className="shrink-0 px-3 py-2 pb-1.5">
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
        <div className="shrink-0 px-3 pb-3">
          <div className="flex items-center">
            <div className="h-9 flex-1 rounded-l-lg border border-r-0 border-white/10 bg-white/4" />
            <div className="h-9 w-11 rounded-r-lg border border-white/10 bg-white/4" />
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
  }: {
    record: AttendanceRecord
    displayName: string
    member?: AttendanceMember | null
    classStartTime: string
    lateThresholdMinutes: number
    lateThresholdEnabled: boolean
    trackCheckoutEnabled: boolean
    hasCheckedInEarlier: boolean
  }) => {
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
              label: `${minutesLate}M LATE`,
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
              label: `${minutesEarly}M EARLY`,
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
            : "PRESENT",
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
              <span className="font-mono text-[11px] text-white/40 tabular-nums">
                {record.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
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
}: AttendancePanelProps) {
  const {
    attendanceGroups,
    currentGroup,
    recentAttendance,
    groupMembers,
    isShellReady,
    isPanelLoading,
    isPanelRefreshing,
    setShowGroupManagement,
  } = useAttendanceStore()

  const { setShowSettings, setGroupInitialSection } = useUIStore()
  const [showManualEntry, setShowManualEntry] = useState(false)

  const presentPersonIds = useMemo(() => {
    return new Set(recentAttendance.map((r) => r.person_id))
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
  const [sortField, setSortField] = useState<SortField>("time")
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [displayLimit, setDisplayLimit] = useState(20)

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [])

  const handleSortFieldChange = useCallback((field: SortField | null) => {
    if (field) {
      setSortField(field)
      if (field === "time") {
        setSortOrder("desc")
      } else if (field === "name") {
        setSortOrder("asc")
      }
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
    if (!recentAttendance.length) {
      return []
    }

    let filtered = [...recentAttendance]

    const normalizedQuery = searchQuery.trim().toLowerCase()
    const hasSearchQuery = normalizedQuery.length > 0

    if (hasSearchQuery) {
      const filteredArray: typeof filtered = []
      for (let i = 0; i < filtered.length; i++) {
        const record = filtered[i]
        const displayName = (displayNameMap.get(record.person_id) || "Unknown").toLowerCase()
        if (displayName.includes(normalizedQuery)) {
          filteredArray.push(record)
        }
      }
      filtered = filteredArray
    }

    if (sortField === "time") {
      filtered.sort((a, b) => {
        const timeA = a.timestamp.getTime()
        const timeB = b.timestamp.getTime()
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA
      })
    } else if (sortField === "name") {
      const nameCache = new Map<string, string>()
      filtered.sort((a, b) => {
        let nameA = nameCache.get(a.person_id)
        if (!nameA) {
          nameA = (displayNameMap.get(a.person_id) || "Unknown").toLowerCase()
          nameCache.set(a.person_id, nameA)
        }
        let nameB = nameCache.get(b.person_id)
        if (!nameB) {
          nameB = (displayNameMap.get(b.person_id) || "Unknown").toLowerCase()
          nameCache.set(b.person_id, nameB)
        }
        const comparison = nameA.localeCompare(nameB)
        return sortOrder === "asc" ? comparison : -comparison
      })
    }

    return filtered
  }, [recentAttendance, displayNameMap, searchQuery, sortField, sortOrder])

  const visibleRecords = useMemo(() => {
    return processedRecords.slice(0, displayLimit)
  }, [processedRecords, displayLimit])

  const hasMore = processedRecords.length > displayLimit

  useEffect(() => {
    const timer = setTimeout(() => setDisplayLimit(20), 0)
    return () => clearTimeout(timer)
  }, [searchQuery, sortField, sortOrder])

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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none border border-r-0 border-white/10 bg-[rgba(22,28,36,0.68)] text-white/50 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white focus:outline-none"
                aria-label="Create Group">
                <i className="fa-solid fa-plus text-sm"></i>
              </button>
            </Tooltip>
            <Tooltip content="Members" position="top">
              <button
                onClick={() => setShowManualEntry(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-l-none rounded-r-lg border border-white/10 bg-[rgba(22,28,36,0.68)] text-white/50 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white focus:outline-none"
                aria-label="Members">
                <i className="fa-solid fa-users text-sm"></i>
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

      {!isPanelLoading && recentAttendance.length > 0 && (
        <div className="shrink-0 px-3 pb-3">
          <div className="flex items-center gap-2">
            <div className="group/search relative flex-1">
              <i className="fa-solid fa-magnifying-glass pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[10px] text-white/20 transition-colors group-focus-within/search:text-cyan-400/60" />
              <input
                type="text"
                placeholder="Search name..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="h-9 w-full rounded-l-lg rounded-r-none border border-r-0 border-white/10 bg-white/3 pr-3 pl-8 text-xs text-white transition-all placeholder:text-white/20 focus:border-white/20 focus:bg-white/6 focus:outline-none"
              />
            </div>

            <div className="shrink-0">
              <Tooltip content={`Sort: ${sortField === "time" ? "Newest" : "A-Z"}`} position="top">
                <Dropdown
                  className="w-11"
                  options={[
                    { value: "time", label: "Newest" },
                    { value: "name", label: "A-Z" },
                  ]}
                  value={sortField}
                  onChange={(val) => handleSortFieldChange(val as SortField)}
                  trigger={
                    <i
                      className={`${
                        sortField === "time" ? "fa-regular fa-clock" : "fa-solid fa-arrow-down-a-z"
                      } pointer-events-auto text-xs text-white/30 transition-colors hover:text-cyan-400!`}
                    />
                  }
                  menuWidth={110}
                  buttonClassName="h-9 w-full bg-white/3 border border-l-0 border-white/10 rounded-r-lg rounded-l-none flex items-center justify-center hover:bg-white/[0.07] transition-all"
                  showPlaceholderOption={false}
                  allowClear={false}
                />
              </Tooltip>
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
        (isPanelLoading ?
          <AttendanceListSkeleton showSearch={Boolean(currentGroup)} />
        : <div className="hover-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
            {visibleRecords.length > 0 ?
              <>
                {(() => {
                  const checkedInSet = new Set<string>()
                  const chronologicalRecords = [...processedRecords].sort(
                    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
                  )

                  const recordCheckInStatus = new Map<string, boolean>()

                  chronologicalRecords.forEach((record) => {
                    const personId = record.person_id
                    const dateString = record.timestamp.toDateString()
                    const key = `${personId}_${dateString}`

                    if (!checkedInSet.has(key)) {
                      checkedInSet.add(key)
                      recordCheckInStatus.set(record.id, false)
                    } else {
                      recordCheckInStatus.set(record.id, true)
                    }
                  })

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
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <div className="text-center text-sm text-white/50">
                  No results for &quot;{searchQuery}&quot;
                </div>
              </div>
            : !currentGroup ?
              <div className="flex min-h-0 flex-1 items-center justify-center">
                <div className="text-center text-xs text-white/40">
                  Choose a group to see today&apos;s attendance logs
                </div>
              </div>
            : groupMembers.length === 0 ?
              <div className="flex min-h-0 flex-1 items-center justify-center">
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
              </div>
            : !groupMembers.some((m) => m.has_face_data) ?
              <div className="flex min-h-0 flex-1 items-center justify-center">
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
              </div>
            : <div className="flex min-h-0 flex-1 items-center justify-center">
                <div className="text-center text-xs text-white/40">No attendance logs yet</div>
              </div>
            }
          </div>)}
      <AnimatePresence>
        {showManualEntry && (
          <ManualEntryModal
            onClose={() => setShowManualEntry(false)}
            onSuccess={() => {
              // Optional: refreshed logic handled by store/websocket usually,
              // but we can force refresh if needed.
            }}
            members={groupMembers}
            presentPersonIds={presentPersonIds}
            onAddMember={handleOpenSettingsForRegistration}
            currentGroup={currentGroup}
          />
        )}
      </AnimatePresence>
    </div>
  )
})
