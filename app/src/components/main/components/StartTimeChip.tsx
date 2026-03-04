import { useState, useRef, useEffect } from "react";
import { Tooltip } from "@/components/shared";

interface StartTimeChipProps {
  startTime: string; // "HH:MM" format
  onTimeChange: (newTime: string) => void;
  disabled?: boolean;
}

/**
 * Inline time chip for the control bar.
 * Premium glassmorphism design with digital typography.
 */
export function StartTimeChip({
  startTime,
  onTimeChange,
  disabled = false,
}: StartTimeChipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const formatTimeDisplay = (
    time: string,
  ): {
    time: string;
    period: string;
  } => {
    try {
      const [hours, minutes] = time.split(":").map(Number);
      const period = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 || 12;
      return {
        time: `${displayHours}:${String(minutes).padStart(2, "0")}`,
        period,
      };
    } catch {
      return { time, period: "" };
    }
  };

  const handleSetNow = () => {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    onTimeChange(nowTime);
  };

  const isTimeOutdated = (): boolean => {
    try {
      const [hours, minutes] = startTime.split(":").map(Number);
      const now = new Date();
      const setTime = new Date();
      setTime.setHours(hours, minutes, 0, 0);

      const diffMs = Math.abs(now.getTime() - setTime.getTime());
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours > 6;
    } catch {
      return false;
    }
  };

  const outdated = isTimeOutdated();
  const { time, period } = formatTimeDisplay(startTime);

  return (
    <div ref={containerRef} className="relative">
      <Tooltip
        content={
          outdated
            ? "Start time may be outdated - click to update"
            : "Click to adjust session start time"
        }
        position="top"
      >
        <button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`group overflow-hidden relative flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all duration-300 ${
            disabled
              ? "bg-white/5 text-white/30 cursor-not-allowed border border-white/5"
              : isOpen
                ? "bg-black/80 border border-cyan-500/50 shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]"
                : outdated
                  ? "bg-amber-900/20 border border-amber-500/30 text-amber-200 hover:bg-amber-900/30 hover:border-amber-500/50"
                  : "bg-transparent border border-transparent hover:bg-white/5 hover:border-white/10 text-white/90"
          }`}
        >
          <div className="flex items-baseline gap-1">
            <span
              className={`font-mono text-sm tracking-tight ${
                outdated ? "text-amber-300" : "text-white/80"
              }`}
            >
              {time}
            </span>
            <span
              className={`text-[9px] font-bold uppercase ${
                outdated ? "text-amber-400/70" : "text-white/40"
              }`}
            >
              {period}
            </span>
          </div>

          {outdated && (
            <div>
              <i className="fa-solid fa-triangle-exclamation text-[15px] text-amber-400 animate-pulse" />
            </div>
          )}
        </button>
      </Tooltip>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 bg-[#0c0c0c] border border-white/10 rounded-lg shadow-xl p-2 min-w-[160px] z-50 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-150 origin-bottom-right">
          <div className="flex items-center justify-between mb-2 px-1">
            <Tooltip
              content="Attendance is tracked relative to this scheduled time"
              position="top"
            >
              <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold cursor-help block py-1">
                Start Time
              </span>
            </Tooltip>

            <Tooltip content="Set to Current Time" position="top">
              <button
                onClick={handleSetNow}
                className="group/now focus:outline-none bg-transparent border-none p-0 flex items-center justify-center w-6 h-6 rounded hover:bg-white/5 transition-colors"
                aria-label="Set to Current Time"
              >
                <i className="fa-solid fa-arrows-rotate text-white/30 hover:text-cyan-400 text-[10px] group-hover/now:rotate-180 transition-all duration-300"></i>
              </button>
            </Tooltip>
          </div>

          <div className="relative group rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 border border-white/5 transition-colors">
            <input
              type="time"
              value={startTime}
              onChange={(e) => onTimeChange(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker()}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className="py-2.5 px-3 text-center pointer-events-none">
              <div className="font-mono text-xl text-white tracking-widest flex justify-center items-baseline gap-1">
                <span>{formatTimeDisplay(startTime).time}</span>
                <span className="text-[10px] text-white/40 font-sans font-bold uppercase tracking-wider">
                  {formatTimeDisplay(startTime).period}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
