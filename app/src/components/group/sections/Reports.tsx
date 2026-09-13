import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useGroupStore } from "@/components/group/stores"
import { getLocalDateString } from "@/utils"
import type { AttendanceGroup } from "@/types/recognition"

import { useReportData } from "@/components/group/sections/reports/hooks/useReportData"
import { useReportViews } from "@/components/group/sections/reports/hooks/useReportViews"
import { useReportTransform } from "@/components/group/sections/reports/hooks/useReportTransform"
import { ReportToolbar } from "@/components/group/sections/reports/components/ReportToolbar"
import { ReportTable } from "@/components/group/sections/reports/components/ReportTable"
import { exportReportToCSV } from "@/components/group/sections/reports/utils/exportUtils"
import { EmptyState } from "@/components/group/shared/EmptyState"
import { EditSessionModal } from "@/components/group/sections/reports/components/EditSessionModal"
import { attendanceManager } from "@/services/AttendanceManager"
import { updaterService } from "@/services"
import { DEFAULT_REMOTE_BASE_URL } from "@/services/syncDefaults"
import { Spinner } from "@/components/common"

import type { ColumnKey, RowData } from "@/components/group/sections/reports/types"

interface ReportsProps {
  group: AttendanceGroup
  onDaysTrackedChange?: (daysTracked: number, loading: boolean) => void
  onExportHandlersReady?: (handlers: { exportCSV: () => void }) => void
  onAddMember?: () => void
  isPaired?: boolean
}

const DEFAULT_COLUMNS = ["name", "date", "status", "check_in_time"] as unknown as ColumnKey[]

const CHECKOUT_DEFAULT_COLUMNS = [
  ...DEFAULT_COLUMNS,
  "check_out_time",
  "total_hours",
] as unknown as ColumnKey[]
const DEFAULT_COLUMN_PRESETS = [DEFAULT_COLUMNS, CHECKOUT_DEFAULT_COLUMNS]

export function Reports({
  group,
  onDaysTrackedChange,
  onExportHandlersReady,
  onAddMember,
  isPaired,
}: ReportsProps) {
  const storeMembers = useGroupStore((state) => state.members)
  const [editingRow, setEditingRow] = useState<RowData | null>(null)
  const [remoteBaseUrl, setRemoteBaseUrl] = useState("")

  useEffect(() => {
    if (!window.electronAPI?.sync) return

    const fetchConfig = () => {
      window.electronAPI.sync
        .getConfig()
        .then((c) => setRemoteBaseUrl(c.remoteBaseUrl || ""))
        .catch(console.error)
    }

    fetchConfig()

    const unsubscribe = window.electronAPI.sync.onDataChanged(() => {
      fetchConfig()
    })

    return unsubscribe
  }, [])

  const isCustomServer = Boolean(remoteBaseUrl && remoteBaseUrl.trim() !== DEFAULT_REMOTE_BASE_URL)
  const dashboardUrl = remoteBaseUrl?.trim() || DEFAULT_REMOTE_BASE_URL
  const dashboardLabel = isCustomServer ? "Open Dashboard" : "Open Facenox Cloud"

  // Stores enough context to undo the last correction within a short window
  const [undoToast, setUndoToast] = useState<{
    message: string
    // Snapshot of the row before correction, used to revert
    originalRow: RowData
  } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const defaultColumns = useMemo(
    () => (group.settings?.track_checkout ? CHECKOUT_DEFAULT_COLUMNS : DEFAULT_COLUMNS),
    [group.settings?.track_checkout],
  )

  const [reportStartDate, setReportStartDate] = useState<string>(getLocalDateString())
  const [reportEndDate, setReportEndDate] = useState<string>(getLocalDateString())

  const { report, sessions, members, loading, error, generateReport } = useReportData(
    group,
    storeMembers,
    reportStartDate,
    reportEndDate,
  )

  const {
    visibleColumns,
    setVisibleColumns,
    groupBy,
    setGroupBy,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    pageSize,
    setPageSize,
  } = useReportViews(group.id, defaultColumns, DEFAULT_COLUMN_PRESETS)

  const { groupedRows, daysTracked, allColumns } = useReportTransform(
    group,
    members,
    sessions,
    report,
    reportStartDate,
    reportEndDate,
    groupBy,
    statusFilter,
    search,
  )

  useEffect(() => {
    // Execute immediately on mount/change, no need for artificial delay
    generateReport()
  }, [generateReport])

  useEffect(() => {
    if (onDaysTrackedChange) {
      onDaysTrackedChange(daysTracked, loading)
    }
  }, [daysTracked, loading, onDaysTrackedChange])

  const handleExportCSV = useCallback(() => {
    exportReportToCSV(
      groupedRows,
      visibleColumns,
      allColumns,
      group.name,
      reportStartDate,
      reportEndDate,
    )
  }, [groupedRows, visibleColumns, allColumns, group.name, reportStartDate, reportEndDate])

  useEffect(() => {
    if (onExportHandlersReady && members.length > 0 && !loading) {
      onExportHandlersReady({
        exportCSV: handleExportCSV,
      })
    }
  }, [onExportHandlersReady, handleExportCSV, members.length, loading])

  return (
    <section className="flex h-full w-full flex-col overflow-hidden bg-transparent">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {loading ?
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <Spinner size="lg" className="mb-1" />
                <span className="text-sm font-medium text-white/65">Generating Report</span>
              </div>
            </motion.div>
          : !loading && members.length === 0 && !error ?
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-1 items-center justify-center">
              <EmptyState
                title="This group has no members"
                description={
                  isPaired ?
                    isCustomServer ?
                      "Members are managed on your custom server dashboard."
                    : "Members are managed in Facenox Cloud."
                  : "Generate custom attendance reports and export attendance data."
                }
                action={
                  isPaired ?
                    {
                      label: dashboardLabel,
                      onClick: () => updaterService.openReleasePage(dashboardUrl),
                      iconClass: "fa-solid fa-arrow-up-right-from-square text-[9px]",
                    }
                  : onAddMember ?
                    {
                      label: "Add Member",
                      onClick: onAddMember,
                      iconClass: "fa-solid fa-user-plus text-[10px]",
                    }
                  : undefined
                }
              />
            </motion.div>
          : <motion.div
              key="table"
              initial={{ opacity: 0, scale: 0.998 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
              <div className="shrink-0 px-10 pt-8">
                <ReportToolbar
                  startDate={reportStartDate}
                  endDate={reportEndDate}
                  onStartDateChange={setReportStartDate}
                  onEndDateChange={setReportEndDate}
                  visibleColumns={visibleColumns}
                  setVisibleColumns={setVisibleColumns}
                  groupBy={groupBy}
                  setGroupBy={setGroupBy}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  search={search}
                  setSearch={setSearch}
                  allColumns={allColumns}
                />
              </div>

              <ReportTable
                groupedRows={groupedRows}
                visibleColumns={visibleColumns}
                allColumns={allColumns}
                search={search}
                statusFilter={statusFilter}
                onResetFilter={() => setStatusFilter("all")}
                onResetDates={() => {
                  setReportStartDate(getLocalDateString())
                  setReportEndDate(getLocalDateString())
                }}
                onEditRow={setEditingRow}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                error={error}
              />
            </motion.div>
          }
        </AnimatePresence>
      </div>

      <EditSessionModal
        isOpen={!!editingRow}
        onClose={() => setEditingRow(null)}
        row={editingRow}
        group={group}
        onSuccess={(message, originalRow) => {
          setEditingRow(null)
          generateReport()

          // Clear any previous undo timer
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current)

          setUndoToast({ message, originalRow })
          undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000)
        }}
      />

      {/* ── Discord-style undo toast ─────────────────────────────────── */}
      <AnimatePresence>
        {undoToast && (
          <motion.div
            key="undo-toast"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
            // Pause auto-dismiss on hover
            onMouseEnter={() => {
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
            }}
            onMouseLeave={() => {
              undoTimerRef.current = setTimeout(() => setUndoToast(null), 3000)
            }}>
            <div className="flex items-center gap-3 rounded-lg bg-[rgba(30,32,36,0.97)] px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-white/8">
              <p className="text-[12px] font-medium text-white/80">{undoToast.message}</p>
              <div className="mx-1 h-3.5 w-px bg-white/10" />
              <button
                type="button"
                onClick={async () => {
                  const orig = undoToast.originalRow
                  setUndoToast(null)
                  try {
                    await attendanceManager.updateSession(orig.person_id, orig.date, {
                      status:
                        orig.status === "no_records" ?
                          "absent"
                        : (orig.status as "present" | "absent"),
                      notes: orig.notes || "Reverted by admin",
                      check_in_time: orig.check_in_time ? new Date(orig.check_in_time) : undefined,
                      check_out_time:
                        orig.check_out_time ? new Date(orig.check_out_time) : undefined,
                      is_late: orig.is_late,
                      late_minutes: orig.late_minutes,
                    })
                    generateReport()
                  } catch (e) {
                    console.error("Undo failed:", e)
                  }
                }}
                className="text-[12px] font-semibold text-white/60 transition-colors hover:text-white">
                Undo
              </button>
              <button
                type="button"
                onClick={() => setUndoToast(null)}
                className="text-white/25 transition-colors hover:text-white/50">
                <i className="fa-solid fa-xmark text-[10px]" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
