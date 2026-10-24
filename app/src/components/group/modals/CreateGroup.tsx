import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Clock } from "lucide-react"
import { attendanceManager } from "@/services"
import type { AttendanceGroup, AttendanceMode } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal } from "@/components/common"
import { Dropdown, Switch } from "@/components/shared"

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
  const [isScheduleSectionOpen, setIsScheduleSectionOpen] = useState(false)
  const [lateThresholdEnabled, setLateThresholdEnabled] = useState(false)
  const [classStartTime, setClassStartTime] = useState("08:00")
  const [classEndTime, setClassEndTime] = useState("17:00")
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(15)
  const [trackCheckout, setTrackCheckout] = useState(false)
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>("attendance")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const showsLateTracking = true
  const showsDepartureRules = attendanceMode === "work_hours"

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
    setIsScheduleSectionOpen(false)
    setLateThresholdEnabled(false)
    setClassStartTime("08:00")
    setClassEndTime("17:00")
    setLateThresholdMinutes(15)
    setTrackCheckout(false)
    setAttendanceMode("attendance")
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
        attendance_mode: attendanceMode,
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

  const hasConfiguredSchedule = (showsLateTracking && lateThresholdEnabled) || showsDepartureRules

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div>
          <h3 className="text-xl font-semibold">Create group</h3>
          <p className="mt-1 text-xs font-normal text-white/65">
            Configure name and attendance schedule for this group
          </p>
        </div>
      }
      maxWidth="md">
      <div>
        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="space-y-4">
          <div className="flex flex-col">
            <FormInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate()
              }}
              placeholder="Group name"
              aria-label="Group name"
              maxLength={100}
              focusColor={isDuplicate && !confirmDuplicate ? "border-amber-400" : "border-white/20"}
              className={isDuplicate && !confirmDuplicate ? "border-amber-500/50" : ""}
            />
            {isDuplicate && !confirmDuplicate && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-400/80">
                <AlertTriangle className="size-3 shrink-0" />A group with this name already exists.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-white/8 bg-white/[0.025] px-3 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white/90">Attendance mode</div>
              <div className="mt-0.5 text-[11px] text-white/55">
                Choose what to record for this group.
              </div>
            </div>
            <div className="flex w-[180px] shrink-0 justify-end">
              <Dropdown
                fit
                options={[
                  { value: "attendance", label: "Attendance" },
                  { value: "work_hours", label: "Time in & time out" },
                  { value: "visits", label: "Visits" },
                ]}
                value={attendanceMode}
                onChange={(value) => {
                  if (!value) return
                  const mode = value as AttendanceMode
                  setAttendanceMode(mode)
                  setTrackCheckout(mode !== "attendance")
                }}
                allowClear={false}
                menuWidth={180}
                buttonClassName="h-8 !border-white/10 !bg-white/5 px-2.5 text-xs font-medium text-white/90 hover:!border-white/20 hover:!bg-white/[0.08]"
                optionClassName="text-xs"
              />
            </div>
          </div>

          {/* Schedule Rules Collapsible / Section */}
          <>
            <div>
              <AnimatePresence mode="wait" initial={false}>
                {!isScheduleSectionOpen && !hasConfiguredSchedule ?
                  <motion.div
                    key="collapsed"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-white/80">Schedule rules</span>
                      <span className="text-[10px] text-white/35">(optional)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsScheduleSectionOpen(true)}
                      className="text-[11px] font-medium text-cyan-400 transition-colors hover:text-cyan-300">
                      + Set schedule
                    </button>
                  </motion.div>
                : <motion.div
                    key="expanded"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-3">
                    <div className="flex items-center justify-between px-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-white/80">
                          Schedule rules
                        </span>
                        <span className="text-[10px] text-white/35">(optional)</span>
                      </div>
                      {!hasConfiguredSchedule && (
                        <button
                          type="button"
                          onClick={() => setIsScheduleSectionOpen(false)}
                          className="text-[10px] font-medium text-white/40 transition-colors hover:text-white/70">
                          Hide
                        </button>
                      )}
                    </div>

                    <div className="divide-y divide-white/6">
                      {/* Late Tracking Row */}
                      {showsLateTracking && (
                        <div className="py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-white/90">
                                Late tracking
                              </div>
                              <div className="text-[11px] text-white/55">
                                {lateThresholdEnabled ?
                                  "Flag arrivals after the scheduled start time and grace period."
                                : "Late tracking is disabled."}
                              </div>
                            </div>
                            <Switch
                              checked={lateThresholdEnabled}
                              onChange={setLateThresholdEnabled}
                              ariaLabel="Late tracking"
                            />
                          </div>

                          <AnimatePresence>
                            {lateThresholdEnabled && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="overflow-hidden">
                                <div className="flex flex-col pt-1">
                                  {/* Scheduled Start Time */}
                                  <div className="relative flex items-center gap-4 py-2 pl-4">
                                    <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-white/10" />
                                    <div className="pointer-events-none absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-white/10" />

                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs text-white/65">
                                        Scheduled start time:
                                      </div>
                                    </div>
                                    <div className="group relative flex shrink-0 items-center overflow-hidden rounded-md border border-white/10 bg-white/5 px-2.5 py-1 transition-all duration-150 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/20 hover:border-white/20 hover:bg-white/8">
                                      <Clock className="mr-2 size-3 text-white/40 transition-colors group-hover:text-white/70" />
                                      <div className="flex items-baseline gap-1 font-mono text-xs font-bold text-white/90">
                                        <span>{formatTimeDisplay(classStartTime).time}</span>
                                        <span className="text-[10px] font-medium text-white/55">
                                          {formatTimeDisplay(classStartTime).period}
                                        </span>
                                      </div>
                                      <input
                                        type="time"
                                        title=""
                                        aria-label="Scheduled start time"
                                        value={classStartTime}
                                        onChange={(e) => setClassStartTime(e.target.value)}
                                        onClick={(e) => e.currentTarget.showPicker?.()}
                                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:hidden"
                                      />
                                    </div>
                                  </div>

                                  {/* Late Grace Period */}
                                  <div className="relative flex items-center gap-4 py-2 pl-4">
                                    <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />

                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs text-white/65">Grace period:</div>
                                    </div>

                                    <div className="ml-auto flex shrink-0 items-center gap-3">
                                      {([0, 5, 10, 15, 30, 45, 60] as const).map((mins) => (
                                        <button
                                          key={mins}
                                          type="button"
                                          onClick={() => setLateThresholdMinutes(mins)}
                                          className={`relative min-w-[20px] py-1 text-center text-[11px] font-extrabold tracking-wider transition-all duration-150 ${
                                            lateThresholdMinutes === mins ? "text-cyan-400" : (
                                              "text-white/40 hover:text-white/70"
                                            )
                                          }`}>
                                          {mins === 0 ? "Exact" : `${mins}m`}
                                          {lateThresholdMinutes === mins && (
                                            <motion.div
                                              layoutId="createGroupLateUnderline"
                                              className="absolute right-1 bottom-[-2px] left-1 h-[2px] rounded-[1px] bg-cyan-400"
                                              transition={{
                                                type: "spring",
                                                stiffness: 380,
                                                damping: 30,
                                              }}
                                            />
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Departure & Checkout Tracking Row */}
                      {showsDepartureRules && (
                        <div className="py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-white/90">
                                Time in &amp; time out
                              </div>
                              <div className="text-[11px] text-white/55">
                                Records Time in and Time out from member scans.
                              </div>
                            </div>
                          </div>

                          <AnimatePresence>
                            {trackCheckout && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="overflow-hidden">
                                <div className="flex flex-col pt-1">
                                  <div className="relative flex items-center gap-4 py-2 pl-4">
                                    <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />

                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs text-white/65">
                                        Scheduled end time:
                                      </div>
                                      <div className="mt-0.5 text-[10px] text-white/40">
                                        Used for Undertime/Overtime reports. Time out still requires
                                        a scan.
                                      </div>
                                    </div>
                                    <div className="group relative flex shrink-0 items-center overflow-hidden rounded-md border border-white/10 bg-white/5 px-2.5 py-1 transition-all duration-150 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/20 hover:border-white/20 hover:bg-white/8">
                                      <Clock className="mr-2 size-3 text-white/40 transition-colors group-hover:text-white/70" />
                                      <div className="flex items-baseline gap-1 font-mono text-xs font-bold text-white/90">
                                        <span>{formatTimeDisplay(classEndTime).time}</span>
                                        <span className="text-[10px] font-medium text-white/55">
                                          {formatTimeDisplay(classEndTime).period}
                                        </span>
                                      </div>
                                      <input
                                        type="time"
                                        title=""
                                        aria-label="Scheduled end time"
                                        value={classEndTime}
                                        onChange={(e) => setClassEndTime(e.target.value)}
                                        onClick={(e) => e.currentTarget.showPicker?.()}
                                        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:hidden"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </motion.div>
                }
              </AnimatePresence>
            </div>
          </>
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
                "bg-gradient-to-b from-amber-400 to-amber-500 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] hover:from-amber-300 hover:to-amber-400 focus-visible:ring-amber-400"
              : "bg-gradient-to-b from-cyan-400 to-cyan-500 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] hover:from-cyan-300 hover:to-cyan-400 focus-visible:ring-cyan-400"
            }`}>
            {loading ?
              "Creating…"
            : confirmDuplicate && isDuplicate ?
              "Create anyway"
            : "Create group"}
          </button>
        </div>
      </div>
    </Modal>
  )
}
