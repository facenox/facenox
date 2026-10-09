import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { InfoPopover, Switch } from "@/components/shared"
import { attendanceManager } from "@/services"
import { useGroupStore } from "@/components/group/stores"
import type { AttendanceGroup } from "@/types/recognition"

interface GroupSettingsProps {
  group: AttendanceGroup
  onGroupsChanged?: (newGroup?: AttendanceGroup) => void
}

const SETTINGS_STATUS_SWAP_DURATION = 0.14
const SETTINGS_PANEL_ANIMATION_DURATION = 0.18

const formatTimeDisplay = (time?: string | null) => {
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

export function GroupSettings({ group, onGroupsChanged }: GroupSettingsProps) {
  const setSelectedGroup = useGroupStore((state) => state.setSelectedGroup)

  const [lateThresholdEnabled, setLateThresholdEnabled] = useState(
    Boolean(group.settings?.late_threshold_enabled),
  )
  const [classStartTime, setClassStartTime] = useState(group.settings?.class_start_time || "08:00")
  const [classEndTime, setClassEndTime] = useState(group.settings?.class_end_time || "17:00")
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(
    group.settings?.late_threshold_minutes ?? 15,
  )
  const [trackCheckout, setTrackCheckout] = useState(Boolean(group.settings?.track_checkout))

  useEffect(() => {
    setLateThresholdEnabled(Boolean(group.settings?.late_threshold_enabled))
    setClassStartTime(group.settings?.class_start_time || "08:00")
    setClassEndTime(group.settings?.class_end_time || "17:00")
    setLateThresholdMinutes(group.settings?.late_threshold_minutes ?? 15)
    setTrackCheckout(Boolean(group.settings?.track_checkout))
  }, [group])

  const saveSettings = useCallback(
    async (newSettings: NonNullable<AttendanceGroup["settings"]>) => {
      try {
        const updatedGroup: AttendanceGroup = {
          ...group,
          settings: newSettings,
        }
        await attendanceManager.updateGroup(group.id, {
          settings: newSettings,
        })
        setSelectedGroup(updatedGroup)
        onGroupsChanged?.(updatedGroup)
      } catch (err) {
        console.error("Failed to save group settings:", err)
      }
    },
    [group, onGroupsChanged, setSelectedGroup],
  )

  const handleLateToggle = (enabled: boolean) => {
    setLateThresholdEnabled(enabled)
    saveSettings({
      ...group.settings,
      late_threshold_enabled: enabled,
      class_start_time: classStartTime,
      class_end_time: trackCheckout ? classEndTime : null,
      late_threshold_minutes: lateThresholdMinutes,
      track_checkout: trackCheckout,
    })
  }

  const handleStartTimeChange = (time: string) => {
    setClassStartTime(time)
    saveSettings({
      ...group.settings,
      late_threshold_enabled: lateThresholdEnabled,
      class_start_time: time,
      class_end_time: trackCheckout ? classEndTime : null,
      late_threshold_minutes: lateThresholdMinutes,
      track_checkout: trackCheckout,
    })
  }

  const handleLateThresholdChange = (mins: number) => {
    setLateThresholdMinutes(mins)
    saveSettings({
      ...group.settings,
      late_threshold_enabled: lateThresholdEnabled,
      class_start_time: classStartTime,
      class_end_time: trackCheckout ? classEndTime : null,
      late_threshold_minutes: mins,
      track_checkout: trackCheckout,
    })
  }

  const handleCheckoutToggle = (enabled: boolean) => {
    setTrackCheckout(enabled)
    saveSettings({
      ...group.settings,
      late_threshold_enabled: lateThresholdEnabled,
      class_start_time: classStartTime,
      class_end_time: enabled ? classEndTime : null,
      late_threshold_minutes: lateThresholdMinutes,
      track_checkout: enabled,
    })
  }

  const handleEndTimeChange = (time: string) => {
    setClassEndTime(time)
    saveSettings({
      ...group.settings,
      late_threshold_enabled: lateThresholdEnabled,
      class_start_time: classStartTime,
      class_end_time: trackCheckout ? time : null,
      late_threshold_minutes: lateThresholdMinutes,
      track_checkout: trackCheckout,
    })
  }

  return (
    <div className="custom-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10">
        <div className="overflow-hidden">
          <div className="pt-6 pb-2">
            <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
              Schedule & Attendance Rules
            </h3>
          </div>

          <div className="py-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-medium text-white/90">Late Tracking</div>
                    <InfoPopover
                      title="Late Tracking"
                      description="Marks members as late if they arrive after the scheduled start time plus the specified threshold."
                      details={[
                        "If enabled, late status will be reflected in Overview and Reports.",
                      ]}
                      side="right"
                    />
                  </div>
                  <div className="relative min-h-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={String(lateThresholdEnabled)}
                        initial={{ opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 2 }}
                        transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                        className="text-xs font-normal text-white/65">
                        {lateThresholdEnabled ?
                          "Flag members as late when arriving after the scheduled start time."
                        : "Late tracking is disabled."}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                <Switch
                  checked={lateThresholdEnabled}
                  onChange={handleLateToggle}
                  ariaLabel="Late Tracking"
                />
              </div>

              <AnimatePresence>
                {lateThresholdEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: SETTINGS_PANEL_ANIMATION_DURATION, ease: "easeOut" }}
                    className="overflow-hidden">
                    <div className="flex flex-col">
                      {/* Scheduled Start Time */}
                      <div className="relative flex items-center gap-4 pt-2.5 pb-2.5 pl-4">
                        <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-px bg-white/10" />
                        <div className="pointer-events-none absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 bg-white/10" />

                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-white/65">Scheduled start time:</div>
                        </div>
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
                            value={classStartTime || "08:00"}
                            onChange={(e) => handleStartTimeChange(e.target.value)}
                            onClick={(e) => e.currentTarget.showPicker?.()}
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          />
                        </div>
                      </div>

                      {/* Late Threshold */}
                      <div className="relative flex items-center gap-4 pt-2.5 pb-2.5 pl-4">
                        <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />

                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-white/65">Late threshold:</div>
                        </div>

                        <div className="ml-auto flex shrink-0 items-center gap-3.5">
                          {([0, 5, 10, 15, 30, 45, 60] as const).map((mins) => (
                            <button
                              key={mins}
                              type="button"
                              onClick={() => handleLateThresholdChange(mins)}
                              className={`relative min-w-[20px] py-1 text-center text-[11px] font-extrabold tracking-wider transition-all duration-150 ${
                                lateThresholdMinutes === mins ? "text-cyan-400" : (
                                  "text-white/40 hover:text-white/70"
                                )
                              }`}>
                              {mins === 0 ? "Exact" : `${mins}m`}
                              {lateThresholdMinutes === mins && (
                                <motion.div
                                  layoutId="lateUnderline"
                                  className="absolute right-1.5 bottom-[-3px] left-1.5 h-[2px] rounded-[1px] bg-cyan-400"
                                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
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

            <div className="h-px w-full bg-white/8" />

            <div className="flex flex-col">
              <div className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-medium text-white/90">Entry & Exit Tracking</div>
                    <InfoPopover
                      title="Entry & Exit Tracking"
                      description="Records arrival (Time In) on the first scan, and departure (Time Out) on the most recent scan of the day."
                      details={[
                        "Single scans count as arrival only.",
                        "Subsequent scans update the departure time.",
                        "Total hours are calculated automatically.",
                      ]}
                      side="right"
                    />
                  </div>
                  <div className="relative min-h-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={String(trackCheckout)}
                        initial={{ opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 2 }}
                        transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                        className="text-xs font-normal text-white/65">
                        {trackCheckout ?
                          "Record both arrival (Time In) and departure (Time Out) events."
                        : "Only recording arrival times."}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                <Switch
                  checked={trackCheckout}
                  onChange={handleCheckoutToggle}
                  ariaLabel="Entry & Exit Tracking"
                />
              </div>

              <AnimatePresence>
                {trackCheckout && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: SETTINGS_PANEL_ANIMATION_DURATION, ease: "easeOut" }}
                    className="overflow-hidden">
                    <div className="flex flex-col">
                      {/* Scheduled End Time */}
                      <div className="relative flex items-center gap-4 pt-2.5 pb-2.5 pl-4">
                        <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />

                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-white/65">Scheduled end time:</div>
                        </div>
                        <div className="group relative flex shrink-0 items-center overflow-hidden rounded-md border border-white/10 bg-white/5 px-2.5 py-1 transition-all duration-150 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400 hover:border-cyan-500/40 hover:bg-white/8">
                          <i className="fa-regular fa-clock mr-2 text-[10px] text-white/40 transition-colors group-hover:text-cyan-400" />
                          <div className="flex items-baseline gap-1 font-mono text-xs font-bold text-white/90">
                            <span>{formatTimeDisplay(classEndTime || "17:00").time}</span>
                            <span className="text-[10px] font-medium text-white/55">
                              {formatTimeDisplay(classEndTime || "17:00").period}
                            </span>
                          </div>
                          <input
                            type="time"
                            aria-label="Scheduled end time"
                            value={classEndTime || "17:00"}
                            onChange={(e) => handleEndTimeChange(e.target.value)}
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
      </div>
    </div>
  )
}
