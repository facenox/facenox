import { motion, AnimatePresence } from "framer-motion"
import type { AttendanceSettings } from "@/components/settings/types"
import { InfoPopover } from "@/components/shared"

interface AttendanceProps {
  attendanceSettings: AttendanceSettings
  onLateThresholdChange: (minutes: number) => void
  onLateThresholdToggle: (enabled: boolean) => void
  onAttendanceCooldownChange: (seconds: number) => void
  onSpoofDetectionToggle: (enabled: boolean) => void
  onMaxRecognitionFacesChange: (count: number) => void
  onTrackCheckoutToggle: (enabled: boolean) => void
  onDataRetentionChange: (days: number) => void
  hasSelectedGroup?: boolean
}

const SETTINGS_STATUS_SWAP_DURATION = 0.14
const SETTINGS_PANEL_ANIMATION_DURATION = 0.18

export function Attendance({
  attendanceSettings,
  onLateThresholdChange,
  onLateThresholdToggle,
  onAttendanceCooldownChange,
  onSpoofDetectionToggle,
  onMaxRecognitionFacesChange,
  onTrackCheckoutToggle,
  onDataRetentionChange,
  hasSelectedGroup = false,
}: AttendanceProps) {
  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-4 pb-10">
      <div className="overflow-hidden">
        <div className="border-b border-white/5 pt-6 pb-2">
          <h3 className="text-[10px] font-bold tracking-[0.15em] text-white/30 uppercase">
            Attendance Logic
          </h3>
        </div>

        <div className="py-2">
          <div className="flex flex-col">
            <div className={`flex items-center gap-4 py-4 ${hasSelectedGroup ? "" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium text-white/90">Time In & Time Out</div>
                  <InfoPopover
                    title="Time In & Time Out"
                    description="When enabled, the system records two events per person per day - their first scan as arrival (Time In) and their most recent scan as departure (Time Out)."
                    details={[
                      "Only 1 scan = Time In only, no Time Out.",
                      "Each scan after the first updates the Time Out.",
                      "Hours worked is calculated automatically.",
                    ]}
                    side="right"
                  />
                </div>
                <div className="relative min-h-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${hasSelectedGroup}-${attendanceSettings.trackCheckout}`}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-xs font-normal text-white/60">
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
                className={`premium-switch ${attendanceSettings.trackCheckout ? "premium-switch-on" : "premium-switch-off"} group/toggle disabled:cursor-not-allowed disabled:opacity-50`}>
                <div
                  className={`premium-switch-thumb ${attendanceSettings.trackCheckout ? "premium-switch-thumb-on" : "premium-switch-thumb-off"}`}></div>
              </button>
            </div>
          </div>

          <div className="h-px w-full bg-white/8" />

          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Spam Filter</div>
                <InfoPopover
                  title="Spam Filter"
                  description="Prevents the same person from being logged again until the cooldown window expires. Applies to both Activity Log entries and the audio cue."
                  details={[
                    "Cannot be disabled - fundamental to system integrity.",
                    "Short window (5s-30s) = more detailed raw logs.",
                    "Long window (1m-1h) = cleaner, session-style logs.",
                  ]}
                  side="right"
                />
              </div>
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
                className="premium-range h-1 w-24 accent-cyan-500"
              />
            </div>
          </div>

          <div className="h-px w-full bg-white/8" />

          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Max Recognized Faces</div>
                <InfoPopover
                  title="Max Recognized Faces"
                  description="Limits how many detected faces are sent to recognition per frame. Detection still sees everything; only recognition is capped."
                  details={[
                    "Lower values improve speed and stability.",
                    "Higher values help in crowded scenes but use more CPU.",
                    "Largest plausible faces are prioritized first.",
                  ]}
                  side="right"
                />
              </div>
              <div className="mt-0.5 text-xs text-white/40">
                Recognize up to {attendanceSettings.maxRecognitionFacesPerFrame} face
                {attendanceSettings.maxRecognitionFacesPerFrame === 1 ? "" : "s"} per frame.
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <span className="min-w-10 text-right text-[11px] font-medium whitespace-nowrap text-cyan-400/80">
                {attendanceSettings.maxRecognitionFacesPerFrame}
              </span>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={attendanceSettings.maxRecognitionFacesPerFrame}
                onChange={(e) => onMaxRecognitionFacesChange(parseInt(e.target.value))}
                className="premium-range h-1 w-24 accent-cyan-500"
              />
            </div>
          </div>

          <div className="h-px w-full bg-white/8" />

          <div className="flex flex-col">
            <div className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium text-white/90">Late Tracking</div>
                  <InfoPopover
                    title="Late Tracking"
                    description="Automatically marks members as late if their first scan occurs after the group's configured class start time plus the late threshold."
                    details={[
                      "Requires a group to be selected.",
                      "Late status appears in Reports and Overview.",
                      "Set in group settings: Start Time + Threshold (minutes).",
                    ]}
                    side="right"
                  />
                </div>
                <div className="relative min-h-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${hasSelectedGroup}-${attendanceSettings.lateThresholdEnabled}`}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-xs font-normal text-white/60">
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
                className={`premium-switch ${attendanceSettings.lateThresholdEnabled ? "premium-switch-on" : "premium-switch-off"} group/toggle disabled:cursor-not-allowed disabled:opacity-50`}>
                <div
                  className={`premium-switch-thumb ${attendanceSettings.lateThresholdEnabled ? "premium-switch-thumb-on" : "premium-switch-thumb-off"}`}></div>
              </button>
            </div>

            <AnimatePresence>
              {attendanceSettings.lateThresholdEnabled && hasSelectedGroup && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: SETTINGS_PANEL_ANIMATION_DURATION, ease: "easeOut" }}
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
                        className="premium-range h-1 w-24 accent-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="border-b border-white/5 pt-6 pb-2">
          <h3 className="text-[10px] font-bold tracking-[0.15em] text-white/30 uppercase">
            Security & Compliance
          </h3>
        </div>

        <div className="py-2">
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Anti-Spoof Detection</div>
                <InfoPopover
                  title="Anti-Spoof Detection"
                  description="Requires a live face before showing identity or recording attendance, helping block photo and screen replay attempts."
                  details={[
                    "Uses liveness detection under the hood.",
                    "Can show guidance like Center your face, Move closer, or Verifying....",
                    "Works best with balanced lighting and a clear front-facing view.",
                    "May slightly reduce recognition speed when enabled.",
                  ]}
                  side="right"
                />
              </div>
              <div className="relative min-h-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={attendanceSettings.enableSpoofDetection ? "on" : "off"}
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                    className="text-xs font-normal text-white/60">
                    {attendanceSettings.enableSpoofDetection ?
                      "ON: Requires a live face before showing identity or recording attendance."
                    : "OFF: Identity can appear without a live-face check."}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <button
              onClick={() => onSpoofDetectionToggle(!attendanceSettings.enableSpoofDetection)}
              aria-label="Toggle anti-spoof detection"
              className={`premium-switch ${attendanceSettings.enableSpoofDetection ? "premium-switch-on" : "premium-switch-off"} group/toggle disabled:cursor-not-allowed disabled:opacity-50`}>
              <div
                className={`premium-switch-thumb ${attendanceSettings.enableSpoofDetection ? "premium-switch-thumb-on" : "premium-switch-thumb-off"}`}></div>
            </button>
          </div>

          <div className="h-px w-full bg-white/8" />

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
                className="w-14 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-2 py-1.5 text-center text-xs font-bold text-white transition-all duration-300 outline-none focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
