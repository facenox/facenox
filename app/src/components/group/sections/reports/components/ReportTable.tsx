import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Ghost,
  HelpCircle,
  Pencil,
} from "lucide-react"
import type { RowData, ColumnKey } from "@/components/group/sections/reports/types"
import { parseLocalDate, formatDuration } from "@/utils"
import { Tooltip, Dropdown } from "@/components/shared"
import { EmptyState } from "@/components/group/shared"
import { formatAttendanceTime } from "@/utils/attendanceTime"
import { DEPARTURE_LABELS } from "@/shared/departureStatus"

interface ReportTableProps {
  groupedRows: Record<string, RowData[]>
  visibleColumns: ColumnKey[]
  allColumns: readonly { key: ColumnKey; label: string; align?: string }[]
  search?: string
  statusFilter?: string
  onResetFilter?: () => void
  onResetDates?: () => void
  onEditRow?: (row: RowData) => void
  pageSize: number
  onPageSizeChange: (size: number) => void
  error?: string | null
  attendanceTimeZone?: string | null
}

const COL_WIDTHS: Record<ColumnKey, string> = {
  name: "w-[240px] min-w-[200px]",
  date: "w-[140px] min-w-[140px]",
  status: "w-[100px] min-w-[100px]",
  check_in_time: "w-[120px] min-w-[120px]",
  check_out_time: "w-[120px] min-w-[120px]",
  departure_status: "w-[170px] min-w-[170px]",
  visit_number: "w-[80px] min-w-[80px]",
  total_hours: "w-[100px] min-w-[100px]",
  late_minutes: "w-[120px] min-w-[120px]",
  is_late: "w-[100px] min-w-[100px]",
  notes: "w-[300px] min-w-[250px]",
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  present: { color: "text-cyan-400", label: "Present" },
  late: { color: "text-orange-400", label: "Late" },
  absent: { color: "text-red-400", label: "Absent" },
  no_records: { color: "text-white/55", label: "N/A" },
}

const PAGE_SIZES = [25, 50, 100]

type FlatItem =
  { kind: "group"; label: string; count: number } | { kind: "row"; data: RowData; key: string }

function alignClass(align?: string) {
  if (align === "center") return "text-center"
  if (align === "right") return "text-right"
  return "text-left"
}

function MissingValue() {
  return <span className="font-normal text-white/35">-</span>
}

function ReportName({ name }: { name: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      const text = container.firstElementChild as HTMLElement | null
      setIsTruncated(!!text && text.scrollWidth - text.clientWidth > 1)
    }

    measure()
    // Observe a stable container because the tooltip mounts only for overflow.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined
    const fonts = document.fonts
    observer?.observe(container)
    if (!observer) window.addEventListener("resize", measure)
    fonts?.addEventListener("loadingdone", measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
      fonts?.removeEventListener("loadingdone", measure)
    }
  }, [name])

  const text = (
    <span
      tabIndex={isTruncated ? 0 : undefined}
      className="block truncate font-semibold text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
      {name}
    </span>
  )

  return (
    <div ref={containerRef} className="min-w-0">
      {isTruncated ?
        <Tooltip content={name} position="top" onlyWhenTruncated>
          {text}
        </Tooltip>
      : text}
    </div>
  )
}

function CellContent({
  row,
  columnKey,
  attendanceTimeZone,
}: {
  row: RowData
  columnKey: ColumnKey
  attendanceTimeZone?: string | null
}): React.ReactNode {
  const val = row[columnKey]

  if (columnKey === "status") {
    const s = STATUS_STYLE[row.status] || STATUS_STYLE.no_records
    return <div className={`inline-flex items-center font-semibold ${s.color}`}>{s.label}</div>
  }

  if (columnKey === "is_late") {
    return row.is_late ?
        <span className="font-semibold text-orange-400">Late</span>
      : <MissingValue />
  }

  if (columnKey === "check_in_time") {
    if (!row.check_in_time) return <MissingValue />
    return (
      <div className="flex flex-col">
        <span className="tabular-nums">
          {formatAttendanceTime(
            row.check_in_time,
            row.session?.check_in_time_timezone || attendanceTimeZone,
          )}
        </span>
        {row.is_late && row.late_minutes > 0 && (
          <span className="mt-0.5 text-[11px] text-orange-400/90 tabular-nums">
            {formatDuration(row.late_minutes)} late
          </span>
        )}
      </div>
    )
  }

  if (columnKey === "visit_number") {
    return row.visit_number ?
        <span className="tabular-nums">{row.visit_number}</span>
      : <MissingValue />
  }

  if (columnKey === "check_out_time") {
    return row.check_out_time ?
        <div className="flex flex-col">
          <span className="tabular-nums">
            {formatAttendanceTime(
              row.check_out_time,
              row.session?.check_out_time_timezone || attendanceTimeZone,
            )}
          </span>
        </div>
      : <MissingValue />
  }

  if (columnKey === "departure_status") {
    if (!row.departure_status) return <MissingValue />
    const color =
      row.departure_status === "early" ? "text-orange-400/80"
      : row.departure_status === "after_schedule" ? "text-cyan-400/80"
      : "text-white/70"
    return <span className={color}>{DEPARTURE_LABELS[row.departure_status]}</span>
  }

  if (columnKey === "total_hours") {
    if (row.total_hours == null) return <MissingValue />
    const totalMins = Math.round(row.total_hours * 60)
    return <span className="whitespace-nowrap tabular-nums">{formatDuration(totalMins)}</span>
  }

  if (columnKey === "late_minutes") {
    return row.late_minutes > 0 ?
        <span className="text-orange-400/80 tabular-nums">{formatDuration(row.late_minutes)}</span>
      : <MissingValue />
  }

  if (columnKey === "date") {
    return (
      <span className="text-white/70 tabular-nums">
        {parseLocalDate(row.date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    )
  }

  if (columnKey === "name") {
    return <ReportName name={val as string} />
  }

  if (columnKey === "notes") {
    if (!val) return <MissingValue />
    const text = val as string
    const divider = " — "
    const dividerIndex = text.indexOf(divider)
    if (dividerIndex >= 0) {
      const reason = text.slice(0, dividerIndex)
      const note = text.slice(dividerIndex + divider.length)
      return (
        <div className="flex max-w-[280px] flex-col gap-0.5 leading-tight">
          <span className="text-[11px] font-medium tracking-wide text-white/55 uppercase">
            {reason}
          </span>
          <span className="font-normal break-words whitespace-normal text-white/70">{note}</span>
        </div>
      )
    }
    return (
      <span className="block max-w-[280px] leading-relaxed font-normal break-words whitespace-normal text-white/70">
        {text}
      </span>
    )
  }

  return <>{val as string}</>
}

function EmptyTableState({
  search,
  statusFilter,
  onResetFilter,
  onResetDates,
  error,
}: {
  search?: string
  statusFilter?: string
  onResetFilter?: () => void
  onResetDates?: () => void
  error?: string | null
}) {
  if (error) {
    const isInvalidRange = error === "The start date must be on or before the end date."
    return (
      <EmptyState
        title={isInvalidRange ? "Invalid date range" : "Unable to generate report"}
        description={error}
        icon={<AlertTriangle className="size-8 text-red-400/80" />}>
        <div className="flex flex-col items-center gap-3">
          {!isInvalidRange && (
            <span className="text-[11px] font-semibold text-white/55">
              Check the error details or try resetting your filters.
            </span>
          )}
          {isInvalidRange && onResetDates && (
            <button
              type="button"
              onClick={onResetDates}
              className="mt-1 rounded-lg border border-white/6 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/55 transition-all hover:bg-white/[0.08] hover:text-white/80">
              Reset to today
            </button>
          )}
        </div>
      </EmptyState>
    )
  }

  return (
    <EmptyState
      title={
        search ? "No results found"
        : statusFilter && statusFilter !== "all" ?
          `No results for "${statusFilter}"`
        : "No results found"
      }
      description={
        search ? `No records matched "${search}"`
        : statusFilter && statusFilter !== "all" ?
          `No records match the "${statusFilter}" filter.`
        : "There are no attendance records for this period."
      }
      icon={
        search ? <Ghost className="size-8" />
        : statusFilter && statusFilter !== "all" ?
          <CalendarX className="size-8" />
        : <HelpCircle className="size-8" />
      }>
      <div className="flex items-center gap-3">
        {statusFilter && statusFilter !== "all" && (
          <button
            onClick={onResetFilter}
            className="rounded-lg border border-white/6 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/55 transition-all hover:bg-white/[0.08] hover:text-white/80">
            Reset filter
          </button>
        )}
        {!search && (!statusFilter || statusFilter === "all") && (
          <div className="flex flex-col items-center gap-2">
            <span className="mb-2 text-[11px] font-semibold text-white/55">Suggestions</span>
            <div className="flex gap-2">
              <span className="rounded-lg border border-white/6 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/55">
                Try previous week
              </span>
              <span className="rounded-lg border border-white/6 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/55">
                Expand range
              </span>
            </div>
          </div>
        )}
      </div>
    </EmptyState>
  )
}

function TablePagination({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  if (totalItems <= pageSize) return null

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-white/6 bg-[#0f1011] px-6 py-3">
      <div className="flex items-center gap-2 text-[11px] text-white/55">
        <span className="flex h-7 items-center">{totalItems} records</span>
        <Dropdown
          options={PAGE_SIZES.map((s) => ({ value: s, label: `${s} / page` }))}
          value={pageSize}
          onChange={(v) => v && onPageSizeChange(Number(v))}
          showPlaceholderOption={false}
          allowClear={false}
          menuWidth={100}
          align="center"
          buttonClassName="!h-7 !py-0 !text-[11px]"
        />
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Tooltip content="First page" position="top" offset={6}>
            <button
              type="button"
              onClick={() => onPageChange(0)}
              disabled={page === 0}
              aria-label="First page"
              className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-25">
              <ChevronsLeft className="size-3" />
            </button>
          </Tooltip>
          <Tooltip content="Previous page" position="top" offset={6}>
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              aria-label="Previous page"
              className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-25">
              <ChevronLeft className="size-3" />
            </button>
          </Tooltip>
          <motion.span
            key={`page-label-${page}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="flex h-7 items-center px-2 text-[11px] font-medium text-white/60 select-none">
            Page <span className="mx-1 font-semibold text-white/90">{page + 1}</span> of{" "}
            <span className="ml-1 font-semibold text-white/90">{totalPages}</span>
          </motion.span>
          <Tooltip content="Next page" position="top" offset={6}>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-25">
              <ChevronRight className="size-3" />
            </button>
          </Tooltip>
          <Tooltip content="Last page" position="top" offset={6}>
            <button
              type="button"
              onClick={() => onPageChange(totalPages - 1)}
              disabled={page >= totalPages - 1}
              aria-label="Last page"
              className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-25">
              <ChevronsRight className="size-3" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

export function ReportTable({
  groupedRows,
  visibleColumns,
  allColumns,
  search,
  statusFilter,
  onResetFilter,
  onResetDates,
  onEditRow,
  pageSize,
  onPageSizeChange,
  error,
  attendanceTimeZone,
}: ReportTableProps) {
  const [page, setPage] = useState(0)

  const visibleColDefs = useMemo(
    () => allColumns.filter((c) => visibleColumns.includes(c.key)),
    [allColumns, visibleColumns],
  )

  useEffect(() => {
    setPage(0)
  }, [groupedRows])

  const items = useMemo(() => {
    const result: FlatItem[] = []
    for (const [groupInfo, rows] of Object.entries(groupedRows)) {
      if (rows.length === 0) continue
      if (groupInfo !== "__all__") {
        result.push({ kind: "group", label: groupInfo, count: rows.length })
      }
      for (const row of rows) {
        result.push({
          kind: "row",
          data: row,
          key: `row:${row.session?.id || `${row.person_id}_${row.date}_${row.visit_number || 1}`}`,
        })
      }
    }
    return result
  }, [groupedRows])

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = useMemo(
    () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize],
  )

  const colCount = visibleColDefs.length + (onEditRow ? 1 : 0)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {items.length === 0 || error ?
          <motion.div
            key="empty-state"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="custom-scroll hover-scrollbar reports-scroll flex w-full max-w-full flex-1 flex-col items-center justify-center overflow-auto px-10 pb-10">
            <EmptyTableState
              search={search}
              statusFilter={statusFilter}
              onResetFilter={onResetFilter}
              onResetDates={onResetDates}
              error={error}
            />
          </motion.div>
        : <motion.div
            key={`page-${safePage}-${pageSize}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex flex-1 flex-col overflow-hidden">
            <div
              className="custom-scroll hover-scrollbar reports-scroll mx-10 min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto pb-10"
              style={{
                maskImage:
                  "linear-gradient(to bottom, black calc(100% - 50px), transparent calc(100% - 10px), black calc(100% - 10px), black 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black calc(100% - 50px), transparent calc(100% - 10px), black calc(100% - 10px), black 100%)",
              }}>
              <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-left text-[13px] leading-5 font-medium text-white/85">
                <thead>
                  <tr>
                    {visibleColDefs.map((c) => (
                      <th
                        key={c.key}
                        className={`sticky top-0 border-b border-white/6 bg-[#0f1011] px-4 py-3 text-xs font-medium text-white/55 ${alignClass(c.align)} ${COL_WIDTHS[c.key] || ""} ${c.key === "name" ? "left-0 z-30 shadow-[1px_0_0_0_rgba(255,255,255,0.06)]" : "z-20"}`}>
                        {c.key === "departure_status" ?
                          <Tooltip content="Compares time-out with the session's recorded schedule at minute precision. This does not measure total hours worked.">
                            <span tabIndex={0} className="cursor-help">
                              {c.label}
                            </span>
                          </Tooltip>
                        : c.label}
                      </th>
                    ))}
                    {onEditRow && (
                      <th
                        scope="col"
                        className="sticky top-0 right-0 z-30 w-14 border-b border-white/6 bg-[#0f1011] shadow-[-1px_0_0_0_rgba(255,255,255,0.06)]">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => {
                    if (item.kind === "group") {
                      return (
                        <tr key={`group:${item.label}`}>
                          <td
                            colSpan={colCount}
                            className="border-b border-white/6 bg-white/[0.03] px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold tracking-wide text-white/80">
                                {item.label}
                              </span>
                              <span className="inline-flex items-center rounded-lg border border-white/6 bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-white/55">
                                {item.count} {item.count === 1 ? "record" : "records"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    const row = item.data
                    const correctionDate = parseLocalDate(row.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                    const visitLabel =
                      row.visit_number && row.visit_number > 1 ? `, visit ${row.visit_number}` : ""
                    const correctionLabel = `Correct attendance for ${row.name} on ${correctionDate}${visitLabel}`

                    return (
                      <tr
                        key={item.key}
                        className="group cursor-default bg-[#0f1011] transition-colors duration-200 focus-within:bg-[#101719] hover:bg-[#101719]">
                        {visibleColDefs.map((c, cIdx) => (
                          <td
                            key={c.key}
                            className={`border-b border-white/5 px-4 py-3.5 ${c.key !== "notes" && c.key !== "name" ? "whitespace-nowrap" : ""} ${alignClass(c.align)} ${COL_WIDTHS[c.key] || ""} ${
                              c.key === "name" ?
                                "sticky left-0 z-10 bg-inherit shadow-[1px_0_0_0_rgba(255,255,255,0.06)]"
                              : cIdx === 0 ? "relative"
                              : ""
                            }`}>
                            {cIdx === 0 && (
                              <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                            )}
                            <CellContent
                              row={row}
                              columnKey={c.key}
                              attendanceTimeZone={attendanceTimeZone}
                            />
                          </td>
                        ))}
                        {onEditRow && (
                          <td className="sticky right-0 z-10 w-14 border-b border-white/5 bg-inherit px-3 py-3.5 text-center whitespace-nowrap shadow-[-1px_0_0_0_rgba(255,255,255,0.06)]">
                            <Tooltip content="Correct attendance">
                              <button
                                type="button"
                                aria-label={correctionLabel}
                                onClick={() => onEditRow(row)}
                                className="inline-flex size-8 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/8 hover:text-white focus-visible:bg-white/8 focus-visible:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">
                                <Pencil className="size-3.5" aria-hidden="true" />
                              </button>
                            </Tooltip>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={items.length}
              onPageChange={setPage}
              onPageSizeChange={onPageSizeChange}
            />
          </motion.div>
        }
      </AnimatePresence>
    </div>
  )
}
