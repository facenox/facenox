import { useState, useRef, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calendar,
  Check,
  ChevronDown,
  Filter,
  HelpCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react"
import { Dropdown, Tooltip } from "@/components/shared"
import { getLocalDateString, parseLocalDate } from "@/utils"
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
  unavailableColumns: readonly { key: ColumnKey; label: string; reason: string }[]
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

type DatePreset = "today" | "yesterday" | "week" | "7days" | "month" | "30days"

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This Week" },
  { id: "7days", label: "Last 7 Days" },
  { id: "month", label: "This Month" },
  { id: "30days", label: "Last 30 Days" },
]

function getPresetRange(preset: DatePreset): { start: string; end: string } {
  const now = new Date()
  const today = getLocalDateString(now)

  if (preset === "today") {
    return { start: today, end: today }
  }
  if (preset === "yesterday") {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    const yesterday = getLocalDateString(y)
    return { start: yesterday, end: yesterday }
  }
  if (preset === "week") {
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    return { start: getLocalDateString(monday), end: today }
  }
  if (preset === "7days") {
    const d7 = new Date(now)
    d7.setDate(now.getDate() - 6)
    return { start: getLocalDateString(d7), end: today }
  }
  if (preset === "month") {
    const m1 = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: getLocalDateString(m1), end: today }
  }
  if (preset === "30days") {
    const d30 = new Date(now)
    d30.setDate(now.getDate() - 29)
    return { start: getLocalDateString(d30), end: today }
  }
  return { start: today, end: today }
}

function getDisplayDateLabel(startDate: string, endDate: string): string {
  const now = new Date()
  const today = getLocalDateString(now)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  const yesterday = getLocalDateString(y)

  if (startDate === today && endDate === today) return "Today"
  if (startDate === yesterday && endDate === yesterday) return "Yesterday"

  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  if (startDate === getLocalDateString(monday) && endDate === today) return "This Week"

  const d7 = new Date(now)
  d7.setDate(now.getDate() - 6)
  if (startDate === getLocalDateString(d7) && endDate === today) return "Last 7 Days"

  const m1 = new Date(now.getFullYear(), now.getMonth(), 1)
  if (startDate === getLocalDateString(m1) && endDate === today) return "This Month"

  const d30 = new Date(now)
  d30.setDate(now.getDate() - 29)
  if (startDate === getLocalDateString(d30) && endDate === today) return "Last 30 Days"

  const s = parseLocalDate(startDate)
  const e = parseLocalDate(endDate)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return `${startDate} – ${endDate}`
  }

  const sMonth = s.toLocaleDateString("en-US", { month: "short" })
  const eMonth = e.toLocaleDateString("en-US", { month: "short" })

  if (startDate === endDate) {
    return `${sMonth} ${s.getDate()}`
  }

  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth()) {
      return `${sMonth} ${s.getDate()} – ${e.getDate()}`
    }
    return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}`
  }

  return `${sMonth} ${s.getDate()}, ${s.getFullYear()} – ${eMonth} ${e.getDate()}, ${e.getFullYear()}`
}

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
  unavailableColumns,
}: ReportToolbarProps) {
  const [showOptions, setShowOptions] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [shouldKeepExpanded, setShouldKeepExpanded] = useState(false)

  const [customStart, setCustomStart] = useState(startDate)
  const [customEnd, setCustomEnd] = useState(endDate)

  const optionsRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const dateDropdownRef = useRef<HTMLDivElement>(null)

  const finalStatusOptions = STATUS_OPTIONS

  useEffect(() => {
    setCustomStart(startDate)
    setCustomEnd(endDate)
  }, [startDate, endDate])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false)
      }
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilter(false)
      }
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
        setDateDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (dateDropdownOpen) {
      if (isSearchFocused || search.trim().length > 0) {
        setShouldKeepExpanded(true)
      }
    } else {
      const timer = setTimeout(() => {
        setShouldKeepExpanded(false)
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [dateDropdownOpen, isSearchFocused, search])

  useEffect(() => {
    if (!dateDropdownOpen && !showFilter && !showOptions) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Esc" && event.keyCode !== 27) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (dateDropdownOpen) {
        setDateDropdownOpen(false)
      } else if (showFilter) {
        setShowFilter(false)
      } else {
        setShowOptions(false)
      }
    }

    window.addEventListener("keydown", handleEscape, true)
    return () => window.removeEventListener("keydown", handleEscape, true)
  }, [dateDropdownOpen, showFilter, showOptions])

  const handleSearchFocus = () => {
    setIsSearchFocused(true)
  }

  const handleSearchBlur = () => {
    setTimeout(() => {
      setIsSearchFocused(false)
    }, 150)
  }

  const dateRangeLabel = useMemo(
    () => getDisplayDateLabel(startDate, endDate),
    [startDate, endDate],
  )

  const activePreset = useMemo(() => {
    for (const p of DATE_PRESETS) {
      const r = getPresetRange(p.id)
      if (r.start === startDate && r.end === endDate) return p.id
    }
    return null
  }, [startDate, endDate])

  const isSearchExpanded = search.trim().length > 0 || isSearchFocused || shouldKeepExpanded
  const searchBarMaxWidthClass = isSearchExpanded ? "max-w-[340px]" : "max-w-[320px]"

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div
          className={`group/bar flex w-full items-center transition-all duration-300 ease-out ${searchBarMaxWidthClass}`}>
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-white/25 transition-colors group-focus-within/bar:text-white/45" />
            <input
              type="search"
              placeholder="Search name, status, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              onKeyDown={(e) => {
                if (e.key !== "Escape" && e.key !== "Esc" && e.keyCode !== 27) return
                e.preventDefault()
                e.stopPropagation()
                if (e.currentTarget.value) {
                  setSearch("")
                } else {
                  e.currentTarget.blur()
                }
              }}
              className="h-9 w-full rounded-l-lg rounded-r-none border border-r-0 border-white/5 bg-white/5 py-2 pr-3 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none group-focus-within/bar:border-white/20 placeholder:text-white/35 focus:bg-white/[0.08]"
            />
          </div>

          <div className="relative shrink-0" ref={dateDropdownRef}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDateDropdownOpen((open) => !open)
                setShowFilter(false)
                setShowOptions(false)
              }}
              className="flex h-9 transform-gpu items-center justify-between gap-1.5 rounded-l-none rounded-r-lg border border-l-0 border-white/5 bg-white/5 px-2.5 text-[12px] font-semibold text-white/80 transition-colors duration-300 outline-none group-focus-within/bar:border-white/20 focus-within:bg-white/[0.08] hover:border-white/10 hover:bg-white/[0.08] focus:border-white/20 focus:bg-white/[0.08]">
              <span className="flex min-w-0 items-center gap-1.5">
                <Calendar className="size-3 text-white/55" />
                <span className="truncate">{dateRangeLabel}</span>
              </span>
              <ChevronDown
                className={`size-2.5 shrink-0 text-white/55 transition-transform duration-150 ${dateDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {dateDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 z-50 mt-1.5 flex w-[260px] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0f1011]/95 p-2 shadow-xl backdrop-blur-md">
                  <div className="grid grid-cols-2 gap-1">
                    {DATE_PRESETS.map(({ id, label }) => {
                      const isSelected = activePreset === id
                      return (
                        <button
                          key={id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            const range = getPresetRange(id)
                            onStartDateChange(range.start)
                            onEndDateChange(range.end)
                            setDateDropdownOpen(false)
                          }}
                          className={`flex items-center justify-between rounded px-2.5 py-1.5 text-left text-[11px] font-semibold transition-all duration-150 ${
                            isSelected ?
                              "bg-cyan-500/10 font-bold text-cyan-400"
                            : "text-white/70 hover:bg-white/5 hover:text-white"
                          }`}>
                          <span>{label}</span>
                          {isSelected && <Check className="size-3 text-cyan-400" />}
                        </button>
                      )
                    })}
                  </div>

                  <div className="my-2.5 flex items-center gap-2 px-1">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-[9px] font-bold tracking-wider text-white/35 uppercase">
                      Custom
                    </span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={customStart}
                        min="2000-01-01"
                        max="2099-12-31"
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="h-7 w-full rounded border border-white/10 bg-white/5 px-2 text-[11px] font-medium text-white outline-none focus:border-white/25 focus:bg-white/[0.08]"
                        style={{ colorScheme: "dark" } as React.CSSProperties}
                      />
                      <span className="text-[10px] font-bold text-white/30 uppercase">to</span>
                      <input
                        type="date"
                        value={customEnd}
                        min="2000-01-01"
                        max="2099-12-31"
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="h-7 w-full rounded border border-white/10 bg-white/5 px-2 text-[11px] font-medium text-white outline-none focus:border-white/25 focus:bg-white/[0.08]"
                        style={{ colorScheme: "dark" } as React.CSSProperties}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!customStart || !customEnd || customStart > customEnd}
                      onClick={() => {
                        if (customStart && customEnd && customStart <= customEnd) {
                          onStartDateChange(customStart)
                          onEndDateChange(customEnd)
                          setDateDropdownOpen(false)
                        }
                      }}
                      className="mt-2 w-full rounded bg-white/10 py-1.5 text-center text-[11px] font-semibold text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40">
                      Apply Range
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
              onClick={() => {
                setShowFilter((open) => !open)
                setDateDropdownOpen(false)
                setShowOptions(false)
              }}
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent transition-all duration-300 active:scale-95 ${
                showFilter || statusFilter !== "all" ?
                  "bg-cyan-500/[0.08] text-cyan-400"
                : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}>
              <Filter className="size-3.5" />
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
                className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-lg border border-white/10 bg-[#0f1011]/95 shadow-xl">
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
              onClick={() => {
                setShowOptions((open) => !open)
                setDateDropdownOpen(false)
                setShowFilter(false)
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent transition-all duration-300 active:scale-95 ${
                showOptions ?
                  "bg-cyan-500/[0.08] text-cyan-400"
                : "text-white/55 hover:bg-white/5 hover:text-white"
              }`}>
              <SlidersHorizontal className="size-3.5" />
            </button>
          </Tooltip>

          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                transition={{ duration: 0.1, ease: "easeOut" }}
                className="absolute right-0 z-50 mt-2 flex w-[200px] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0f1011]/95 shadow-xl backdrop-blur-md">
                <div className="px-2.5 pt-2.5 pb-1.5">
                  <span className="px-1 text-[10px] font-extrabold tracking-wider text-white/50 uppercase">
                    Columns
                  </span>
                  {unavailableColumns.length > 0 && (
                    <span className="mt-1 block px-1 text-[10px] leading-4 text-white/35">
                      Some columns do not apply to this mode.
                    </span>
                  )}
                  <div className="custom-scroll mt-1 max-h-[150px] overflow-y-auto pr-1">
                    {allColumns.map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/5">
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
                          <Check className="pointer-events-none absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 text-black opacity-0 peer-checked:opacity-100" />
                        </div>
                        <span className="text-[11px] font-bold tracking-wider text-white/65">
                          {c.label}
                        </span>
                      </label>
                    ))}
                    {unavailableColumns.map((c) => (
                      <Tooltip key={c.key} content={c.reason} position="top" offset={8}>
                        <div
                          aria-disabled="true"
                          className="group flex cursor-not-allowed items-center gap-2 rounded-md px-1.5 py-1.5 opacity-35 transition-colors hover:bg-white/5 hover:opacity-60">
                          <div className="h-3.5 w-3.5 shrink-0 rounded border border-white/10 bg-white/5" />
                          <span className="text-[11px] font-bold tracking-wider text-white/65 transition-colors group-hover:text-white/85">
                            {c.label}
                          </span>
                          <HelpCircle className="size-3 shrink-0 text-white/30 transition-colors group-hover:text-white/65" />
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <div className="flex items-center justify-between gap-2 px-2.5 py-2.5">
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
                    buttonClassName="!rounded-lg !border-white/5 !bg-white/5 !py-1 !pl-2.5 !pr-2 !text-[11px] !font-bold !tracking-wider hover:!bg-white/10 transition-all duration-300"
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
