import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, ChevronDown, Clock, Loader2, Lock } from "lucide-react"
import { InfoPopover, Switch } from "@/components/shared"
import { attendanceManager } from "@/services"
import { useGroupStore } from "@/components/group/stores"
import { useCloudSyncStatus } from "@/components/common"
import { DeleteConfirmationModal } from "@/components/main/components/DeleteConfirmationModal"
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
  const deleteGroup = useGroupStore((state) => state.deleteGroup)
  const { isPaired, allowKioskDirectoryManagement } = useCloudSyncStatus()
  const isDeleteDisabled = isPaired && !allowKioskDirectoryManagement

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false)

  const [lateThresholdEnabled, setLateThresholdEnabled] = useState(
    Boolean(group.settings?.late_threshold_enabled),
  )
  const [classStartTime, setClassStartTime] = useState(group.settings?.class_start_time || "08:00")
  const [classEndTime, setClassEndTime] = useState(group.settings?.class_end_time || "17:00")
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(
    group.settings?.late_threshold_minutes ?? 15,
  )
  const [trackCheckout, setTrackCheckout] = useState(Boolean(group.settings?.track_checkout))
  const [minCheckoutDelayMinutes, setMinCheckoutDelayMinutes] = useState(
    group.settings?.min_checkout_delay_minutes ?? 15,
  )

  const handleDeleteGroup = async () => {
    if (isDeleteDisabled || isDeleting) return
    setIsDeleting(true)
    try {
      await deleteGroup(group.id)
      setIsDeleteModalOpen(false)
      onGroupsChanged?.()
    } catch (err) {
      console.error("Failed to delete group:", err)
    } finally {
      setIsDeleting(false)
    }
  }

  useEffect(() => {
    setLateThresholdEnabled(Boolean(group.settings?.late_threshold_enabled))
    setClassStartTime(group.settings?.class_start_time || "08:00")
    setClassEndTime(group.settings?.class_end_time || "17:00")
    setLateThresholdMinutes(group.settings?.late_threshold_minutes ?? 15)
    setTrackCheckout(Boolean(group.settings?.track_checkout))
    setMinCheckoutDelayMinutes(group.settings?.min_checkout_delay_minutes ?? 15)
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
      min_checkout_delay_minutes: minCheckoutDelayMinutes,
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
      min_checkout_delay_minutes: minCheckoutDelayMinutes,
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
      min_checkout_delay_minutes: minCheckoutDelayMinutes,
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
      min_checkout_delay_minutes: minCheckoutDelayMinutes,
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
      min_checkout_delay_minutes: minCheckoutDelayMinutes,
    })
  }

  return (
    <div className="custom-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10">
        <div className="overflow-hidden">
          <div className="pt-6 pb-2">
            <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
              Schedule & attendance rules
            </h3>
          </div>

          <div className="py-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-medium text-white/90">Late tracking</div>
                    <InfoPopover
                      title="Late tracking"
                      description="Mark arrivals as late after the scheduled start time and grace period."
                      details={[
                        "Set the start time and grace period for this group.",
                        "Late status appears in the overview, member history, and CSV reports.",
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
                          "Flag arrivals after the scheduled start time and grace period."
                        : "Late tracking is disabled."}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                <Switch
                  checked={lateThresholdEnabled}
                  onChange={handleLateToggle}
                  ariaLabel="Late tracking"
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
                            value={classStartTime || "08:00"}
                            onChange={(e) => handleStartTimeChange(e.target.value)}
                            onClick={(e) => e.currentTarget.showPicker?.()}
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:hidden"
                          />
                        </div>
                      </div>

                      {/* Late Threshold */}
                      <div className="relative flex items-center gap-4 pt-2.5 pb-2.5 pl-4">
                        <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />

                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-white/65">Grace period:</div>
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
                    <div className="text-sm font-medium text-white/90">Entry & exit tracking</div>
                    <InfoPopover
                      title="Entry & exit tracking"
                      description="Records daily check-in and checkout times from member scans."
                      details={[
                        "Registers arrival on the first scan of the day.",
                        "Updates checkout time on later eligible scans.",
                        `Waits ${minCheckoutDelayMinutes} ${minCheckoutDelayMinutes === 1 ? "minute" : "minutes"} after check-in before allowing checkout.`,
                        "Calculates elapsed hours between check-in and checkout.",
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
                          "Record arrival (time in) and departure (time out)."
                        : "Record arrival times only."}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                <Switch
                  checked={trackCheckout}
                  onChange={handleCheckoutToggle}
                  ariaLabel="Entry & exit tracking"
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
                        <div className="group relative flex shrink-0 items-center overflow-hidden rounded-md border border-white/10 bg-white/5 px-2.5 py-1 transition-all duration-150 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/20 hover:border-white/20 hover:bg-white/8">
                          <Clock className="mr-2 size-3 text-white/40 transition-colors group-hover:text-white/70" />
                          <div className="flex items-baseline gap-1 font-mono text-xs font-bold text-white/90">
                            <span>{formatTimeDisplay(classEndTime || "17:00").time}</span>
                            <span className="text-[10px] font-medium text-white/55">
                              {formatTimeDisplay(classEndTime || "17:00").period}
                            </span>
                          </div>
                          <input
                            type="time"
                            title=""
                            aria-label="Scheduled end time"
                            value={classEndTime || "17:00"}
                            onChange={(e) => handleEndTimeChange(e.target.value)}
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
          </div>
        </div>

        <span className="sr-only">Danger zone toggle</span>
        {/* Danger Zone */}
        <section className="relative flex w-full flex-col items-center overflow-hidden pt-8 pb-2">
          {/* Sleek fading gradient divider to match the centered design */}
          <div className="absolute top-0 right-0 left-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
          {/* Sleek centered trigger */}
          <button
            type="button"
            onClick={() => setIsDangerZoneOpen(!isDangerZoneOpen)}
            className="group flex items-center gap-2.5 rounded-md border-0 bg-transparent px-5 py-2 text-[11px] font-extrabold tracking-[0.2em] text-red-500/40 uppercase shadow-none transition-all duration-300 outline-none hover:bg-red-500/[0.04] hover:text-red-400 focus:outline-none active:scale-95">
            <AlertTriangle className="size-3 opacity-60 transition-transform group-hover:scale-110" />
            <span>Danger zone</span>
            <ChevronDown
              className={`inline-block size-3 opacity-50 transition-transform duration-200 ${
                isDangerZoneOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <AnimatePresence>
            {isDangerZoneOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: SETTINGS_PANEL_ANIMATION_DURATION, ease: "easeOut" }}
                className="w-full overflow-hidden">
                <div className="w-full divide-y divide-red-500/5 pt-4 pb-8">
                  <div className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1 text-left">
                      <h4 className="text-[15px] font-semibold text-red-400/80">
                        Delete this group
                      </h4>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">
                        Permanently delete this group, all member profiles, and enrolled biometric
                        face data.
                        <span className="mt-1 block text-[12px] font-medium text-red-400/85">
                          This action cannot be undone.
                        </span>
                        {isDeleteDisabled && (
                          <span className="mt-1 block font-medium text-amber-400/80">
                            <Lock className="mr-1 inline size-3" />
                            Locked by Cloud Policy: Group deletion is disabled on kiosks.
                          </span>
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsDeleteModalOpen(true)}
                      disabled={isDeleteDisabled || isDeleting}
                      title={isDeleteDisabled ? "Locked by Cloud Policy" : undefined}
                      className="flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-rose-500/25 bg-rose-500/10 px-5 py-2 text-[12px] font-bold text-rose-400 transition-all hover:border-rose-500/40 hover:bg-rose-500/20 active:scale-95 disabled:opacity-20 md:self-center">
                      {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
                      <span>Delete group</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <DeleteConfirmationModal
        showDeleteConfirmation={isDeleteModalOpen}
        groupToDelete={group}
        currentGroup={group}
        cancelDeleteGroup={() => setIsDeleteModalOpen(false)}
        confirmDeleteGroup={handleDeleteGroup}
      />
    </div>
  )
}
