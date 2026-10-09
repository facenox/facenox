import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { attendanceManager } from "@/services"
import type { AttendanceGroup } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"
import { Switch } from "@/components/shared"

interface CreateGroupProps {
  isOpen: boolean
  /** Existing groups used to detect duplicate names before creation. */
  existingGroups?: AttendanceGroup[]
  onClose: () => void
  onSuccess: (group: AttendanceGroup) => void
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

/**
 * Modal for creating a new attendance group.
 * In standalone mode, manages groups locally in SQLite. When cloud-paired, automatic background sync synchronizes it.
 */
export function CreateGroup({ isOpen, existingGroups = [], onClose, onSuccess }: CreateGroupProps) {
  const [name, setName] = useState("")
  const [lateThresholdEnabled, setLateThresholdEnabled] = useState(false)
  const [classStartTime, setClassStartTime] = useState("08:00")
  const [classEndTime, setClassEndTime] = useState("17:00")
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(15)
  const [trackCheckout, setTrackCheckout] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  // Reset confirmation state whenever the typed name changes
  useEffect(() => {
    setConfirmDuplicate(false)
  }, [name])

  const isDuplicate = useMemo(() => {
    if (!name.trim()) return false
    const normalizedName = name.trim().toLowerCase()
    return existingGroups.some((g) => g.name.toLowerCase() === normalizedName)
  }, [name, existingGroups])

  const handleClose = () => {
    setName("")
    setLateThresholdEnabled(false)
    setClassStartTime("08:00")
    setClassEndTime("17:00")
    setLateThresholdMinutes(15)
    setTrackCheckout(false)
    setLoading(false)
    setError(null)
    setConfirmDuplicate(false)
    onClose()
  }

  const handleCreate = async () => {
    if (!name.trim()) return

    // First click when duplicate: surface warning and switch to "Create Anyway" mode
    if (isDuplicate && !confirmDuplicate) {
      setConfirmDuplicate(true)
      return
    }

    setLoading(true)
    try {
      const newGroup = await attendanceManager.createGroup(name.trim(), {
        late_threshold_enabled: lateThresholdEnabled,
        class_start_time: classStartTime,
        class_end_time: trackCheckout ? classEndTime : null,
        late_threshold_minutes: lateThresholdMinutes,
        track_checkout: trackCheckout,
      })
      onSuccess(newGroup)
      handleClose()
    } catch (err) {
      console.error("Error creating group:", err)
      setError(err instanceof Error ? err.message : "Failed to create group")
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
          <h3 className="text-xl font-semibold">Create Group</h3>
          <p className="mt-1 text-xs font-normal text-white/65">
            Configure name and attendance schedule for this group
          </p>
        </div>
      }
      maxWidth="md">
      <div className="mt-2">
        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="space-y-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="pl-1 text-[11px] font-medium text-white/65">Group Name</span>
            <FormInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate()
              }}
              placeholder="e.g. Faculty, Grade 10 - Section A, Staff"
              maxLength={100}
              focusColor={isDuplicate && !confirmDuplicate ? "border-amber-400" : "border-white/20"}
              className={isDuplicate && !confirmDuplicate ? "border-amber-500/50" : ""}
            />
            {isDuplicate && !confirmDuplicate && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-400/80">
                <i className="fa-solid fa-triangle-exclamation text-[10px]" />A group with this name
                already exists.
              </div>
            )}
          </label>

          {/* Schedule & Late Policy Section */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-white/90">Late Tracking Schedule</div>
                <div className="text-[11px] text-white/55">
                  Track arrival times and flag late attendees for this group.
                </div>
              </div>
              <Switch
                checked={lateThresholdEnabled}
                onChange={setLateThresholdEnabled}
                ariaLabel="Enable late tracking for this group"
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
                      <span className="text-[11px] text-white/70">Late Grace Period</span>
                      <div className="flex items-center gap-2">
                        {([5, 10, 15, 30, 45, 60] as const).map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setLateThresholdMinutes(mins)}
                            className={`rounded px-2 py-0.5 text-[11px] font-bold transition-all ${
                              lateThresholdMinutes === mins ?
                                "bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/50"
                              : "text-white/40 hover:bg-white/5 hover:text-white/80"
                            }`}>
                            {mins}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Departure & Checkout Tracking Section */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-white/90">
                  Track Departure / Check-Out
                </div>
                <div className="text-[11px] text-white/55">
                  Record both arrival (Time In) and departure (Time Out) events.
                </div>
              </div>
              <Switch
                checked={trackCheckout}
                onChange={setTrackCheckout}
                ariaLabel="Enable departure and check-out tracking for this group"
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
                      <span className="text-[11px] text-white/70">Scheduled Departure Time</span>
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
                          aria-label="Scheduled departure time"
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

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || loading}
            className={`min-w-[120px] rounded-lg px-6 py-2 text-[11px] font-bold tracking-wider transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-30 ${
              confirmDuplicate && isDuplicate ?
                "bg-amber-500 text-slate-950 hover:bg-amber-400 focus-visible:ring-amber-400"
              : "bg-cyan-500 text-slate-950 hover:bg-cyan-400 focus-visible:ring-cyan-400"
            }`}>
            {loading ?
              "Creating…"
            : confirmDuplicate && isDuplicate ?
              "Create Anyway"
            : "Create Group"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
