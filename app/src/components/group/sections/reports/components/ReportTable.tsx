import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { RowData, ColumnKey } from "@/components/group/sections/reports/types"
import { parseLocalDate, formatDuration } from "@/utils"
import { Tooltip, Dropdown } from "@/components/shared"
import { EmptyState } from "@/components/group/shared"

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
}

const COL_WIDTHS: Record<ColumnKey, string> = {
  name: "w-[240px] min-w-[200px]",
  date: "w-[140px] min-w-[140px]",
  status: "w-[100px] min-w-[100px]",
  check_in_time: "w-[120px] min-w-[120px]",
  check_out_time: "w-[120px] min-w-[120px]",
  total_hours: "w-[100px] min-w-[100px]",
  late_minutes: "w-[100px] min-w-[100px]",
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

function CellContent({ row, columnKey }: { row: RowData; columnKey: ColumnKey }): React.ReactNode {
  const val = row[columnKey]

  if (columnKey === "status") {
    const s = STATUS_STYLE[row.status] || STATUS_STYLE.no_records
    return (
      <div className={`inline-flex items-center text-[11px] font-semibold ${s.color}`}>
        {s.label}
      </div>
    )
  }

  if (columnKey === "is_late") {
    return row.is_late ?
        <span className="text-[11px] font-semibold text-orange-400/80">Late</span>
      : <span className="text-white/10">-</span>
  }

  if (columnKey === "check_in_time") {
    if (!row.check_in_time) return <span className="text-white/10">-</span>
    return (
      <div className="flex flex-col">
        <span className="font-medium text-white/90">
          {new Date(row.check_in_time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {row.is_late && row.late_minutes > 0 && (
          <span className="mt-0.5 text-[10px] font-semibold text-orange-500/75">
            {formatDuration(row.late_minutes)} Late
          </span>
        )}
      </div>
    )
  }

  if (columnKey === "check_out_time") {
    return row.check_out_time ?
        <div className="flex flex-col">
          <span className="font-medium text-white/90">
            {new Date(row.check_out_time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      : <span className="text-white/10">-</span>
  }

  if (columnKey === "total_hours") {
    if (!row.total_hours) return <span className="text-white/10">-</span>
    const totalMins = Math.round(row.total_hours * 60)
    return (
      <span className="font-medium whitespace-nowrap text-cyan-400/80">
        {formatDuration(totalMins)}
      </span>
    )
  }

  if (columnKey === "late_minutes") {
    return row.late_minutes > 0 ?
        <span className="font-medium text-orange-400/80">{formatDuration(row.late_minutes)}</span>
      : <span className="text-white/10">-</span>
  }

  if (columnKey === "date") {
    return (
      <span className="font-medium text-white/65">
        {parseLocalDate(row.date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    )
  }

  if (columnKey === "name") {
    return (
      <Tooltip content={val as string} position="top">
        <span className="block truncate font-semibold text-white">{val as string}</span>
      </Tooltip>
    )
  }

  if (columnKey === "notes") {
    if (!val) return <span className="text-white/10">-</span>
    const text = val as string
    const hasDivider = text.includes(" — ")
    if (hasDivider) {
      const [reason, note] = text.split(" — ")
      return (
        <div className="flex max-w-[280px] flex-col gap-0.5 leading-tight">
          <span className="text-[10px] font-bold tracking-wider text-cyan-400/80 uppercase">
            {reason}
          </span>
          <span className="text-[12px] font-medium break-words whitespace-normal text-white/55">
            {note}
          </span>
        </div>
      )
    }
    return (
      <span className="max-w-[280px] text-[12px] leading-relaxed font-medium break-words whitespace-normal text-white/60">
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
    const isInvalidRange = error === "The start date must be before the end date."
    return (
      <EmptyState
        title={isInvalidRange ? "Invalid date range" : "Unable to generate report"}
        description={error}
        iconClass="fa-solid fa-triangle-exclamation text-2xl text-red-400/80">
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
              className="mt-1 rounded-lg border border-white/6 bg-[rgba(22,28,36,0.64)] px-4 py-2 text-xs font-medium text-white/55 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white/80">
              Reset to Today
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
          `None of the records currently match the "${statusFilter}" filter.`
        : "There are no attendance records for this period."
      }
      iconClass={
        search ? "fa-solid fa-ghost text-2xl"
        : statusFilter && statusFilter !== "all" ?
          "fa-solid fa-calendar-xmark text-2xl"
        : "fa-solid fa-clipboard-question text-2xl"
      }>
      <div className="flex items-center gap-3">
        {statusFilter && statusFilter !== "all" && (
          <button
            onClick={onResetFilter}
            className="rounded-lg border border-white/6 bg-[rgba(22,28,36,0.64)] px-4 py-2 text-xs font-medium text-white/55 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white/80">
            Reset Filter
          </button>
        )}
        {!search && (!statusFilter || statusFilter === "all") && (
          <div className="flex flex-col items-center gap-2">
            <span className="mb-2 text-[11px] font-semibold text-white/55">Suggestions</span>
            <div className="flex gap-2">
              <span className="rounded-lg border border-white/6 bg-[rgba(22,28,36,0.64)] px-3 py-1.5 text-[11px] font-medium text-white/55">
                Try Previous Week
              </span>
              <span className="rounded-lg border border-white/6 bg-[rgba(22,28,36,0.64)] px-3 py-1.5 text-[11px] font-medium text-white/55">
                Expand Range
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
    <div className="flex shrink-0 items-center justify-between border-t border-white/6 bg-[rgba(16,21,28,0.98)] px-6 py-3">
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
              <i className="fa-solid fa-angles-left text-[10px]" />
            </button>
          </Tooltip>
          <Tooltip content="Previous page" position="top" offset={6}>
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              aria-label="Previous page"
              className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-25">
              <i className="fa-solid fa-chevron-left text-[10px]" />
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
              <i className="fa-solid fa-chevron-right text-[10px]" />
            </button>
          </Tooltip>
          <Tooltip content="Last page" position="top" offset={6}>
            <button
              type="button"
              onClick={() => onPageChange(totalPages - 1)}
              disabled={page >= totalPages - 1}
              aria-label="Last page"
              className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-25">
              <i className="fa-solid fa-angles-right text-[10px]" />
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
        result.push({ kind: "row", data: row, key: `${row.person_id}_${row.date}` })
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
              className="custom-scroll hover-scrollbar reports-scroll w-full max-w-full flex-1 overflow-x-auto overflow-y-auto px-10 pb-10"
              style={{
                maskImage:
                  "linear-gradient(to bottom, black calc(100% - 50px), transparent calc(100% - 10px), black calc(100% - 10px), black 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black calc(100% - 50px), transparent calc(100% - 10px), black calc(100% - 10px), black 100%)",
              }}>
              <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    {visibleColDefs.map((c) => (
                      <th
                        key={c.key}
                        className={`sticky top-0 z-10 border-b border-white/6 bg-[rgba(16,21,28,0.98)] px-4 py-3 text-[11px] font-medium text-white/55 ${alignClass(c.align)} ${COL_WIDTHS[c.key] || ""}`}>
                        {c.label}
                      </th>
                    ))}
                    {onEditRow && (
                      <th className="sticky top-0 z-10 w-14 border-b border-white/6 bg-[rgba(16,21,28,0.98)]" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => {
                    if (item.kind === "group") {
                      return (
                        <tr key={item.label}>
                          <td
                            colSpan={colCount}
                            className="border-b border-white/6 bg-[rgba(22,28,36,0.58)] px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold tracking-wide text-cyan-100/90">
                                {item.label}
                              </span>
                              <span className="inline-flex items-center rounded-lg border border-white/6 bg-[rgba(12,16,22,0.82)] px-1.5 py-0.5 text-[11px] font-medium text-white/55">
                                {item.count} {item.count === 1 ? "record" : "records"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    }

                    const row = item.data

                    return (
                      <tr
                        key={item.key}
                        className="group cursor-default transition-all duration-200 hover:bg-cyan-500/3">
                        {visibleColDefs.map((c, cIdx) => (
                          <td
                            key={c.key}
                            className={`border-b border-white/5 px-4 py-3.5 ${c.key !== "notes" && c.key !== "name" ? "whitespace-nowrap" : ""} ${alignClass(c.align)} ${COL_WIDTHS[c.key] || ""} ${cIdx === 0 ? "relative" : ""}`}>
                            {cIdx === 0 && (
                              <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                            )}
                            <CellContent row={row} columnKey={c.key} />
                          </td>
                        ))}
                        {onEditRow && (
                          <td className="w-14 border-b border-white/5 px-3 py-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onEditRow(row)}
                              className="p-1.5 text-white/20 opacity-0 transition-all group-hover:opacity-100 hover:text-white">
                              <i className="fa-solid fa-pen text-[12px]" />
                            </button>
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
