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
    <section className="mx-auto flex h-full w-full max-w-[900px] flex-col px-10 pt-4">
      {/* Activity Overview */}
      <section className="shrink-0">
        <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
          <div className="flex flex-col items-center">
            <StatsCard
              type="present"
              value={stats.present_today}
              total={stats.total_members}
              label="Present Today"
            />
          </div>
          <div className="flex flex-col items-center">
            <StatsCard
              type="absent"
              value={Math.max(0, (stats.total_members ?? 0) - (stats.present_today ?? 0))}
              total={stats.total_members}
              label="Missing Arrival"
            />
          </div>
          <div className="flex flex-col items-center">
            <StatsCard
              type="late"
              value={stats.late_today}
              label="Late Check-ins"
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
        <div className="mb-6 flex shrink-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-white">Activity Log</h2>
            <p className="mt-1 text-[13px] text-white/40">
              Recent attendance records for this group.
            </p>
          </div>

          <div className="group/search relative w-full max-w-sm">
            <div className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/30 transition-colors group-focus-within/search:text-white/60">
              <i className="fa-solid fa-magnifying-glass text-[12px]"></i>
            </div>
            <input
              type="text"
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              placeholder="Search records..."
              className="w-full rounded-md border-0 bg-white/5 py-2 pr-8 pl-8 text-[13px] font-medium text-white placeholder-white/30 transition-all outline-none focus:bg-white/10 focus:ring-1 focus:ring-white/20"
            />
            {activitySearch && (
              <button
                onClick={() => setActivitySearch("")}
                className="absolute top-1/2 right-2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-white/30 hover:bg-white/10 hover:text-white">
                <i className="fa-solid fa-xmark text-[10px]"></i>
              </button>
            )}
          </div>
        </div>

        <div className="custom-scroll flex-1 overflow-y-auto pr-2 pb-10 text-left">
          <div className="h-full">
            {recentRecords.length === 0 ?
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-transparent py-12 text-white/30">
                <i className="fa-solid fa-clock mb-3 text-2xl opacity-50" />
                <div className="text-[12px] font-medium">No activity yet</div>
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
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-white/40">
                            <i className="fa-regular fa-clock text-[10px]"></i>
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
          </div>
        </div>
      </section>
    </section>
  )
}
