import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { attendanceManager } from "@/services"
import { createDisplayNameMap } from "@/utils"
import { getLocalDateString } from "@/utils"
import { StatsCard, EmptyState } from "@/components/group/shared"
import type {
  AttendanceGroup,
  AttendanceMember,
  AttendanceStats,
  AttendanceRecord,
} from "@/types/recognition"

interface OverviewProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  onAddMember?: () => void
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
  const [stats, setStats] = useState<AttendanceStats | null>(null)
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([])
  const [activitySearch, setActivitySearch] = useState("")
  const [dateFilter, setDateFilter] = useState<DateFilter>("today")
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement>(null)

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
    try {
      const { start, end } = getDateRange(dateFilter)
      setRecordsLoading(true)
      const [groupStats, records] = await Promise.all([
        attendanceManager.getGroupStats(group.id, new Date()),
        attendanceManager.getRecords({
          group_id: group.id,
          start_date: start,
          end_date: end,
          limit: 100,
        }),
      ])
      setStats(groupStats)
      setRecentRecords(records)
    } catch (err) {
      console.error("Error loading overview data:", err)
    } finally {
      setRecordsLoading(false)
    }
  }, [group.id, members.length, dateFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadOverviewData()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadOverviewData])

  if (members.length === 0) {
    return (
      <EmptyState
        title="No members in this group yet"
        action={
          onAddMember ?
            {
              label: "Add Member",
              onClick: onAddMember,
            }
          : undefined
        }
      />
    )
  }

  if (!stats) {
    return (
      <section className="flex items-center justify-center py-12">
        <div className="text-sm text-white/40">Loading overview...</div>
      </section>
    )
  }

  return (
    <section className="mx-auto flex h-full w-full max-w-[900px] flex-col px-10 pt-4">
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
                  <span className="text-white/50">Resets at midnight.</span>
                </span>
              }
            />
            {(() => {
              const absent = Math.max(0, (stats.total_members ?? 0) - (stats.present_today ?? 0))
              return absent > 0 ?
                  <p className="mt-1.5 text-[11px] text-white/30">{absent} absent</p>
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
                  Late tracking is disabled. Click the{" "}
                  <span className="font-medium text-cyan-400">Attendance</span> tab in the sidebar
                  and enable <span className="font-medium text-cyan-400">Late Tracking</span> to set
                  a threshold.
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
            <p className="mt-0.5 text-[12px] font-medium text-white/50">
              {DATE_FILTER_LABELS[dateFilter]}&apos;s records
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Search */}
            <div className="group/search relative">
              <div className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-white/30 transition-colors group-focus-within/search:text-white/50">
                <i className="fa-solid fa-magnifying-glass text-[11px]"></i>
              </div>
              <input
                type="text"
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="Search..."
                className="w-36 rounded-md border-0 bg-white/5 py-1.5 pr-7 pl-7 text-[12px] text-white placeholder-white/30 transition-all outline-none focus:w-48 focus:bg-white/10 focus:ring-1 focus:ring-white/20"
              />
              {activitySearch && (
                <button
                  onClick={() => setActivitySearch("")}
                  className="absolute top-1/2 right-2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-white/30 hover:text-white">
                  <i className="fa-solid fa-xmark text-[9px]"></i>
                </button>
              )}
            </div>

            {/* Date filter dropdown */}
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={() => setFilterDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                <i className="fa-regular fa-calendar text-[10px]" />
                {DATE_FILTER_LABELS[dateFilter]}
                <i
                  className={`fa-solid fa-chevron-down text-[9px] text-white/30 transition-transform duration-150 ${filterDropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {filterDropdownOpen && (
                <div className="absolute top-full right-0 z-50 mt-1.5 min-w-[128px] overflow-hidden rounded-lg border border-white/10 bg-[rgba(18,22,30,0.97)] py-1 shadow-xl">
                  {(["today", "yesterday", "week"] as DateFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setDateFilter(filter)
                        setActivitySearch("")
                        setFilterDropdownOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                        dateFilter === filter ? "text-white" : (
                          "text-white/40 hover:bg-white/5 hover:text-white/80"
                        )
                      }`}>
                      <i
                        className={`fa-solid fa-check text-[9px] text-cyan-400 transition-opacity ${dateFilter === filter ? "opacity-100" : "opacity-0"}`}
                      />
                      {DATE_FILTER_LABELS[filter]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto pr-2 pb-10 text-left">
          <AnimatePresence mode="wait">
            {recordsLoading ?
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center py-12 text-white/20">
                <i className="fa-solid fa-circle-notch animate-spin text-lg" />
              </motion.div>
            : <motion.div
                key={dateFilter}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="h-full">
                {recentRecords.length === 0 ?
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-transparent py-12 text-white/30">
                    <i className="fa-solid fa-clock mb-3 text-2xl opacity-50" />
                    <div className="text-[12px] font-medium">
                      No records{" "}
                      {dateFilter === "today" ?
                        "today"
                      : dateFilter === "yesterday" ?
                        "yesterday"
                      : "this week"}
                    </div>
                  </div>
                : filteredRecords.length === 0 ?
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-transparent py-12 text-white/30">
                    <i className="fa-solid fa-ghost mb-3 text-2xl" />
                    <div className="text-[12px] font-medium">No results found</div>
                    <div className="mt-1 text-[11px]">
                      No activity matched &quot;{activitySearch}&quot;
                    </div>
                  </div>
                : <div className="space-y-1">
                    {filteredRecords.slice(0, 50).map((record) => {
                      const displayName = displayNameMap.get(record.person_id) || "Unknown"

                      return (
                        <div
                          key={record.id}
                          className="group/item flex items-center justify-between rounded-lg border border-transparent bg-transparent px-4 py-3 transition-colors hover:bg-white/[0.02]">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                              <span className="text-[13px] font-medium text-white transition-colors">
                                {displayName}
                              </span>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-white/60">
                                <i className="fa-regular fa-clock text-[10px] opacity-70"></i>
                                <span>{formatTime(record.timestamp)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className="text-[12px] font-medium text-white/30">
                              {getRelativeTime(record.timestamp)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                }
              </motion.div>
            }
          </AnimatePresence>
        </div>
      </section>
    </section>
  )
}
