import React, { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Modal } from "@/components/common"

interface AuditLogExportModalProps {
  isOpen: boolean
  onClose: () => void
  onExport: (startDate?: string, endDate?: string) => Promise<void>
}

type PresetId = "all" | "today" | "7days" | "30days" | "custom"

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "7days", label: "7 Days" },
  { id: "30days", label: "30 Days" },
  { id: "custom", label: "Custom" },
]

const formatDateLocal = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const AuditLogExportModal: React.FC<AuditLogExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
}) => {
  const [activePreset, setActivePreset] = useState<PresetId>("all")
  const [startDate, setStartDate] = useState(formatDateLocal(new Date()))
  const [endDate, setEndDate] = useState(formatDateLocal(new Date()))
  const [isExporting, setIsExporting] = useState(false)

  const handleExportClick = async () => {
    setIsExporting(true)
    try {
      let finalStart: string | undefined = undefined
      let finalEnd: string | undefined = undefined

      if (activePreset === "today") {
        const todayStr = formatDateLocal(new Date())
        finalStart = `${todayStr}T00:00:00`
        finalEnd = `${todayStr}T23:59:59`
      } else if (activePreset === "7days") {
        const start = new Date()
        start.setDate(start.getDate() - 7)
        finalStart = `${formatDateLocal(start)}T00:00:00`
        finalEnd = `${formatDateLocal(new Date())}T23:59:59`
      } else if (activePreset === "30days") {
        const start = new Date()
        start.setDate(start.getDate() - 30)
        finalStart = `${formatDateLocal(start)}T00:00:00`
        finalEnd = `${formatDateLocal(new Date())}T23:59:59`
      } else if (activePreset === "custom") {
        if (startDate) finalStart = `${startDate}T00:00:00`
        if (endDate) finalEnd = `${endDate}T23:59:59`
      }

      await onExport(finalStart, finalEnd)
      onClose()
    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-[420px]" title="Export Audit Log">
      <div className="space-y-6">
        <p className="text-[12px] leading-relaxed text-white/55">
          Select a date range to scope down the exported CSV log. This will dynamically filter
          server audit events in real-time.
        </p>

        {/* Underline Preset Selector */}
        <div className="flex items-center justify-center gap-7 pt-1">
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setActivePreset(preset.id)}
                className={`relative rounded px-1 py-1 text-xs font-semibold tracking-wide transition-colors duration-200 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none ${
                  isActive ? "font-bold text-cyan-400" : "text-white/40 hover:text-white/70"
                }`}>
                <span>{preset.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activePresetUnderline"
                    className="absolute -bottom-1.5 left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-[1px] bg-cyan-400"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Custom Range Date Inputs - Smooth Slide & Fade Transition */}
        <AnimatePresence>
          {activePreset === "custom" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden">
              <div className="flex items-center gap-4 pt-3 pb-1">
                <div className="flex-1 space-y-1.5">
                  <span className="text-[9px] font-bold tracking-widest text-white/30 uppercase">
                    Start Date
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 text-xs font-semibold text-white/80 transition-all duration-200 outline-none focus:border-cyan-500/20 focus:bg-cyan-500/[0.01] focus:text-white focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none"
                  />
                </div>
                <div className="flex shrink-0 items-center justify-center pt-4 text-white/20">
                  <i className="fa-solid fa-arrow-right text-[10px]" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <span className="text-[9px] font-bold tracking-widest text-white/30 uppercase">
                    End Date
                  </span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-white/5 bg-white/[0.01] px-3 py-2 text-xs font-semibold text-white/80 transition-all duration-200 outline-none focus:border-cyan-500/20 focus:bg-cyan-500/[0.01] focus:text-white focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[11px] font-semibold tracking-wide text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/85 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExportClick}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-[11px] font-bold tracking-wide text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-40">
            {isExporting ?
              <>
                <i className="fa-solid fa-circle-notch fa-spin" />
                Exporting...
              </>
            : <>Export CSV</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}
