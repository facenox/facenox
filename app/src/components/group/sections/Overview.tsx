import { useState, useEffect, useCallback, useMemo } from "react"
import { attendanceManager } from "@/services"
import { createDisplayNameMap } from "@/utils"
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

export function Overview({ group, members, onAddMember }: OverviewProps) {
  const [stats, setStats] = useState<AttendanceStats | null>(null)
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([])
  const [activitySearch, setActivitySearch] = useState("")

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
    if (members.length === 0) {
      return
    }

    try {
      const [groupStats, records] = await Promise.all([
        attendanceManager.getGroupStats(group.id, new Date()),
        attendanceManager.getRecords({
          group_id: group.id,
          limit: 100,
        }),
      ])

      setStats(groupStats)
      setRecentRecords(records)
    } catch (err) {
      console.error("Error loading overview data:", err)
    }
  }, [group.id, members.length])

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
    <section className="custom-scroll flex h-full flex-col space-y-6 overflow-hidden overflow-y-auto p-6">
      <div className="grid shrink-0 grid-cols-1 divide-x divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-[rgba(12,16,22,0.96)] shadow-[0_16px_36px_rgba(0,0,0,0.22)] sm:grid-cols-3">
        <div className="px-8">
          <StatsCard
            type="present"
            value={stats.present_today}
            total={stats.total_members}
            label="Present Today"
          />
        </div>
        <div className="px-8">
          <StatsCard
            type="absent"
            value={Math.max(0, (stats.total_members ?? 0) - (stats.present_today ?? 0))}
            total={stats.total_members}
            label="Missing Arrival"
          />
        </div>
        <div className="px-8">
          <StatsCard
            type="late"
            value={stats.late_today}
            label="Late Check-ins"
            disabled={!(group.settings?.late_threshold_enabled ?? false)}
          />
        </div>
      </div>

      <div className="flex min-h-[400px] shrink-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[rgba(17,22,29,0.96)] shadow-[0_18px_42px_rgba(0,0,0,0.24)]">
        <div className="flex shrink-0 flex-col justify-between gap-4 border-b border-white/6 bg-[rgba(22,28,36,0.7)] p-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight text-white">
              <i className="fa-solid fa-clock-rotate-left text-xs text-cyan-500"></i>
              Activity Log
            </h3>
          </div>

          <div className="flex w-full shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center md:w-auto">
            <div className="group/search relative w-full sm:w-64">
              <i className="fa-solid fa-magnifying-glass pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[11px] text-white/35 transition-colors group-focus-within/search:text-cyan-400"></i>
              <input
                type="search"
                value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                placeholder="Search records..."
                className="w-full rounded-xl border border-white/10 bg-[rgba(10,13,18,0.9)] py-2 pr-3 pl-9 text-[11px] font-medium text-white transition-all duration-300 outline-none placeholder:text-white/25 focus:border-cyan-500/30 focus:bg-[rgba(20,25,32,0.82)] focus:ring-4 focus:ring-cyan-500/10"
              />
            </div>
          </div>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto p-4">
          <div className="h-full">
            {recentRecords.length === 0 ?
              <div className="flex h-full min-h-[250px] flex-1 flex-col items-center justify-center p-12">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                  <i className="fa-regular fa-clock text-xl text-white/20"></i>
                </div>
                <div className="text-xs font-bold text-white/60">No activity yet</div>
              </div>
            : filteredRecords.length === 0 ?
              <div className="mt-4 w-full rounded-lg border border-white/6 bg-[rgba(22,28,36,0.62)] px-6 py-8 text-center">
                <div className="text-xs text-white/40">
                  No results found for &quot;{activitySearch}&quot;
                </div>
              </div>
            : <div className="overflow-visible">
                {filteredRecords.slice(0, 50).map((record) => {
                  const displayName = displayNameMap.get(record.person_id) || "Unknown"

                  return (
                    <div
                      key={record.id}
                      className="group/item relative flex items-center justify-between rounded-lg border border-transparent px-3 py-2.5 transition-all hover:border-white/6 hover:bg-[rgba(22,28,36,0.52)]">
                      <div className="flex min-w-0 flex-1 flex-col justify-center">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[13px] font-bold tracking-tight text-white transition-colors group-hover:text-cyan-400">
                            {displayName}
                          </span>
                          <span className="ml-auto text-[11px] font-medium text-white/30">
                            {getRelativeTime(record.timestamp)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-white/35">
                            <i className="fa-regular fa-clock text-[10px] opacity-80"></i>
                            <span>{formatTime(record.timestamp)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right-side decorative arrow or status icon */}
                      <div className="ml-4 translate-x-2 text-white/20 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100">
                        <i className="fa-solid fa-chevron-right text-[10px]"></i>
                      </div>
                    </div>
                  )
                })}
              </div>
            }
          </div>
        </div>
      </div>
    </section>
  )
}
