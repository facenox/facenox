import React, { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Loader2 } from "lucide-react"
import { Modal } from "@/components/common"
import type { DesktopAuditLog } from "@/services/AttendanceManager"

interface AuditLogExportModalProps {
  isOpen: boolean
  onClose: () => void
  onExport: (startDate?: string, endDate?: string) => Promise<void>
  onLoadRecent: () => Promise<DesktopAuditLog[]>
}

type PresetId = "all" | "today" | "7days" | "30days" | "custom"

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7days", label: "7 days" },
  { id: "30days", label: "30 days" },
  { id: "custom", label: "Custom" },
]

const formatDateLocal = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatActivityDetails(details: string | null) {
  if (!details) return ""

  const cleaned = details
    .replace(
      /\b(?:person_id|group_id|site_id|organization_id|target_id|timestamp|created_by)\s*=\s*[^,]+,?\s*/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*,\s*|\s*,\s*$/g, "")
    .trim()

  return cleaned || "Activity recorded"
}

function formatAuditAction(action: string) {
  const normalized = action.toLowerCase().replace(/_/g, ".")
  const labels: Record<string, string> = {
    "member.created": "Member added",
    "member.added": "Member added",
    "member.updated": "Member updated",
    "member.deleted": "Member removed",
    "group.created": "Group created",
    "group.updated": "Group updated",
    "group.deleted": "Group removed",
    "attendance.manual.punch": "Manual attendance recorded",
    "attendance.voided": "Attendance record voided",
    "attendance.record.voided": "Attendance record voided",
    "device.paired": "Device paired",
    "device.unpaired": "Device unpaired",
    "device.revoked": "Device revoked",
    "settings.updated": "Settings updated",
  }

  return (
    labels[normalized] ??
    action
      .replace(/[._]/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  )
}

export const AuditLogExportModal: React.FC<AuditLogExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  onLoadRecent,
}) => {
  const [activePreset, setActivePreset] = useState<PresetId>("all")
  const [startDate, setStartDate] = useState(formatDateLocal(new Date()))
  const [endDate, setEndDate] = useState(formatDateLocal(new Date()))
  const [isExporting, setIsExporting] = useState(false)
  const [logs, setLogs] = useState<DesktopAuditLog[]>([])
  // Start in the loading state so the first paint never flashes stale/empty content.
  const [isLoadingLogs, setIsLoadingLogs] = useState(true)
  const activityListRef = useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!isOpen) return

    let isCancelled = false
    setIsLoadingLogs(true)
    setLogs([])

    void onLoadRecent()
      .then((recentLogs) => {
        if (!isCancelled) setLogs(recentLogs)
      })
      .catch(() => {
        if (!isCancelled) setLogs([])
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingLogs(false)
      })

    return () => {
      isCancelled = true
    }
  }, [isOpen, onLoadRecent])

  useEffect(() => {
    if (!isOpen) return
    requestAnimationFrame(() => {
      if (activityListRef.current) activityListRef.current.scrollTop = 0
    })
  }, [isOpen, logs.length])

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
      handleClose()
    } catch (error) {
      console.error("Export failed:", error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleClose = () => {
    // Reset before the modal exit animation starts, preventing old rows from
    // flashing the next time the modal opens.
    setLogs([])
    setIsLoadingLogs(true)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="max-w-[680px]"
      title="Desktop audit log"
      animateLayout={false}>
      <div className="custom-scroll max-h-[calc(100vh-5rem)] space-y-6 overflow-y-auto pr-1">
        <p className="text-[12px] leading-relaxed text-white/55">
          Activity is stored locally on this device. Organization-wide activity is available in
          Facenox Cloud.
        </p>

        <div className="space-y-2">
          <div className="text-[10px] font-bold tracking-widest text-white/35 uppercase">
            Recent activity
          </div>
          <motion.div
            ref={activityListRef}
            aria-busy={isLoadingLogs}
            className="custom-scroll h-52 min-h-52 overflow-y-auto rounded-lg border border-white/5 bg-white/[0.02]">
            <AnimatePresence mode="popLayout" initial={false}>
              {isLoadingLogs ?
                <motion.div
                  key="loading"
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex h-full items-center justify-center px-3 text-center text-xs text-white/40">
                  Loading activity…
                </motion.div>
              : logs.length === 0 ?
                <motion.div
                  key="empty"
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex h-full items-center justify-center px-3 text-center text-xs text-white/40">
                  No local activity yet.
                </motion.div>
              : logs.map((log, index) => (
                  <motion.div
                    layout
                    key={`${log.timestamp ?? "unknown"}-${log.action}-${index}`}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.16) }}
                    className="flex items-start justify-between gap-4 border-b border-white/5 px-3 py-2.5 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white/80">
                        {formatAuditAction(log.action)}
                      </div>
                      <div className="truncate text-[11px] text-white/40">
                        {log.target_type || "System"}
                        {log.details ? ` · ${formatActivityDetails(log.details)}` : ""}
                      </div>
                    </div>
                    <time className="shrink-0 text-[10px] text-white/35">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "Unknown time"}
                    </time>
                  </motion.div>
                ))
              }
            </AnimatePresence>
          </motion.div>
        </div>

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
                    Start date
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all duration-200 outline-none focus:border-white/25 focus:bg-white/[0.08] focus:text-white"
                  />
                </div>
                <div className="flex shrink-0 items-center justify-center pt-4 text-white/20">
                  <ArrowRight className="size-3" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <span className="text-[9px] font-bold tracking-widest text-white/30 uppercase">
                    End date
                  </span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all duration-200 outline-none focus:border-white/25 focus:bg-white/[0.08] focus:text-white"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t border-white/5 bg-[#0f1011]/95 pt-4 pb-1 backdrop-blur-md">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-[11px] font-semibold tracking-wide text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/85 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExportClick}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-500 px-4 py-2 text-[11px] font-bold tracking-wide text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 hover:from-cyan-300 hover:to-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-40">
            {isExporting ?
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Exporting...
              </>
            : <>Export CSV</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}
