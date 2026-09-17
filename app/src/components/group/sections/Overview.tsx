import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useGroupStore } from "@/components/group/stores"
import { createDisplayNameMap, getLocalDateString } from "@/utils"
import { StatsCard, EmptyState } from "@/components/group/shared"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { Spinner } from "@/components/common"

interface OverviewProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  onAddMember?: () => void
  isPaired?: boolean
}

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))

const formatTime = (value: Date | string): string => {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

const formatDate = (value: Date | string): string => {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }
  const month = date.toLocaleDateString("en-US", { month: "short" })
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month} ${day}, ${year}`
}

const getRelativeTime = (value: Date | string): string => {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return "Just now"
  const diffInSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
  if (diffInSeconds < 60) return "Just now"
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) return `${diffInHours}h ago`
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) return `${diffInDays}d ago`
  return formatDate(date)
}

type DateFilter = "today" | "yesterday" | "week"

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
}

const getDateRange = (filter: DateFilter): { start: string; end: string } => {
  const now = new Date()
  const today = getLocalDateString(now)

  if (filter === "today") return { start: today, end: today }

  if (filter === "yesterday") {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const y = getLocalDateString(yesterday)
    return { start: y, end: y }
  }

  // This week: Monday to today
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  return { start: getLocalDateString(monday), end: today }
}

export function Overview({ group, members, onAddMember }: OverviewProps) {
  const fetchOverviewData = useGroupStore((state) => state.fetchOverviewData)
  const stats = useGroupStore((state) => state.overviewStats[group.id])

  const [activitySearch, setActivitySearch] = useState("")
  const [dateFilter, setDateFilter] = useState<DateFilter>("today")
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [shouldKeepExpanded, setShouldKeepExpanded] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (filterDropdownOpen) {
      if (isSearchFocused || activitySearch.trim().length > 0) {
        setShouldKeepExpanded(true)
      }
    } else {
      setShouldKeepExpanded(false)
    }
  }, [filterDropdownOpen, isSearchFocused, activitySearch])

  const isSearchExpanded = activitySearch.trim().length > 0 || isSearchFocused || shouldKeepExpanded
  const dropdownWidthClass =
    dateFilter === "today" ? "w-[98px]"
    : dateFilter === "yesterday" ? "w-[120px]"
    : "w-[130px]"

  const searchBarMaxWidthClass =
    isSearchExpanded ?
      dateFilter === "today" ? "max-w-[320px]"
      : dateFilter === "yesterday" ? "max-w-[340px]"
      : "max-w-[350px]"
    : dateFilter === "today" ? "max-w-[260px]"
    : dateFilter === "yesterday" ? "max-w-[280px]"
    : "max-w-[290px]"

  const { start, end } = useMemo(() => getDateRange(dateFilter), [dateFilter])
  const cacheKey = `${start}_${end}`

  const cachedRecords = useGroupStore((state) => state.overviewRecords[group.id]?.[cacheKey])
  const recentRecords = useMemo(() => cachedRecords || [], [cachedRecords])
  const recordsLoading = useGroupStore((state) => state.loading)

  useEffect(() => {
    if (stats) {
      setShowSpinner(false)
      return
    }

    setShowSpinner(true)
  }, [stats])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setFilterDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const displayNameMap = useMemo(() => {
    return createDisplayNameMap(members)
  }, [members])

  const filteredRecords = useMemo(() => {
    let result = recentRecords

    if (activitySearch.trim()) {
      const query = activitySearch.toLowerCase()
      result = result.filter((record) => {
        const name = (displayNameMap.get(record.person_id) || "Unknown").toLowerCase()
        return name.includes(query) || record.person_id.toLowerCase().includes(query)
      })
    }
    return result
  }, [recentRecords, activitySearch, displayNameMap])

  const loadOverviewData = useCallback(async () => {
    if (members.length === 0) return
    const { start, end } = getDateRange(dateFilter)
    await fetchOverviewData(group.id, start, end, false)
  }, [group.id, members.length, dateFilter, fetchOverviewData])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOverviewData()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadOverviewData])

  if (members.length === 0) {
    return (
      <EmptyState
        title="This group has no members"
        description="Add, edit, and remove members to manage profiles and attendance."
        action={
          onAddMember ?
            {
              label: "Add Member",
              onClick: onAddMember,
              iconClass: "fa-solid fa-user-plus text-[10px]",
            }
          : undefined
        }
      />
    )
  }

  if (!stats) {
    if (!showSpinner) {
      return <div className="h-full w-full bg-transparent" />
    }
    return (
      <div className="flex h-full w-full items-center justify-center py-32">
        <motion.div
          key="loading"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col items-center text-white/40">
          <Spinner size="lg" className="mb-4" />
          <div className="text-xs font-semibold tracking-wider text-white/55 uppercase">
            Loading Overview...
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <section className="flex h-full w-full flex-col px-10 pt-8">
      {/* Activity Overview */}
      <section className="shrink-0">
        <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-2">
          <div className="flex flex-col items-center">
            <StatsCard
              type="present"
              value={stats.present_today}
              total={stats.total_members}
              label="Present Today"
              tooltipText={
                <span>
                  Members who have checked in at least once today.{" "}
                  <span className="text-white/65">Resets at midnight.</span>
                </span>
              }
            />
            {(() => {
              const absent = Math.max(0, (stats.total_members ?? 0) - (stats.present_today ?? 0))
              return absent > 0 ?
                  <p className="mt-1.5 text-[11px] text-white/55">{absent} absent</p>
                : null
            })()}
          </div>
          <div className="flex flex-col items-center">
            <StatsCard
              type="late"
              value={stats.late_today}
              label="Late Arrivals"
              disabled={!(group.settings?.late_threshold_enabled ?? false)}
              disabledTooltipText={
                <span>
                  Late tracking is disabled. Go to{" "}
                  <span className="font-medium text-cyan-400">General</span> and enable{" "}
                  <span className="font-medium text-cyan-400">Late Tracking</span> to set a
                  threshold.
                </span>
              }
            />
          </div>
        </div>
      </section>

      {/* Activity Log */}
      <section className="mt-8 flex min-h-0 flex-1 flex-col">
        <div className="mb-6 flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold tracking-tight text-white">Activity Log</h2>
            <p className="mt-0.5 text-[12px] font-medium text-white/65">
              {DATE_FILTER_LABELS[dateFilter]}&apos;s records
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div
              className={`group/bar flex w-full items-center transition-all duration-300 ease-out ${searchBarMaxWidthClass}`}>
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
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 150)}
                  placeholder="Search..."
                  className="h-9 w-full rounded-l-lg rounded-r-none border border-r-0 border-white/5 bg-white/5 py-2 pr-7 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none group-focus-within/bar:border-white/20 placeholder:text-white/30 focus:bg-white/[0.08]"
                />
                {activitySearch && (
                  <button
                    onClick={() => setActivitySearch("")}
                    className="absolute top-1/2 right-2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-white/55 hover:text-white">
                    <i className="fa-solid fa-xmark text-[9px]" />
                  </button>
                )}
              </div>

              <div className="relative shrink-0" ref={filterDropdownRef}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setFilterDropdownOpen((o) => !o)}
                  className={`flex h-9 transform-gpu items-center justify-between gap-1.5 rounded-l-none rounded-r-lg border border-l-0 border-white/5 bg-white/5 px-2.5 text-[12px] font-semibold text-white/80 transition-colors duration-300 outline-none group-focus-within/bar:border-white/20 focus-within:bg-white/[0.08] hover:border-white/10 hover:bg-white/[0.08] focus:border-white/20 focus:bg-white/[0.08] ${dropdownWidthClass}`}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <i className="fa-regular fa-calendar text-[10px]" />
                    <span className="truncate">{DATE_FILTER_LABELS[dateFilter]}</span>
                  </span>
                  <i
                    className={`fa-solid fa-chevron-down shrink-0 text-[9px] text-white/55 transition-transform duration-150 ${filterDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence>
                  {filterDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute top-full right-0 z-50 mt-1.5 min-w-[128px] overflow-hidden rounded-lg border border-white/5 bg-[#0d1117]/95 p-1 shadow-xl">
                      {(["today", "yesterday", "week"] as DateFilter[]).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setDateFilter(filter)
                            setFilterDropdownOpen(false)
                          }}
                          className={`flex w-full items-center rounded px-3 py-1.5 text-left text-[12px] transition-all duration-150 ${
                            dateFilter === filter ?
                              "bg-cyan-500/10 font-semibold text-cyan-400"
                            : "text-white/65 hover:bg-white/5 hover:text-white"
                          }`}>
                          {DATE_FILTER_LABELS[filter]}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        <div
          className="custom-scroll relative flex-1 overflow-y-auto pr-2 pb-10 text-left"
          style={{
            maskImage: "linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)",
          }}>
          <AnimatePresence mode="wait">
            {recordsLoading ?
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center py-12 text-white/20">
                <Spinner size="sm" color="muted" />
              </motion.div>
            : <motion.div
                key={dateFilter}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex h-full min-h-[200px] flex-col">
                <AnimatePresence mode="wait">
                  {recentRecords.length === 0 ?
                    <EmptyState
                      key="no-activity"
                      title="No activity recorded"
                      description={`No attendance records found for ${
                        dateFilter === "today" ? "today"
                        : dateFilter === "yesterday" ? "yesterday"
                        : "this week"
                      }.`}
                      iconClass="fa-solid fa-clock text-2xl"
                    />
                  : filteredRecords.length === 0 ?
                    <EmptyState
                      key="no-results"
                      title="No results found"
                      description={`No activity matched "${activitySearch}"`}
                      iconClass="fa-solid fa-ghost text-2xl"
                    />
                  : <motion.div
                      key="results"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-1">
                      {filteredRecords.slice(0, 50).map((record, idx) => {
                        const displayName = displayNameMap.get(record.person_id) || "Unknown"

                        return (
                          <div
                            key={record.id || `record-${idx}`}
                            className="group/item flex items-center justify-between rounded-lg border border-transparent bg-transparent px-4 py-3 transition-colors hover:bg-white/[0.02]">
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col">
                                <span className="text-[13px] font-medium text-white transition-colors">
                                  {displayName}
                                </span>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-white/65">
                                  <i className="fa-regular fa-clock text-[10px] opacity-70"></i>
                                  <span>{formatTime(record.timestamp)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <span className="text-[12px] font-medium text-white/55">
                                {getRelativeTime(record.timestamp)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </motion.div>
                  }
                </AnimatePresence>
              </motion.div>
            }
          </AnimatePresence>
        </div>
      </section>
    </section>
  )
}
