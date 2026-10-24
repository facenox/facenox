import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UserPlus, X } from "lucide-react"
import { useGroupStore } from "@/components/group/stores"
import { getLocalDateString } from "@/utils"
import type { AttendanceGroup } from "@/types/recognition"

import { useReportData } from "@/components/group/sections/reports/hooks/useReportData"
import { useReportViews } from "@/components/group/sections/reports/hooks/useReportViews"
import { useReportTransform } from "@/components/group/sections/reports/hooks/useReportTransform"
import { ReportToolbar } from "@/components/group/sections/reports/components/ReportToolbar"
import { ReportTable } from "@/components/group/sections/reports/components/ReportTable"
import {
  exportReportToCSV,
  exportAllGroupsReportToCSV,
  exportAllGroupsReportToExcel,
  exportAllGroupsReportToIndividualCSVs,
} from "@/components/group/sections/reports/utils/exportUtils"
import { ExportAllGroupsModal, type ExportAllGroupsFormat } from "@/components/group/modals"
import { EmptyState } from "@/components/group/shared/EmptyState"
import { EditSessionModal } from "@/components/group/sections/reports/components/EditSessionModal"
import { attendanceManager } from "@/services/AttendanceManager"
import { Spinner } from "@/components/common"

import type { ColumnKey, RowData } from "@/components/group/sections/reports/types"

interface ReportsProps {
  group: AttendanceGroup
  onDaysTrackedChange?: (daysTracked: number, loading: boolean) => void
  onExportHandlersReady?: (handlers: {
    exportCSV: () => void
    exportAllGroupsCSV?: () => void
  }) => void
  onAddMember?: () => void
}

const DEFAULT_COLUMNS = ["name", "date", "status", "check_in_time"] as unknown as ColumnKey[]

const CHECKOUT_DEFAULT_COLUMNS = [
  ...DEFAULT_COLUMNS,
  "check_out_time",
  "departure_status",
  "total_hours",
] as unknown as ColumnKey[]

export function Reports({
  group,
  onDaysTrackedChange,
  onExportHandlersReady,
  onAddMember,
}: ReportsProps) {
  const storeMembers = useGroupStore((state) => state.members)
  const [editingRow, setEditingRow] = useState<RowData | null>(null)

  // Stores enough context to undo the last correction within a short window
  const [undoToast, setUndoToast] = useState<{
    message: string
    // Snapshot of the row before correction, used to revert
    originalRow: RowData
  } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const defaultColumns = useMemo(() => {
    const mode =
      group.settings?.attendance_mode ??
      (group.settings?.track_checkout ? "work_hours" : "attendance")
    if (mode === "visits") {
      return [...DEFAULT_COLUMNS, "visit_number", "check_out_time", "total_hours"] as ColumnKey[]
    }
    return mode === "work_hours" ? CHECKOUT_DEFAULT_COLUMNS : DEFAULT_COLUMNS
  }, [group.settings?.attendance_mode, group.settings?.track_checkout])
  const defaultColumnPresets = useMemo(() => [DEFAULT_COLUMNS, CHECKOUT_DEFAULT_COLUMNS], [])

  const [reportStartDate, setReportStartDate] = useState<string>(getLocalDateString())
  const [reportEndDate, setReportEndDate] = useState<string>(getLocalDateString())

  const { report, sessions, members, loading, error, generateReport } = useReportData(
    group,
    storeMembers,
    reportStartDate,
    reportEndDate,
  )

  const hasMembers = members.length > 0 || storeMembers.length > 0

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
  } = useReportViews(group.id, defaultColumns, defaultColumnPresets)

  const { groupedRows, daysTracked, allColumns, unavailableColumns } = useReportTransform(
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

  const modeVisibleColumns = useMemo(() => {
    const supportedColumns = new Set(allColumns.map((column) => column.key))
    const compatibleColumns = visibleColumns.filter((column) => supportedColumns.has(column))
    return compatibleColumns.length > 0 ? compatibleColumns : defaultColumns
  }, [allColumns, defaultColumns, visibleColumns])

  useEffect(() => {
    const timer = setTimeout(() => {
      generateReport()
    }, 250)
    return () => clearTimeout(timer)
  }, [generateReport])

  useEffect(() => {
    if (onDaysTrackedChange) {
      onDaysTrackedChange(daysTracked, loading)
    }
  }, [daysTracked, loading, onDaysTrackedChange])

  const [showExportAllModal, setShowExportAllModal] = useState(false)

  const handleExportCSV = useCallback(() => {
    exportReportToCSV(
      groupedRows,
      modeVisibleColumns,
      allColumns,
      group.name,
      reportStartDate,
      reportEndDate,
    )
  }, [groupedRows, modeVisibleColumns, allColumns, group.name, reportStartDate, reportEndDate])

  const handleOpenExportAllModal = useCallback(() => {
    setShowExportAllModal(true)
  }, [])

  const handleExecuteExportAll = useCallback(
    async (format: ExportAllGroupsFormat) => {
      const allGroups = useGroupStore.getState().groups
      if (format === "excel") {
        await exportAllGroupsReportToExcel(allGroups, reportStartDate, reportEndDate)
      } else if (format === "individual") {
        await exportAllGroupsReportToIndividualCSVs(allGroups, reportStartDate, reportEndDate)
      } else {
        await exportAllGroupsReportToCSV(allGroups, reportStartDate, reportEndDate)
      }
    },
    [reportStartDate, reportEndDate],
  )

  useEffect(() => {
    if (onExportHandlersReady && members.length > 0 && !loading) {
      onExportHandlersReady({
        exportCSV: handleExportCSV,
        exportAllGroupsCSV: handleOpenExportAllModal,
      })
    }
  }, [onExportHandlersReady, handleExportCSV, handleOpenExportAllModal, members.length, loading])

  return (
    <section className="flex h-full w-full flex-col overflow-hidden bg-transparent">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {hasMembers && (
          <div className="shrink-0 px-10 pt-8">
            <ReportToolbar
              startDate={reportStartDate}
              endDate={reportEndDate}
              onStartDateChange={setReportStartDate}
              onEndDateChange={setReportEndDate}
              visibleColumns={modeVisibleColumns}
              setVisibleColumns={setVisibleColumns}
              groupBy={groupBy}
              setGroupBy={setGroupBy}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              search={search}
              setSearch={setSearch}
              allColumns={allColumns}
              unavailableColumns={unavailableColumns}
            />
          </div>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {!hasMembers && !loading && !error ?
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-1 items-center justify-center">
                <EmptyState
                  title="This group has no members"
                  description="Add members to start generating reports and viewing attendance data."
                  action={
                    onAddMember ?
                      {
                        label: "Add member",
                        onClick: onAddMember,
                        icon: <UserPlus className="size-3" />,
                      }
                    : undefined
                  }
                />
              </motion.div>
            : loading ?
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Spinner size="lg" className="mb-1" />
                  <span className="text-sm font-medium text-white/65">Generating report</span>
                </div>
              </motion.div>
            : <motion.div
                key="table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
                <ReportTable
                  groupedRows={groupedRows}
                  visibleColumns={modeVisibleColumns}
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

      <ExportAllGroupsModal
        isOpen={showExportAllModal}
        onClose={() => setShowExportAllModal(false)}
        onExport={handleExecuteExportAll}
        groupCount={useGroupStore.getState().groups.filter((g) => g.id !== "all").length}
        dateRangeLabel={
          reportStartDate === reportEndDate ? reportStartDate : (
            `${reportStartDate} to ${reportEndDate}`
          )
        }
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
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#141518]/98 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
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
                      visit_number: orig.visit_number,
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
                <X className="size-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
