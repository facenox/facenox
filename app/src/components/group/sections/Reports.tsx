import { useState, useEffect, useCallback } from "react"
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

import type { ColumnKey } from "@/components/group/sections/reports/types"

interface ReportsProps {
  group: AttendanceGroup
  onDaysTrackedChange?: (daysTracked: number, loading: boolean) => void
  onExportHandlersReady?: (handlers: { exportCSV: () => void }) => void
  onAddMember?: () => void
}

const DEFAULT_COLUMNS = [
  "name",
  "date",
  "status",
  "check_in_time",
  "check_out_time",
  "total_hours",
] as unknown as ColumnKey[]

export function Reports({
  group,
  onDaysTrackedChange,
  onExportHandlersReady,
  onAddMember,
}: ReportsProps) {
  const storeMembers = useGroupStore((state) => state.members)

  const [reportStartDate, setReportStartDate] = useState<string>(getLocalDateString())
  const [reportEndDate, setReportEndDate] = useState<string>(getLocalDateString())

  const { report, sessions, attendanceRecords, members, loading, error, generateReport } =
    useReportData(group, storeMembers, reportStartDate, reportEndDate)

  const {
    visibleColumns,
    setVisibleColumns,
    groupBy,
    setGroupBy,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
  } = useReportViews(group.id, DEFAULT_COLUMNS)

  const { groupedRows, daysTracked, allColumns } = useReportTransform(
    group,
    members,
    sessions,
    attendanceRecords || [],
    report,
    reportStartDate,
    reportEndDate,
    groupBy,
    statusFilter,
    search,
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      generateReport()
    }, 300)
    return () => clearTimeout(timer)
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
    <section className="custom-scroll flex h-full flex-col overflow-hidden p-6">
      <div className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        {error && (
          <div className="animate-in fade-in slide-in-from-top-2 rounded-lg border border-red-500/40 bg-red-600/20 px-4 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

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
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 rounded-full border-4 border-cyan-500/10"></div>
                  <div className="absolute inset-0 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent"></div>
                </div>
                <span className="text-sm font-medium tracking-wider text-white/40 uppercase">
                  Generating Report
                </span>
              </div>
            </motion.div>
          : !loading && members.length === 0 ?
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-1 items-center justify-center">
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
            </motion.div>
          : <motion.div
              key="table"
              initial={{ opacity: 0, scale: 0.998 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[rgba(17,22,29,0.96)]">
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
                defaultColumns={DEFAULT_COLUMNS}
                lateTrackingEnabled={true}
              />

              <ReportTable
                groupedRows={groupedRows}
                visibleColumns={visibleColumns}
                allColumns={allColumns}
                search={search}
                statusFilter={statusFilter}
                onResetSearch={() => setSearch("")}
                onResetFilter={() => setStatusFilter("all")}
              />
            </motion.div>
          }
        </AnimatePresence>
      </div>
    </section>
  )
}
