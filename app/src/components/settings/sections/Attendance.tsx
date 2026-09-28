import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { AttendanceSettings } from "@/components/settings/types"
import { InfoPopover, Switch } from "@/components/shared"
import { useUIStore } from "@/components/main/stores"

interface AttendanceProps {
  attendanceSettings: AttendanceSettings
  onLateThresholdChange: (minutes: number) => void
  onLateThresholdToggle: (enabled: boolean) => void
  onAttendanceCooldownChange: (seconds: number) => void
  onSpoofDetectionToggle: (enabled: boolean) => void
  onMaxRecognitionFacesChange: (count: number) => void
  onTrackCheckoutToggle: (enabled: boolean) => void
  onDataRetentionChange: (days: number) => void
  onBiometricConsentToggle?: (enabled: boolean) => void
  hasSelectedGroup?: boolean
  isPaired?: boolean
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
  onBiometricConsentToggle,
  hasSelectedGroup = false,
  isPaired = false,
}: AttendanceProps) {
  const adminPinEnabled = useUIStore((state) => state.adminPinEnabled)
  const adminPin = useUIStore((state) => state.adminPin)
  const setAdminPinSettings = useUIStore((state) => state.setAdminPinSettings)

  const [pinValue, setPinValue] = useState(adminPin || "1234")
  const [showPin, setShowPin] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    if (adminPin) {
      setPinValue(adminPin)
    }
  }, [adminPin])

  const handlePinChange = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 4)
    setPinValue(cleaned)
    if (cleaned.length === 4) {
      setAdminPinSettings({ adminPin: cleaned })
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const allowedChoices = [1, 2, 5, 10, 15, 20] as const
  const activeLimit =
    (allowedChoices as readonly number[]).includes(attendanceSettings.maxRecognitionFacesPerFrame) ?
      attendanceSettings.maxRecognitionFacesPerFrame
    : 5

  const cloudCeiling =
    (
      isPaired &&
      typeof attendanceSettings.cloudRetentionDays === "number" &&
      attendanceSettings.cloudRetentionDays > 0
    ) ?
      attendanceSettings.cloudRetentionDays
    : null
  const isCloudUnlimited =
    isPaired &&
    typeof attendanceSettings.cloudRetentionDays === "number" &&
    attendanceSettings.cloudRetentionDays <= 0

  const rawLocalDays = attendanceSettings.dataRetentionDays ?? 0
  const effectiveDays =
    cloudCeiling ?
      rawLocalDays > 0 && rawLocalDays <= cloudCeiling ?
        rawLocalDays
      : cloudCeiling
    : Math.max(0, rawLocalDays)

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10">
      <div className="overflow-hidden">
        <div className="pt-6 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Group Settings
          </h3>
        </div>

        <div className="py-2">
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
                      key={`${hasSelectedGroup}-${attendanceSettings.trackCheckout}`}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-xs font-normal text-white/65">
                      {!hasSelectedGroup ?
                        "Select a group to enable this feature"
                      : attendanceSettings.trackCheckout ?
                        "Record both arrival and departure times."
                      : "Only record arrival times."}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <Switch
                checked={attendanceSettings.trackCheckout}
                onChange={onTrackCheckoutToggle}
                disabled={!hasSelectedGroup}
                ariaLabel="Entry & Exit Tracking"
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
                    description="Marks members as late if they arrive after the scheduled start time plus the specified threshold."
                    details={["If enabled, late status will be reflected in Overview and Reports."]}
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
                      className="text-xs font-normal text-white/65">
                      {!hasSelectedGroup ?
                        "Select a group to enable late tracking"
                      : attendanceSettings.lateThresholdEnabled ?
                        "Automatically mark members as late based on scheduled start times."
                      : "Late tracking is disabled."}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <Switch
                checked={attendanceSettings.lateThresholdEnabled}
                onChange={onLateThresholdToggle}
                disabled={!hasSelectedGroup}
                ariaLabel="Late Tracking"
              />
            </div>

            <AnimatePresence>
              {attendanceSettings.lateThresholdEnabled && hasSelectedGroup && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: SETTINGS_PANEL_ANIMATION_DURATION, ease: "easeOut" }}
                  className="overflow-hidden">
                  <div className="relative flex items-center gap-4 pt-2.5 pb-2.5 pl-4">
                    <div className="absolute top-0 bottom-1/2 left-0 w-px rounded-bl-xs bg-white/10"></div>
                    <div className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 rounded-bl-xs bg-white/10"></div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white/65">Late threshold:</div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-4">
                      {([5, 10, 15, 30, 45, 60] as const).map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => onLateThresholdChange(mins)}
                          className={`relative min-w-[24px] py-1 text-center text-[11px] font-extrabold tracking-wider transition-all duration-150 ${
                            attendanceSettings.lateThresholdMinutes === mins ?
                              "text-cyan-400"
                            : "text-white/40 hover:text-white/70"
                          }`}>
                          {mins}m
                          {attendanceSettings.lateThresholdMinutes === mins && (
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-px w-full bg-white/8" />

          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Biometric Consent</div>
                <InfoPopover
                  title="Biometric Consent"
                  description="Certifies that biometric consent is managed off-system. Enabling this bypasses manual consent confirmation checkboxes when adding or editing members."
                  details={[
                    "Certifies that consent is managed off-system.",
                    "Removes manual checkbox prompts on member add/edit.",
                    "Enables immediate one-click enrollment.",
                  ]}
                  side="right"
                />
              </div>
              <div className="relative min-h-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${hasSelectedGroup}-${attendanceSettings.biometricConsentCertified}`}
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                    className="text-xs font-normal text-white/65">
                    {!hasSelectedGroup ?
                      "Select a group to enable this feature"
                    : attendanceSettings.biometricConsentCertified ?
                      "Bypass manual consent checkboxes when adding or editing members."
                    : "Require manual consent checkbox certification when adding or editing members."
                    }
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <Switch
              checked={attendanceSettings.biometricConsentCertified}
              onChange={(checked) => onBiometricConsentToggle?.(checked)}
              disabled={!hasSelectedGroup}
              ariaLabel="Biometric Consent"
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="pt-6 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Global Settings
          </h3>
        </div>

        <div className="py-2">
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Duplicate Prevention</div>
                <InfoPopover
                  title="Duplicate Prevention"
                  description="Automatically filters out repeated scans from the same person to keep reports clean."
                  details={[
                    "Always active to ensure clean and consolidated attendance records.",
                    "Short Window: Best for high-traffic areas or tracking movement.",
                    "Long Window: Recommended for simple daily attendance.",
                  ]}
                  side="right"
                />
              </div>
              <div className="relative min-h-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key="cooldown-active"
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                    className="text-xs font-normal text-white/65">
                    Automatically filters out repeated scans from the same person to keep reports
                    clean.
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-4">
              {([5, 30, 60, 300, 600, 1800] as const).map((secs) => (
                <button
                  key={secs}
                  type="button"
                  onClick={() => onAttendanceCooldownChange(secs)}
                  className={`relative min-w-[24px] py-1 text-center text-[11px] font-extrabold tracking-wider transition-all duration-150 ${
                    attendanceSettings.attendanceCooldownSeconds === secs ?
                      "text-cyan-400"
                    : "text-white/40 hover:text-white/70"
                  }`}>
                  {secs < 60 ? `${secs}s` : `${secs / 60}m`}
                  {attendanceSettings.attendanceCooldownSeconds === secs && (
                    <motion.div
                      layoutId="cooldownUnderline"
                      className="absolute right-1.5 bottom-[-3px] left-1.5 h-[2px] rounded-[1px] bg-cyan-400"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              ))}
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
                    description="Limits how many faces are recognized per frame to optimize performance on this physical device."
                    details={[
                      "Hardware-specific: Adjust based on this device's CPU/GPU load and camera location.",
                      "Lower limits (1-5) improve processing speed and prevent frame drops.",
                      "If disabled, the system will attempt to recognize all faces detected in each frame.",
                      "The system prioritizes the largest, closest faces first.",
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
                      className="text-xs font-normal text-white/65">
                      {attendanceSettings.maxRecognitionFacesPerFrame === 0 ?
                        "Process all detected faces without limits."
                      : "Limit the maximum number of faces recognized per frame to optimize performance."
                      }
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <Switch
                checked={attendanceSettings.maxRecognitionFacesPerFrame > 0}
                onChange={(checked) => onMaxRecognitionFacesChange(checked ? 6 : 0)}
                ariaLabel="Multi-Face Recognition"
              />
            </div>

            <AnimatePresence>
              {attendanceSettings.maxRecognitionFacesPerFrame > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: SETTINGS_PANEL_ANIMATION_DURATION, ease: "easeOut" }}
                  className="overflow-hidden">
                  <div className="relative flex items-center gap-4 pt-2.5 pb-2.5 pl-4">
                    <div className="absolute top-0 bottom-1/2 left-0 w-px rounded-bl-xs bg-white/10"></div>
                    <div className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 rounded-bl-xs bg-white/10"></div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white/65">Limit to:</div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-4">
                      {allowedChoices.map((faces) => (
                        <button
                          key={faces}
                          type="button"
                          onClick={() => onMaxRecognitionFacesChange(faces)}
                          className={`relative min-w-[24px] py-1 text-center text-[11px] font-extrabold tracking-wider transition-all duration-150 ${
                            activeLimit === faces ? "text-cyan-400" : (
                              "text-white/40 hover:text-white/70"
                            )
                          }`}>
                          {faces}
                          {activeLimit === faces && (
                            <motion.div
                              layoutId="facesUnderline"
                              className="absolute right-1.5 bottom-[-3px] left-1.5 h-[2px] rounded-[1px] bg-cyan-400"
                              transition={{ type: "spring", stiffness: 380, damping: 30 }}
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-px w-full bg-white/8" />

          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Liveness Verification</div>
                <InfoPopover
                  title="Liveness Verification"
                  description="Requires a live face before recording attendance, helping block photo and screen replay attempts."
                  details={[
                    "Prevents spoofing using real-time passive liveness checks.",
                    "Can be toggled per device based on camera quality and lighting, unless enforced by organization policy.",
                    "Works best with balanced lighting and a clear front-facing view.",
                    "May slightly increase recognition processing time on lower-powered devices.",
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
                    className="text-xs font-normal text-white/65">
                    {attendanceSettings.forceLiveness ?
                      "Managed by your organization."
                    : attendanceSettings.enableSpoofDetection ?
                      "Verifies physical presence to prevent spoofing."
                    : "Liveness verification is disabled."}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <Switch
              checked={attendanceSettings.enableSpoofDetection || attendanceSettings.forceLiveness}
              onChange={onSpoofDetectionToggle}
              disabled={attendanceSettings.forceLiveness}
              ariaLabel="Liveness Verification (Anti-Spoof)"
            />
          </div>

          <div className="h-px w-full bg-white/8" />

          {/* Retention Policy (Local Kiosk Cache with Cloud Plan Constraint) */}
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-white/90">Retention Policy</div>
                {isPaired &&
                  (cloudCeiling ?
                    <span className="inline-flex items-center gap-1 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                      <i className="fa-solid fa-cloud text-[9px]" /> Cloud plan: {cloudCeiling}d max
                    </span>
                  : isCloudUnlimited ?
                    <span className="inline-flex items-center gap-1 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300">
                      <i className="fa-solid fa-cloud text-[9px]" /> Cloud plan: Unlimited
                    </span>
                  : null)}
                <InfoPopover
                  title="Data Retention"
                  description="Controls how long past attendance check-in logs are kept on this device. Member profiles and enrolled face signatures are never deleted."
                  details={[
                    "Pruning runs automatically every 24 hours on this device.",
                    "Only past attendance check-in and checkout logs are deleted to free up disk space.",
                    "Member profiles, groups, and enrolled face data remain safe forever.",
                    isPaired && cloudCeiling ?
                      `When paired, local retention cannot exceed your cloud subscription window of ${cloudCeiling} days.`
                    : "Setting this to 0 disables automatic deletion and keeps local attendance logs indefinitely.",
                  ]}
                  detailsNode={[
                    <div
                      key="retention-tip"
                      data-hide-chevron
                      className="rounded-md bg-white/5 p-2 text-[11px] text-white/65">
                      <span className="font-medium text-white/65">Tip:</span> Shorter retention
                      periods keep the app faster and comply better with modern privacy laws.
                    </div>,
                  ]}
                  side="right"
                />
              </div>
              <div className="mt-0.5 text-xs text-white/65">
                {(() => {
                  if (cloudCeiling) {
                    if (effectiveDays === cloudCeiling) {
                      return `Attendance check-in logs older than ${cloudCeiling} days are pruned (matches cloud plan limit). Member profiles and face data are never deleted.`
                    }
                    return `Attendance check-in logs older than ${effectiveDays} days are pruned locally (Cloud keeps up to ${cloudCeiling} days). Member profiles and face data are never deleted.`
                  }
                  if (isCloudUnlimited) {
                    return effectiveDays <= 0 ?
                        "Cloud plan allows unlimited history. Attendance logs are kept forever."
                      : `Cloud plan allows unlimited history. Attendance logs older than ${effectiveDays} days are pruned automatically. Member profiles and face data are never deleted.`
                  }
                  if (effectiveDays <= 0)
                    return "Keep all attendance logs forever. Member profiles and face data are never deleted."

                  const years = Math.floor(effectiveDays / 365)
                  const remainingDays = effectiveDays % 365
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
                    timeStr = `${effectiveDays} ${effectiveDays === 1 ? "day" : "days"}`
                  }

                  return `Delete attendance logs older than ${timeStr} automatically. Member profiles and face data are never deleted.`
                })()}
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-medium text-white/65">
                {effectiveDays <= 0 ? "forever" : "days"}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={effectiveDays}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "")
                  const num = raw === "" ? 0 : parseInt(raw, 10)
                  if (cloudCeiling) {
                    onDataRetentionChange(Math.min(cloudCeiling, num))
                  } else {
                    onDataRetentionChange(Math.min(3650, num))
                  }
                }}
                onBlur={() => {
                  if (cloudCeiling && (attendanceSettings.dataRetentionDays ?? 0) <= 0) {
                    onDataRetentionChange(cloudCeiling)
                  }
                }}
                className="w-14 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-2 py-1.5 text-center text-xs font-bold text-white transition-all duration-300 outline-none focus:border-white/20"
              />
            </div>
          </div>
        </div>

        {/* Kiosk Security / Admin PIN Lock */}
        <div className="pt-6 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Kiosk Security
          </h3>
        </div>

        <div className="py-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium text-white/90">Administrator PIN Lock</div>
                  <InfoPopover
                    title="Administrator PIN Lock"
                    description="Protects settings and kiosk configuration with a 4-digit PIN code so visitors cannot alter settings or member records."
                    details={[
                      "Recommended for unattended kiosks in lobbies, entrances, or classrooms.",
                      "Requires the 4-digit PIN whenever anyone clicks Settings or presses Ctrl+,.",
                      "Default PIN is 1234. Change it anytime below.",
                    ]}
                    side="right"
                  />
                </div>
                <div className="relative min-h-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={adminPinEnabled ? "on" : "off"}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-xs font-normal text-white/65">
                      {adminPinEnabled ?
                        "Settings are protected with an administrator PIN."
                      : "PIN lock is disabled. Anyone can access settings."}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <Switch
                checked={adminPinEnabled}
                onChange={(checked) => setAdminPinSettings({ adminPinEnabled: checked })}
                ariaLabel="Administrator PIN Lock"
              />
            </div>

            <AnimatePresence>
              {adminPinEnabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: SETTINGS_PANEL_ANIMATION_DURATION, ease: "easeOut" }}
                  className="overflow-hidden">
                  <div className="relative flex flex-col gap-2 pt-3 pb-2 pl-4">
                    <div className="absolute top-0 bottom-1/2 left-0 w-px rounded-bl-xs bg-white/10"></div>
                    <div className="absolute top-1/2 left-0 h-px w-3 -translate-y-1/2 rounded-bl-xs bg-white/10"></div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-white/80">
                          Set 4-Digit Administrator PIN:
                        </div>
                        <div className="mt-0.5 text-[11px]">
                          {isSaved ?
                            <span className="font-medium text-cyan-400">
                              <i className="fa-solid fa-circle-check mr-1 text-[10px]" />
                              PIN updated successfully
                            </span>
                          : pinValue.length === 4 ?
                            <span className="text-white/65">
                              4-digit PIN is active. Default is 1234.
                            </span>
                          : <span className="font-medium text-amber-400">
                              <i className="fa-solid fa-circle-info mr-1 text-[10px]" />
                              Enter 4 numeric digits to save
                            </span>
                          }
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                          aria-label={showPin ? "Hide PIN" : "Show PIN"}>
                          <i
                            className={`fa-solid ${showPin ? "fa-eye-slash" : "fa-eye"} text-xs`}
                          />
                        </button>

                        <input
                          type={showPin ? "text" : "password"}
                          inputMode="numeric"
                          maxLength={4}
                          value={pinValue}
                          onChange={(e) => handlePinChange(e.target.value)}
                          placeholder="1234"
                          aria-label="4-digit Administrator PIN"
                          className="w-20 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-2.5 py-1.5 text-center text-xs font-bold tracking-widest text-white transition-all outline-none focus:border-cyan-500/60 focus:bg-cyan-500/[0.03]"
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
  )
}
