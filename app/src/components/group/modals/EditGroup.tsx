import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { attendanceManager } from "@/services"
import type { AttendanceGroup } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"
import { Switch } from "@/components/shared"

interface EditGroupProps {
  isOpen: boolean
  group: AttendanceGroup
  onClose: () => void
  onSuccess: () => void
}

const formatTimeDisplay = (time?: string) => {
  if (!time) return { time: "08:00", period: "AM" }
  try {
    const [hours, minutes] = time.split(":").map(Number)
    const period = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12
    return {
      time: `${displayHours}:${String(minutes).padStart(2, "0")}`,
      period,
    }
  } catch {
    return { time: time || "08:00", period: "" }
  }
}

export function EditGroup({ isOpen, group, onClose, onSuccess }: EditGroupProps) {
  const [name, setName] = useState(group.name)
  const [lateThresholdEnabled, setLateThresholdEnabled] = useState(
    Boolean(group.settings?.late_threshold_enabled),
  )
  const [classStartTime, setClassStartTime] = useState(group.settings?.class_start_time || "08:00")
  const [classEndTime, setClassEndTime] = useState(group.settings?.class_end_time || "17:00")
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(
    group.settings?.late_threshold_minutes ?? 15,
  )
  const [trackCheckout, setTrackCheckout] = useState(Boolean(group.settings?.track_checkout))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(group.name)
    setLateThresholdEnabled(Boolean(group.settings?.late_threshold_enabled))
    setClassStartTime(group.settings?.class_start_time || "08:00")
    setClassEndTime(group.settings?.class_end_time || "17:00")
    setLateThresholdMinutes(group.settings?.late_threshold_minutes ?? 15)
    setTrackCheckout(Boolean(group.settings?.track_checkout))
  }, [group, isOpen])

  const handleClose = () => {
    setName(group.name)
    setLateThresholdEnabled(Boolean(group.settings?.late_threshold_enabled))
    setClassStartTime(group.settings?.class_start_time || "08:00")
    setClassEndTime(group.settings?.class_end_time || "17:00")
    setLateThresholdMinutes(group.settings?.late_threshold_minutes ?? 15)
    setTrackCheckout(Boolean(group.settings?.track_checkout))
    setError(null)
    setLoading(false)
    onClose()
  }

  const handleSave = async () => {
    if (!name.trim()) {
      return
    }

    setLoading(true)
    try {
      await attendanceManager.updateGroup(group.id, {
        name: name.trim(),
        settings: {
          ...group.settings,
          late_threshold_enabled: lateThresholdEnabled,
          class_start_time: classStartTime,
          class_end_time: trackCheckout ? classEndTime : null,
          late_threshold_minutes: lateThresholdMinutes,
          track_checkout: trackCheckout,
        },
      })
      onSuccess()
      handleClose()
    } catch (err) {
      console.error("Error updating group:", err)
      setError(err instanceof Error ? err.message : "Failed to update group")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div>
          <h3 className="text-xl font-semibold">Edit Group</h3>
          <p className="mt-1 text-xs font-normal text-white/65">
            Update name and attendance schedule for this group
          </p>
        </div>
      }
      maxWidth="md">
      <div className="mt-2">
        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="space-y-4">
          <div className="flex flex-col">
            <FormInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Group Name"
              aria-label="Group Name"
              maxLength={100}
              focusColor="border-white/20"
            />
          </div>

          {/* Unified Schedule & Attendance Rules Container */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 divide-y divide-white/6">
            {/* Late Tracking Row */}
            <div className={lateThresholdEnabled ? "space-y-3 pb-3" : "pb-3"}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white/90">Late Tracking</div>
                  <div className="text-[11px] text-white/55">
                    Flag members who arrive past the scheduled start time.
                  </div>
                </div>
                <Switch
                  checked={lateThresholdEnabled}
                  onChange={setLateThresholdEnabled}
                  ariaLabel="Late Tracking"
                />
              </div>

              <AnimatePresence>
                {lateThresholdEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden pt-3">
                    <div className="space-y-3 border-t border-white/6 pt-3">
                      {/* Scheduled Start Time */}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-white/70">Scheduled Start Time</span>
                        <div className="group relative flex shrink-0 items-center overflow-hidden rounded-md border border-white/10 bg-white/5 px-2.5 py-1 transition-all duration-150 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400 hover:border-cyan-500/40 hover:bg-white/8">
                          <i className="fa-regular fa-clock mr-2 text-[10px] text-white/40 transition-colors group-hover:text-cyan-400" />
                          <div className="flex items-baseline gap-1 font-mono text-xs font-bold text-white/90">
                            <span>{formatTimeDisplay(classStartTime).time}</span>
                            <span className="text-[10px] font-medium text-white/55">
                              {formatTimeDisplay(classStartTime).period}
                            </span>
                          </div>
                          <input
                            type="time"
                            aria-label="Scheduled start time"
                            value={classStartTime}
                            onChange={(e) => setClassStartTime(e.target.value)}
                            onClick={(e) => e.currentTarget.showPicker?.()}
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          />
                        </div>
                      </div>

                      {/* Late Grace Period */}
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-white/70">Late threshold</span>
                        <div className="flex items-center gap-1.5">
                          {([0, 5, 10, 15, 30, 45, 60] as const).map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => setLateThresholdMinutes(mins)}
                              className={`rounded px-1.5 py-0.5 text-[11px] font-bold transition-all ${
                                lateThresholdMinutes === mins ?
                                  "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/50"
                                : "text-white/40 hover:bg-white/5 hover:text-white/80"
                              }`}>
                              {mins === 0 ? "Exact" : `${mins}m`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Departure & Checkout Tracking Row */}
            <div className={trackCheckout ? "space-y-3 pt-3" : "pt-3"}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white/90">Entry & Exit Tracking</div>
                  <div className="text-[11px] text-white/55">
                    Record both arrival (Time In) and departure (Time Out) events.
                  </div>
                </div>
                <Switch
                  checked={trackCheckout}
                  onChange={setTrackCheckout}
                  ariaLabel="Entry & Exit Tracking"
                />
              </div>

              <AnimatePresence>
                {trackCheckout && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden pt-3">
                    <div className="border-t border-white/6 pt-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-white/70">Scheduled End Time</span>
                        <div className="group relative flex shrink-0 items-center overflow-hidden rounded-md border border-white/10 bg-white/5 px-2.5 py-1 transition-all duration-150 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400 hover:border-cyan-500/40 hover:bg-white/8">
                          <i className="fa-regular fa-clock mr-2 text-[10px] text-white/40 transition-colors group-hover:text-cyan-400" />
                          <div className="flex items-baseline gap-1 font-mono text-xs font-bold text-white/90">
                            <span>{formatTimeDisplay(classEndTime).time}</span>
                            <span className="text-[10px] font-medium text-white/55">
                              {formatTimeDisplay(classEndTime).period}
                            </span>
                          </div>
                          <input
                            type="time"
                            aria-label="Scheduled end time"
                            value={classEndTime}
                            onChange={(e) => setClassEndTime(e.target.value)}
                            onClick={(e) => e.currentTarget.showPicker?.()}
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || loading}
            className="min-w-[120px] rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-30">
            {loading ? "Saving…" : "Update Group"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
