import { useState, useRef, useEffect } from "react"
import { Tooltip } from "@/components/shared"

interface StartTimeChipProps {
  startTime: string // "HH:MM" format
  onTimeChange: (newTime: string) => void
  disabled?: boolean
}

/**
 * Inline time chip for the control bar.
 * Glassmorphism design with digital typography.
 */
export function StartTimeChip({ startTime, onTimeChange, disabled = false }: StartTimeChipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  const formatTimeDisplay = (
    time: string,
  ): {
    time: string
    period: string
  } => {
    try {
      const [hours, minutes] = time.split(":").map(Number)
      const period = hours >= 12 ? "PM" : "AM"
      const displayHours = hours % 12 || 12
      return {
        time: `${displayHours}:${String(minutes).padStart(2, "0")}`,
        period,
      }
    } catch {
      return { time, period: "" }
    }
  }

  const handleSetNow = () => {
    const now = new Date()
    const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    onTimeChange(nowTime)
  }

  const isTimeOutdated = (): boolean => {
    try {
      const [hours, minutes] = startTime.split(":").map(Number)
      const now = new Date()
      const setTime = new Date()
      setTime.setHours(hours, minutes, 0, 0)

      const diffMs = Math.abs(now.getTime() - setTime.getTime())
      const diffHours = diffMs / (1000 * 60 * 60)
      return diffHours > 6
    } catch {
      return false
    }
  }

  const outdated = isTimeOutdated()
  const { time, period } = formatTimeDisplay(startTime)

  return (
    <div ref={containerRef} className="relative">
      <Tooltip
        content={
          outdated ?
            "Start time may be outdated - click to update"
          : "Click to adjust session start time"
        }
        position="top">
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`group relative flex flex-col items-center gap-1 overflow-hidden rounded-lg border border-transparent bg-transparent px-3 py-1.5 transition-all duration-300 ${
            disabled ? "cursor-not-allowed text-white/30"
            : isOpen ? "border-cyan-500/50 shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]"
            : outdated ? "text-amber-200 hover:text-amber-300"
            : "text-white/90 hover:border-white/10"
          }`}>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-amber-500/80">
              Late Tracking is enabled
            </span>
            <div className="flex items-baseline gap-1">
              <span
                className={`font-mono text-sm tracking-tight ${
                  outdated ? "text-amber-300" : "text-white/80"
                }`}>
                {time}
              </span>
              <span
                className={`text-[9px] font-medium ${
                  outdated ? "text-amber-400/60" : "text-white/30"
                }`}>
                {period}
              </span>
            </div>
          </div>

          {outdated && (
            <div className="flex flex-col items-center opacity-80">
              <span className="animate-pulse text-[10px] font-medium text-amber-500/80">
                Click to update
              </span>
            </div>
          )}
        </button>
      </Tooltip>

      {isOpen && (
        <div className="animate-in fade-in zoom-in-95 slide-in-from-bottom-2 absolute bottom-full left-1/2 z-50 mb-2 min-w-[160px] origin-bottom -translate-x-1/2 rounded-lg border border-white/10 bg-[rgba(15,19,25,0.98)] p-2 shadow-xl duration-150">
          <div className="mb-2 flex items-center justify-between px-1">
            <Tooltip content="Attendance is tracked relative to this scheduled time" position="top">
              <span className="block cursor-help py-1 text-[9px] font-medium text-white/30">
                Start Time
              </span>
            </Tooltip>

            <Tooltip content="Set to Current Time" position="top">
              <button
                onClick={handleSetNow}
                className="group/now flex h-6 w-6 items-center justify-center rounded border-none bg-transparent p-0 transition-colors hover:bg-[rgba(22,28,36,0.62)] focus:outline-none"
                aria-label="Set to Current Time">
                <i className="fa-solid fa-arrows-rotate text-[10px] text-white/30 transition-all duration-300 group-hover/now:rotate-180 hover:text-cyan-400"></i>
              </button>
            </Tooltip>
          </div>

          <div className="group relative overflow-hidden rounded-lg border border-white/6 bg-[rgba(22,28,36,0.62)] transition-colors hover:bg-[rgba(28,35,44,0.82)]">
            <input
              type="time"
              value={startTime}
              onChange={(e) => onTimeChange(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker()}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
            <div className="pointer-events-none px-3 py-2.5 text-center">
              <div className="flex items-baseline justify-center gap-1 font-mono text-xl tracking-widest text-white">
                <span>{formatTimeDisplay(startTime).time}</span>
                <span className="text-[10px] font-medium tracking-tight text-white/30">
                  {formatTimeDisplay(startTime).period}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
