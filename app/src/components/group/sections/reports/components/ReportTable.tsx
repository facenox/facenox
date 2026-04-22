import { Fragment } from "react"
import type { RowData, ColumnKey } from "@/components/group/sections/reports/types"
import { parseLocalDate, formatDuration } from "@/utils"

interface ReportTableProps {
  groupedRows: Record<string, RowData[]>
  visibleColumns: ColumnKey[]
  allColumns: readonly { key: ColumnKey; label: string; align?: string }[]
  search?: string
  statusFilter?: string
  onResetSearch?: () => void
  onResetFilter?: () => void
}

export function ReportTable({
  groupedRows,
  visibleColumns,
  allColumns,
  search,
  statusFilter,
  onResetFilter,
}: ReportTableProps) {
  const visibleColDefs = allColumns.filter((c) => visibleColumns.includes(c.key))

  return (
    <div className="custom-scroll flex-1 overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10 bg-[rgba(16,21,28,0.98)]">
          <tr>
            {visibleColDefs.map((c, i) => {
              let alignClass = "text-left"
              if (c.align === "center") alignClass = "text-center"
              else if (c.align === "right") alignClass = "text-right"
              return (
                <th
                  key={c.key}
                  className={`border-b border-white/6 bg-[rgba(11,15,20,0.98)] px-4 py-2.5 text-[11px] font-medium text-white/40 ${alignClass} ${i === 0 ? "rounded-tl-xl" : ""} ${i === visibleColDefs.length - 1 ? "rounded-tr-xl" : ""}`}>
                  {c.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-sm">
          {(
            Object.keys(groupedRows).length === 0 ||
            Object.values(groupedRows).every((rows) => rows.length === 0)
          ) ?
            <tr>
              <td colSpan={visibleColDefs.length} className="py-24">
                <div className="flex flex-col items-center justify-center px-6 text-center">
                  <h3 className="mb-2 text-base font-bold text-white/80">
                    {search ?
                      `No matches for "${search}"`
                    : statusFilter !== "all" ?
                      `No results for "${statusFilter}"`
                    : "No results found"}
                  </h3>

                  <p className="mb-8 max-w-70 text-[11px] leading-relaxed font-medium text-white/40">
                    {search ?
                      "We couldn't find anything matching your search. Try a different keyword."
                    : statusFilter !== "all" ?
                      `None of the records currently match the "${statusFilter}" filter.`
                    : "There are no attendance records for this period."}
                  </p>

                  <div className="flex items-center gap-3">
                    {statusFilter !== "all" && (
                      <button
                        onClick={onResetFilter}
                        className="rounded-lg border border-white/6 bg-[rgba(22,28,36,0.64)] px-4 py-2 text-xs font-medium text-white/40 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white/80">
                        Reset Filter
                      </button>
                    )}
                    {!search && statusFilter === "all" && (
                      <div className="flex flex-col items-center gap-2">
                        <span className="mb-2 text-[11px] font-semibold text-white/40">
                          Suggestions
                        </span>
                        <div className="flex gap-2">
                          <span className="rounded-lg border border-white/6 bg-[rgba(22,28,36,0.64)] px-3 py-1.5 text-[11px] font-medium text-white/40">
                            Try Previous Week
                          </span>
                          <span className="rounded-lg border border-white/6 bg-[rgba(22,28,36,0.64)] px-3 py-1.5 text-[11px] font-medium text-white/40">
                            Expand Range
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </td>
            </tr>
          : Object.entries(groupedRows).map(([groupInfo, rows]) => {
              if (rows.length === 0) return null
              return (
                <Fragment key={groupInfo}>
                  {groupInfo !== "__all__" && (
                    <tr>
                      <td
                        colSpan={visibleColDefs.length}
                        className="border-b border-white/6 bg-[rgba(22,28,36,0.58)] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold tracking-wide text-cyan-100/90">
                            {groupInfo}
                          </span>
                          <span className="inline-flex items-center rounded-lg border border-white/6 bg-[rgba(12,16,22,0.82)] px-1.5 py-0.5 text-[11px] font-medium text-white/40">
                            {rows.length} {rows.length === 1 ? "record" : "records"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="group cursor-default transition-all duration-200 hover:bg-cyan-500/3">
                      {visibleColDefs.map((c, cIdx) => {
                        const val = row[c.key]
                        let content: React.ReactNode = val as string

                        if (c.key === "status") {
                          const s = row.status
                          let textColor = "text-white/40"
                          if (s === "present") textColor = "text-cyan-400"
                          if (s === "absent") textColor = "text-red-400"
                          if (s === "no_records") textColor = "text-white/30"

                          content = (
                            <div
                              className={`inline-flex items-center text-[11px] font-semibold ${textColor}`}>
                              {s === "no_records" ? "N/A" : s}
                            </div>
                          )
                        } else if (c.key === "is_late") {
                          content =
                            row.is_late ?
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400/80">
                                <i className="fa-solid fa-clock text-[9px]"></i>
                                Late
                              </div>
                            : <span className="text-white/10">-</span>
                        } else if (c.key === "check_in_time") {
                          if (row.check_in_time) {
                            content = (
                              <div className="flex flex-col">
                                <span className="font-medium text-white/90">
                                  {new Date(row.check_in_time).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {row.is_late && row.late_minutes > 0 && (
                                  <span className="mt-0.5 text-[11px] font-semibold text-amber-500/60">
                                    +{formatDuration(row.late_minutes)}
                                  </span>
                                )}
                              </div>
                            )
                          } else {
                            content = <span className="text-white/10">-</span>
                          }
                        } else if (c.key === "check_out_time") {
                          if (row.check_out_time) {
                            content = (
                              <div className="flex flex-col">
                                <span className="font-medium text-white/90">
                                  {new Date(row.check_out_time).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            )
                          } else {
                            content = <span className="text-white/10">-</span>
                          }
                        } else if (c.key === "total_hours") {
                          if (row.total_hours) {
                            const totalMins = Math.round(row.total_hours * 60)
                            content = (
                              <span className="font-medium whitespace-nowrap text-cyan-400/80">
                                {formatDuration(totalMins)}
                              </span>
                            )
                          } else {
                            content = <span className="text-white/10">-</span>
                          }
                        } else if (c.key === "late_minutes") {
                          content =
                            row.late_minutes > 0 ?
                              <span className="font-medium text-amber-400/80">
                                {formatDuration(row.late_minutes)}
                              </span>
                            : <span className="text-white/10">-</span>
                        } else if (c.key === "date") {
                          content = (
                            <span className="font-medium text-white/60">
                              {parseLocalDate(row.date).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          )
                        } else if (c.key === "name") {
                          content = (
                            <span className="font-semibold text-white">{val as string}</span>
                          )
                        }

                        // Cell alignment
                        let alignClass = "text-left"
                        if (c.align === "center") alignClass = "text-center"
                        else if (c.align === "right") alignClass = "text-right"

                        return (
                          <td
                            key={c.key}
                            className={`border-b border-white/5 px-4 py-3.5 whitespace-nowrap ${alignClass} ${cIdx === 0 ? "relative" : ""}`}>
                            {cIdx === 0 && (
                              <div className="absolute top-0 bottom-0 left-0 w-0.5 bg-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                            )}
                            {content}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              )
            })
          }
        </tbody>
      </table>
    </div>
  )
}
