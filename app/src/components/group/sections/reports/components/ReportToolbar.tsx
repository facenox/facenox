import { useState, useRef, useEffect } from "react"
import { Dropdown, Tooltip } from "@/components/shared"
import type {
  ColumnKey,
  GroupByKey,
  ReportStatusFilter,
} from "@/components/group/sections/reports/types"

interface ReportToolbarProps {
  startDate: string
  endDate: string
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void

  visibleColumns: ColumnKey[]
  setVisibleColumns: (cols: ColumnKey[]) => void
  groupBy: GroupByKey
  setGroupBy: (key: GroupByKey) => void
  statusFilter: ReportStatusFilter
  setStatusFilter: (filter: ReportStatusFilter) => void
  search: string
  setSearch: (val: string) => void

  allColumns: readonly { key: ColumnKey; label: string }[]
}

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
] as const

const GROUP_OPTIONS = [
  { value: "none", label: "None" },
  { value: "person", label: "Person" },
  { value: "date", label: "Date" },
] as const

export function ReportToolbar({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  visibleColumns,
  setVisibleColumns,
  groupBy,
  setGroupBy,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  allColumns,
}: ReportToolbarProps) {
  const [showOptions, setShowOptions] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const optionsRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  const finalStatusOptions = STATUS_OPTIONS

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false)
      }
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilter(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-white/5 px-4 py-2.5">
      {/* Date Range */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip content="Start date" position="bottom">
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="min-w-[110px] cursor-pointer rounded-lg border border-white/10 bg-[rgba(22,28,36,0.62)] px-2 py-1 text-[11px] font-medium text-white/60 transition-all duration-300 outline-none focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
            style={
              {
                colorScheme: "dark",
                fieldSizing: "content",
              } as React.CSSProperties
            }
          />
        </Tooltip>
        <span className="px-1 text-[11px] font-bold text-white/35">To</span>
        <Tooltip content="End date" position="bottom">
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="min-w-[110px] cursor-pointer rounded-lg border border-white/10 bg-[rgba(22,28,36,0.62)] px-2 py-1 text-[11px] font-medium text-white/60 transition-all duration-300 outline-none focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
            style={
              {
                colorScheme: "dark",
                fieldSizing: "content",
              } as React.CSSProperties
            }
          />
        </Tooltip>
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Right Controls ── */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Search */}
        <div className="relative">
          <i className="fa-solid fa-magnifying-glass absolute top-1/2 left-2.5 -translate-y-1/2 text-[9px] text-white/20" />
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-36 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.62)] py-1.5 pr-3 pl-7 text-[11px] font-medium text-white transition-all duration-300 outline-none placeholder:text-white/25 focus:w-52 focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
          />
        </div>

        {/* Filter */}
        <div className="relative" ref={filterRef}>
          <Tooltip
            content={
              statusFilter !== "all" ?
                `Filter: ${STATUS_OPTIONS.find((s) => s.value === statusFilter)?.label}`
              : "Filter"
            }
            position="bottom">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`relative flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                showFilter || statusFilter !== "all" ?
                  "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
                : "border-white/6 bg-[rgba(22,28,36,0.62)] text-white/35 hover:text-white/60"
              }`}>
              <i className="fa-solid fa-filter text-[10px]" />
              {statusFilter !== "all" && (
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-cyan-400" />
              )}
            </button>
          </Tooltip>

          {showFilter && (
            <div className="animate-in fade-in zoom-in-95 absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-lg border border-white/10 bg-[rgba(15,19,25,0.98)] duration-100">
              {finalStatusOptions.map(({ value: st, label }) => (
                <button
                  key={st}
                  onClick={() => {
                    setStatusFilter(st as ReportStatusFilter)
                    setShowFilter(false)
                  }}
                  className={`w-full border-0 px-3 py-1.5 text-left text-[11px] font-medium transition-colors ${
                    statusFilter === st ?
                      "bg-cyan-500/10 text-cyan-400"
                    : "text-white/50 hover:bg-[rgba(22,28,36,0.62)] hover:text-white"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="relative" ref={optionsRef}>
          <Tooltip content="Options" position="bottom">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                showOptions ?
                  "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
                : "border-white/6 bg-[rgba(22,28,36,0.62)] text-white/35 hover:text-white/60"
              }`}>
              <i className="fa-solid fa-sliders text-[10px]" />
            </button>
          </Tooltip>

          {showOptions && (
            <div
              className="animate-in fade-in zoom-in-95 absolute right-0 z-50 mt-2 flex w-56 flex-col overflow-hidden rounded-lg border border-white/10 bg-[rgba(15,19,25,0.98)] duration-100"
              style={{ maxHeight: "360px" }}>
              {/* Columns */}
              <div className="px-3 pt-3 pb-2">
                <span className="text-[11px] font-bold text-white/35">Columns</span>
                <div
                  className="custom-scroll mt-1.5 overflow-y-auto"
                  style={{ maxHeight: "140px" }}>
                  {allColumns.map((c) => (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-center gap-2.5 px-1.5 py-1 transition-colors hover:bg-[rgba(22,28,36,0.62)]">
                      <div className="relative flex shrink-0 items-center">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(c.key)}
                          onChange={(e) => {
                            e.stopPropagation()
                            if (e.target.checked) {
                              setVisibleColumns([...visibleColumns, c.key])
                            } else {
                              setVisibleColumns(visibleColumns.filter((k) => k !== c.key))
                            }
                          }}
                          className="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-white/10 bg-[rgba(22,28,36,0.62)] transition-all checked:border-cyan-500 checked:bg-cyan-500"
                        />
                        <i className="fa-solid fa-check pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] text-black opacity-0 peer-checked:opacity-100" />
                      </div>
                      <span className="text-[11px] font-medium text-white/45">{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="h-px bg-white/6" />

              {/* Group By */}
              <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="shrink-0 text-[11px] font-bold text-white/35">Group by</span>
                <Dropdown
                  options={GROUP_OPTIONS.map((g) => ({
                    value: g.value,
                    label: g.label,
                  }))}
                  value={groupBy}
                  onChange={(v) => v && setGroupBy(v as GroupByKey)}
                  showPlaceholderOption={false}
                  allowClear={false}
                  className="flex-1"
                  buttonClassName="!rounded-none !border-transparent !bg-[rgba(22,28,36,0.62)] !py-1 !pl-2 !pr-1.5 !text-[11px] !font-medium"
                  iconClassName="!text-[8px]"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
