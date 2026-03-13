import { motion, AnimatePresence } from "framer-motion"
import type { AttendanceSettings } from "@/components/settings/types"

interface AttendanceProps {
  attendanceSettings: AttendanceSettings
  onLateThresholdChange: (minutes: number) => void
  onLateThresholdToggle: (enabled: boolean) => void
  onAttendanceCooldownChange: (seconds: number) => void
  onSpoofDetectionToggle: (enabled: boolean) => void
  onTrackCheckoutToggle: (enabled: boolean) => void
  onDataRetentionChange: (days: number) => void
  hasSelectedGroup?: boolean
}

export function Attendance({
  attendanceSettings,
  onLateThresholdChange,
  onLateThresholdToggle,
  onAttendanceCooldownChange,
  onSpoofDetectionToggle,
  onTrackCheckoutToggle,
  onDataRetentionChange,
  hasSelectedGroup = false,
}: AttendanceProps) {
  return (
    <div className="max-w-auto space-y-6 px-10 pt-4 pb-10">
      {/* 1. Core Logic & Rules */}
      <div className="overflow-hidden">
        <div className="border-b border-white/5 py-2">
          <h3 className="flex items-center gap-2 text-[11px] font-medium text-cyan-400/50">
            <i className="fa-solid fa-clock-rotate-left text-[11px]"></i>
            Attendance Logic
          </h3>
        </div>

        <div className="py-2">
          {/* Time In & Time Out */}
          <div className="flex flex-col">
            <div className={`flex items-center gap-4 py-4 ${hasSelectedGroup ? "" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white/90">Time In & Time Out</div>
                <div className="relative min-h-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${hasSelectedGroup}-${attendanceSettings.trackCheckout}`}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs font-normal text-white/40">
                      {!hasSelectedGroup ?
                        "Select a group to enable this feature"
                      : attendanceSettings.trackCheckout ?
                        "ON: Records both when people arrive and when they leave."
                      : "OFF: Only records when people show up."}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <button
                onClick={() => onTrackCheckoutToggle(!attendanceSettings.trackCheckout)}
                disabled={!hasSelectedGroup}
                className={`relative ml-auto flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  attendanceSettings.trackCheckout ? "bg-cyan-500/30" : "bg-white/10"
                } group/toggle disabled:cursor-not-allowed disabled:opacity-50`}>
                <div
                  className={`absolute left-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    attendanceSettings.trackCheckout ? "translate-x-4.5" : "translate-x-0"
                  }`}></div>
              </button>
            </div>
          </div>

          <div className="h-px w-full bg-white/5" />

          {/* Spam Filter */}
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white/90">Spam Filter</div>
              <div className="mt-0.5 text-xs text-white/40">
                Ignore the same person if they scan again within{" "}
                {attendanceSettings.attendanceCooldownSeconds < 60 ?
                  `${attendanceSettings.attendanceCooldownSeconds} seconds`
                : `${Math.round(attendanceSettings.attendanceCooldownSeconds / 60)} minute${Math.round(attendanceSettings.attendanceCooldownSeconds / 60) !== 1 ? "s" : ""}`
                }
                .
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <span className="min-w-10 text-right text-[11px] font-medium whitespace-nowrap text-cyan-400/80">
                {attendanceSettings.attendanceCooldownSeconds < 60 ?
                  `${attendanceSettings.attendanceCooldownSeconds}s`
                : `${Math.round(attendanceSettings.attendanceCooldownSeconds / 60)}m`}
              </span>
              <input
                type="range"
                min="5"
                max="3600"
                step="5"
                value={attendanceSettings.attendanceCooldownSeconds}
                onChange={(e) => onAttendanceCooldownChange(parseInt(e.target.value))}
                className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/5 px-1 accent-cyan-500"
              />
            </div>
          </div>

          <div className="h-px w-full bg-white/5" />

          {/* Late Tracking */}
          <div className="flex flex-col">
            <div className={`flex items-center gap-4 py-4`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white/90">Late Tracking</div>
                <div className="relative min-h-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${hasSelectedGroup}-${attendanceSettings.lateThresholdEnabled}`}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs font-normal text-white/40">
                      {!hasSelectedGroup ?
                        "Select a group to enable late tracking"
                      : attendanceSettings.lateThresholdEnabled ?
                        "ON: Automatically checking for late members."
                      : "OFF: Late tracking is disabled."}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <button
                onClick={() => onLateThresholdToggle(!attendanceSettings.lateThresholdEnabled)}
                disabled={!hasSelectedGroup}
                className={`relative ml-auto flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  attendanceSettings.lateThresholdEnabled ? "bg-cyan-500/30" : "bg-white/10"
                } group/toggle disabled:cursor-not-allowed disabled:opacity-50`}>
                <div
                  className={`absolute left-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                    attendanceSettings.lateThresholdEnabled ? "translate-x-4.5" : "translate-x-0"
                  }`}></div>
              </button>
            </div>

            <AnimatePresence>
              {attendanceSettings.lateThresholdEnabled && hasSelectedGroup && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden">
                  <div className="relative flex items-center gap-4 pt-1 pb-5 pl-4">
                    <div className="absolute top-0 bottom-1/2 left-0 w-px rounded-bl-xs bg-white/10"></div>
                    <div className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 rounded-bl-xs bg-white/10"></div>

                    <div className="min-w-0 flex-1">
                      <div className="mt-0.5 text-xs text-white/40">Late threshold in minutes.</div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-3">
                      <span className="min-w-10 text-right text-[11px] font-medium whitespace-nowrap text-cyan-400/80">
                        {attendanceSettings.lateThresholdMinutes} min
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="60"
                        step="5"
                        value={attendanceSettings.lateThresholdMinutes}
                        onChange={(e) => onLateThresholdChange(parseInt(e.target.value))}
                        className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/5 px-1 accent-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 2. Security & Compliance */}
      <div className="overflow-hidden">
        <div className="border-b border-white/5 py-2">
          <h3 className="flex items-center gap-2 text-[11px] font-medium text-cyan-400/50">
            <i className="fa-solid fa-shield-halved text-[11px]"></i>
            Security & Compliance
          </h3>
        </div>

        <div className="py-2">
          {/* Anti-Spoof Detection */}
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white/90">Anti-Spoof Detection</div>
              <div className="relative min-h-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={attendanceSettings.enableSpoofDetection ? "on" : "off"}
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={{ duration: 0.15 }}
                    className="text-xs font-normal text-white/40">
                    {attendanceSettings.enableSpoofDetection ?
                      "ON: Protects against spoofing."
                    : "OFF: No protection against spoofing."}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <button
              onClick={() => onSpoofDetectionToggle(!attendanceSettings.enableSpoofDetection)}
              className={`relative ml-auto flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                attendanceSettings.enableSpoofDetection ? "bg-cyan-500/30" : "bg-white/10"
              } group/toggle disabled:cursor-not-allowed disabled:opacity-50`}>
              <div
                className={`absolute left-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  attendanceSettings.enableSpoofDetection ? "translate-x-4.5" : "translate-x-0"
                }`}></div>
            </button>
          </div>

          <div className="h-px w-full bg-white/5" />

          {/* Data Retention */}
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white/90">Data Retention</div>
              <div className="mt-0.5 text-xs text-white/40">
                {attendanceSettings.dataRetentionDays && attendanceSettings.dataRetentionDays > 0 ?
                  `Records older than ${attendanceSettings.dataRetentionDays} days are deleted automatically.`
                : "Records are kept forever."}
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-medium text-white/60">days</span>
              <input
                type="number"
                min={0}
                max={3650}
                value={attendanceSettings.dataRetentionDays ?? 0}
                onChange={(e) => onDataRetentionChange(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-14 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center text-xs font-bold text-white transition-all duration-300 outline-none focus:border-cyan-500/30 focus:ring-4 focus:ring-cyan-500/10"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
