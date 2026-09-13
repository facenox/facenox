import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
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
  const [isSearchFocused, setIsSearchFocused] = useState(false)
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

  const [shouldKeepExpanded, setShouldKeepExpanded] = useState(false)
  const dateBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDateFocus = () => {
    if (dateBlurTimeoutRef.current) {
      clearTimeout(dateBlurTimeoutRef.current)
      dateBlurTimeoutRef.current = null
    }
    if (isSearchFocused || search.trim().length > 0 || shouldKeepExpanded) {
      setShouldKeepExpanded(true)
    }
  }

  const handleDateBlur = () => {
    dateBlurTimeoutRef.current = setTimeout(() => {
      setShouldKeepExpanded(false)
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (dateBlurTimeoutRef.current) {
        clearTimeout(dateBlurTimeoutRef.current)
      }
    }
  }, [])

  const handleSearchFocus = () => {
    setIsSearchFocused(true)
  }

  const handleSearchBlur = () => {
    setTimeout(() => {
      setIsSearchFocused(false)
    }, 150)
  }

  const isSearchExpanded = search.trim().length > 0 || isSearchFocused || shouldKeepExpanded
  const searchBarMaxWidthClass = isSearchExpanded ? "max-w-[560px]" : "max-w-[500px]"

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div
          className={`group/bar flex w-full items-center transition-all duration-300 ease-out ${searchBarMaxWidthClass}`}>
          <div className="relative flex-1">
            <svg
              className="absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-white/25 transition-colors group-focus-within/bar:text-white/45"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              placeholder="Search name, status, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              className="h-9 w-full rounded-l-lg rounded-r-none border border-r-0 border-white/5 bg-white/5 py-2 pr-3 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none group-focus-within/bar:border-white/20 placeholder:text-white/30 focus:bg-white/[0.08]"
            />
          </div>

          <div className="flex h-9 items-center gap-1.5 rounded-l-none rounded-r-lg border border-l-0 border-white/5 bg-white/5 px-2.5 transition-all duration-300 group-focus-within/bar:border-white/20 focus-within:bg-white/[0.08] hover:bg-white/[0.08]">
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              onFocus={handleDateFocus}
              onBlur={handleDateBlur}
              className="h-full w-[112px] cursor-pointer border-0 bg-transparent text-[11px] font-bold tracking-wider text-white outline-none hover:text-cyan-400 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-0"
              style={{ colorScheme: "dark" } as React.CSSProperties}
            />
            <span
              onMouseDown={(e) => e.preventDefault()}
              className="text-[10px] font-bold tracking-wider text-white/30 uppercase">
              to
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              onFocus={handleDateFocus}
              onBlur={handleDateBlur}
              className="h-full w-[112px] cursor-pointer border-0 bg-transparent text-[11px] font-bold tracking-wider text-white outline-none hover:text-cyan-400 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:p-0"
              style={{ colorScheme: "dark" } as React.CSSProperties}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
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
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent transition-all duration-300 active:scale-95 ${
                showFilter || statusFilter !== "all" ?
                  "bg-cyan-500/[0.08] text-cyan-400"
                : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}>
              <i className="fa-solid fa-filter text-[11px]" />
              {statusFilter !== "all" && (
                <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-[1px] bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
              )}
            </button>
          </Tooltip>

          <AnimatePresence>
            {showFilter && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-lg border border-white/10 bg-[#0d1117]/95 shadow-xl">
                {finalStatusOptions.map(({ value: st, label }) => (
                  <button
                    key={st}
                    onClick={() => {
                      setStatusFilter(st as ReportStatusFilter)
                      setShowFilter(false)
                    }}
                    className={`w-full border-0 px-3 py-2.5 text-left text-[11px] font-bold tracking-wider transition-colors ${
                      statusFilter === st ?
                        "bg-cyan-500/10 text-cyan-400"
                      : "text-white/65 hover:bg-white/5 hover:text-white"
                    }`}>
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative" ref={optionsRef}>
          <Tooltip content="Options" position="bottom">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent transition-all duration-300 active:scale-95 ${
                showOptions ?
                  "bg-cyan-500/[0.08] text-cyan-400"
                : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}>
              <i className="fa-solid fa-sliders text-[11px]" />
            </button>
          </Tooltip>

          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                className="absolute right-0 z-50 mt-2 flex w-56 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0d1117]/95 shadow-xl"
                style={{ maxHeight: "360px" }}>
                <div className="px-3 pt-3 pb-2">
                  <span className="text-[11px] font-bold tracking-wider text-white/65">
                    Columns
                  </span>
                  <div
                    className="custom-scroll mt-1.5 overflow-y-auto"
                    style={{ maxHeight: "140px" }}>
                    {allColumns.map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-white/5">
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
                            className="peer h-3.5 w-3.5 cursor-pointer appearance-none rounded border border-white/10 bg-white/5 transition-all checked:border-cyan-500 checked:bg-cyan-500"
                          />
                          <i className="fa-solid fa-check pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] text-black opacity-0 peer-checked:opacity-100" />
                        </div>
                        <span className="text-[11px] font-bold tracking-wider text-white/65">
                          {c.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="shrink-0 text-[11px] font-bold tracking-wider text-white/65">
                    Group by
                  </span>
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
                    buttonClassName="!rounded-lg !border-white/5 !bg-white/5 !py-1.5 !pl-3 !pr-2 !text-[11px] !font-bold !tracking-wider hover:!bg-white/10 transition-all duration-300"
                    iconClassName="!text-[9px]"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
