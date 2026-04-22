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
                  <div className="text-sm font-medium text-white/90">Entry & Exit Tracking</div>
                  <InfoPopover
                    title="Entry & Exit Tracking"
                    description="Record two events per person per day: the first scan as arrival (Time In) and the most recent scan as departure (Time Out)."
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
                      key={`${hasSelectedGroup}-${attendanceSettings.trackCheckout}`}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-xs font-normal text-white/60">
                      {!hasSelectedGroup ?
                        "Select a group to enable this feature"
                      : attendanceSettings.trackCheckout ?
                        "Record both arrival and departure times."
                      : "Only record arrival times."}
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
                <div className="text-sm font-medium text-white/90">Duplicate Prevention</div>
                <InfoPopover
                  title="Duplicate Prevention"
                  description="Automatically filters out repeated scans from the same person to keep your reports clean."
                  details={[
                    "Always active to ensure accurate attendance and reporting.",
                    "Short Window: Best for high-traffic areas or tracking movement.",
                    "Long Window: Recommended for simple daily attendance.",
                  ]}
                  side="right"
                />
              </div>
              <div className="mt-0.5 text-xs text-white/40">
                Prevent duplicate logs if a person scans again within{" "}
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

          <div className="flex flex-col">
            <div className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium text-white/90">Recognition Limit</div>
                  <InfoPopover
                    title="Recognition Limit"
                    description="Limit how many faces are recognized per frame to optimize performance."
                    details={[
                      "Lower limits improve processing speed.",
                      "Unlimited mode is best for large crowds.",
                      "The system prioritizes the largest, closest faces.",
                    ]}
                    side="right"
                  />
                </div>
                <div className="relative min-h-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={attendanceSettings.maxRecognitionFacesPerFrame > 0 ? "on" : "off"}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-xs font-normal text-white/60">
                      {attendanceSettings.maxRecognitionFacesPerFrame === 0 ?
                        "Process all detected faces."
                      : "Limit recognition to a specific number of faces."}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <button
                onClick={() => {
                  if (attendanceSettings.maxRecognitionFacesPerFrame === 0) {
                    onMaxRecognitionFacesChange(6)
                  } else {
                    onMaxRecognitionFacesChange(0)
                  }
                }}
                className={`premium-switch ${
                  attendanceSettings.maxRecognitionFacesPerFrame > 0 ?
                    "premium-switch-on"
                  : "premium-switch-off"
                }`}>
                <div
                  className={`premium-switch-thumb ${
                    attendanceSettings.maxRecognitionFacesPerFrame > 0 ?
                      "premium-switch-thumb-on"
                    : "premium-switch-thumb-off"
                  }`}
                />
              </button>
            </div>

            <AnimatePresence>
              {attendanceSettings.maxRecognitionFacesPerFrame > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: SETTINGS_PANEL_ANIMATION_DURATION, ease: "easeOut" }}
                  className="overflow-hidden">
                  <div className="relative flex items-center gap-4 pt-3 pb-3 pl-4">
                    <div className="absolute top-0 bottom-1/2 left-0 w-px rounded-bl-xs bg-white/10"></div>
                    <div className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 rounded-bl-xs bg-white/10"></div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white/40">
                        Maximum faces to process per frame.
                      </div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-3">
                      <span className="min-w-10 text-right text-[11px] font-medium whitespace-nowrap text-cyan-400/80">
                        {attendanceSettings.maxRecognitionFacesPerFrame} faces
                      </span>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        value={attendanceSettings.maxRecognitionFacesPerFrame}
                        onChange={(e) => onMaxRecognitionFacesChange(parseInt(e.target.value))}
                        className="premium-range h-1 w-24 accent-cyan-500"
                      />
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
                  <div className="text-sm font-medium text-white/90">Late Tracking</div>
                  <InfoPopover
                    title="Late Tracking"
                    description="Automatically mark members as late if their arrival occurs after the scheduled start time plus the late threshold."
                    details={[
                      "Requires a group selection.",
                      "Late status appears in Reports and Overview.",
                      "Threshold is defined in minutes.",
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
                        "Automatically mark members as late."
                      : "Late tracking is disabled."}
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
                  <div className="relative flex items-center gap-4 pt-3 pb-3 pl-4">
                    <div className="absolute top-0 bottom-1/2 left-0 w-px rounded-bl-xs bg-white/10"></div>
                    <div className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 rounded-bl-xs bg-white/10"></div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white/40">Late threshold in minutes.</div>
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
                <div className="text-sm font-medium text-white/90">Liveness Verification</div>
                <InfoPopover
                  title="Liveness Verification"
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
                      "Verify faces are real before recognition."
                    : "Skip liveness verification."}
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
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Data Retention</div>
                <InfoPopover
                  title="Data Retention Guide"
                  description="Controls how long attendance logs and biometric signatures are stored in your local database."
                  detailsNode={[
                    <div key="how-it-works" className="space-y-1.5">
                      <div className="font-semibold text-white/90">How it works:</div>
                      <ul className="list-disc space-y-1 pl-4 text-white/60">
                        <li>Pruning occurs automatically every 24 hours.</li>
                        <li>Expired records are permanently deleted.</li>
                        <li>Setting this to 0 disables automatic deletion.</li>
                      </ul>
                    </div>,
                    <div key="tip" className="rounded-md bg-white/5 p-2 text-[10px] text-white/50">
                      <span className="font-medium text-white/70">Tip:</span> Shorter retention
                      periods keep the app faster and comply better with modern privacy laws.
                    </div>,
                  ]}
                />
              </div>
              <div className="mt-0.5 text-xs text-white/40">
                {(() => {
                  const totalDays = attendanceSettings.dataRetentionDays
                  if (!totalDays || totalDays <= 0) return "Keep all records forever."

                  const years = Math.floor(totalDays / 365)
                  const remainingDays = totalDays % 365
                  const months = Math.floor(remainingDays / 30)

                  let timeStr = ""
                  if (years > 0) {
                    timeStr += `${years} ${years === 1 ? "year" : "years"}`
                    if (months > 0) {
                      timeStr += ` and ${months} ${months === 1 ? "month" : "months"}`
                    }
                  } else if (months > 0) {
                    timeStr = `${months} ${months === 1 ? "month" : "months"}`
                  } else {
                    timeStr = `${totalDays} ${totalDays === 1 ? "day" : "days"}`
                  }

                  return `Delete records older than ${timeStr} automatically.`
                })()}
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-medium text-white/60">days</span>
              <input
                type="text"
                inputMode="numeric"
                value={attendanceSettings.dataRetentionDays ?? 0}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "")
                  const num = raw === "" ? 0 : parseInt(raw, 10)
                  onDataRetentionChange(Math.min(3650, num))
                }}
                className="w-14 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-2 py-1.5 text-center text-xs font-bold text-white transition-all duration-300 outline-none focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
