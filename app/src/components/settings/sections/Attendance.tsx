import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { AttendanceSettings } from "@/components/settings/types"
import { InfoPopover, Switch } from "@/components/shared"
import { useUIStore } from "@/components/main/stores"

interface AttendanceProps {
  attendanceSettings: AttendanceSettings
  onAttendanceCooldownChange: (seconds: number) => void
  onSpoofDetectionToggle: (enabled: boolean) => void
  onMaxRecognitionFacesChange: (count: number) => void
  onDataRetentionChange: (days: number) => void
  isPaired?: boolean
}

const SETTINGS_STATUS_SWAP_DURATION = 0.14
const SETTINGS_PANEL_ANIMATION_DURATION = 0.18

const WEAK_PINS = new Set([
  "1234",
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1230",
  "0123",
])

export function Attendance({
  attendanceSettings,
  onAttendanceCooldownChange,
  onSpoofDetectionToggle,
  onMaxRecognitionFacesChange,
  onDataRetentionChange,
  isPaired = false,
}: AttendanceProps) {
  const adminPinEnabled = useUIStore((state) => state.adminPinEnabled)
  const setAdminPinSettings = useUIStore((state) => state.setAdminPinSettings)

  const [pinValue, setPinValue] = useState("")
  const [confirmPinValue, setConfirmPinValue] = useState("")
  const [showPin, setShowPin] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [pinMismatch, setPinMismatch] = useState(false)

  const isWeakPin = pinValue.length === 4 && WEAK_PINS.has(pinValue)

  // Keep pin inputs clear — don't pre-fill from store (avoids showing current PIN)
  // Only sync on mount if pin panel is freshly opened
  useEffect(() => {
    setPinValue("")
    setConfirmPinValue("")
    setPinMismatch(false)
  }, [adminPinEnabled])

  const handleSavePin = () => {
    if (pinValue.length !== 4 || confirmPinValue.length !== 4) return
    if (pinValue !== confirmPinValue) {
      setPinMismatch(true)
      setTimeout(() => setPinMismatch(false), 2000)
      return
    }
    setAdminPinSettings({ adminPin: pinValue })
    setIsSaved(true)
    setPinValue("")
    setConfirmPinValue("")
    setTimeout(() => setIsSaved(false), 2500)
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
                  description="Filters repeated scans from the same person within the selected cooldown window."
                  details={[
                    "Prevents duplicate check-in entries to keep attendance records clean.",
                    "Use 5s–1m in high-traffic doors or when tracking continuous movement.",
                    "Use 5m–30m for standard daily check-in kiosks.",
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
                    Filter repeated scans from the same person within the cooldown window.
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
                    description="Sets the maximum number of faces recognized simultaneously per camera frame."
                    details={[
                      "Limits of 1–5 maximize frame rate and eliminate lag on standard PCs.",
                      "Prioritizes matching the largest and closest faces in the scene first.",
                      "Disabling the limit processes every detected face simultaneously.",
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
                    <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />

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
                  description="Verifies physical presence to block printed photos, screen replays, and spoofing attempts."
                  details={[
                    "Analyzes face texture, micro-motion, and depth cues in real time.",
                    "Works best with balanced ambient lighting and direct front-facing camera angles.",
                    "May slightly increase processing time on lower-powered CPUs.",
                    "Locked automatically when enforced by your organization policy.",
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
                      "Enforced and managed by your organization policy."
                    : attendanceSettings.enableSpoofDetection ?
                      "Verify real physical presence and block photo or screen spoofing."
                    : "Anti-spoofing is disabled. Run passive face recognition only."}
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
                  title="Retention Policy"
                  description="Controls how long past attendance check-in logs are stored before automatic cleanup."
                  details={[
                    "Runs automatic cleanup in the background every 24 hours to free disk space.",
                    "Member profiles, groups, and enrolled face data are never deleted.",
                    "Shorter retention periods keep the database fast and comply with privacy regulations.",
                    isPaired && cloudCeiling ?
                      `Local retention cannot exceed your cloud subscription window of ${cloudCeiling} days.`
                    : "Setting this to 0 keeps local attendance history indefinitely.",
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

        {/* Security / Admin PIN Lock */}
        <div className="pt-6 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Security
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
                    description="Restricts access to settings and member rosters behind a 4-digit security PIN."
                    details={[
                      "Recommended when the app is placed in open lobbies, hallways, or classrooms.",
                      "Prompts for your PIN when clicking Settings or pressing the Ctrl+, shortcut.",
                      "Default PIN is 1234. Update it in the sub-panel below.",
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
                        "Protect settings and controls with a 4-digit PIN."
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
                  <div className="relative flex flex-col gap-3 pt-3 pb-2 pl-4">
                    <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />

                    <div className="relative min-h-[18px]">
                      <AnimatePresence mode="wait">
                        {isSaved ?
                          <motion.div
                            key="saved"
                            initial={{ opacity: 0, y: -2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 2 }}
                            transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                            className="flex items-center text-[11px] font-medium text-cyan-400">
                            <i className="fa-solid fa-circle-check mr-1 text-[10px]" />
                            PIN updated successfully
                          </motion.div>
                        : pinMismatch ?
                          <motion.div
                            key="mismatch"
                            initial={{ opacity: 0, y: -2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 2 }}
                            transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                            className="flex items-center text-[11px] font-medium text-rose-400">
                            <i className="fa-solid fa-circle-exclamation mr-1 text-[10px]" />
                            PINs do not match. Try again.
                          </motion.div>
                        : isWeakPin ?
                          <motion.div
                            key="weak"
                            initial={{ opacity: 0, y: -2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 2 }}
                            transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                            className="flex items-center text-[11px] font-medium text-amber-400">
                            <i className="fa-solid fa-triangle-exclamation mr-1 text-[10px]" />
                            Weak PIN. Consider using a less common code.
                          </motion.div>
                        : <motion.div
                            key="default"
                            initial={{ opacity: 0, y: -2 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 2 }}
                            transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                            className="text-[11px] text-white/50">
                            Set a new 4-digit PIN. Current PIN is not shown.
                          </motion.div>
                        }
                      </AnimatePresence>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-medium text-white/80">New PIN:</div>
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
                          onChange={(e) =>
                            setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))
                          }
                          placeholder="••••"
                          aria-label="New 4-digit Administrator PIN"
                          className="w-20 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-2.5 py-1.5 text-center text-xs font-bold tracking-widest text-white transition-all outline-none focus:border-cyan-500/60 focus:bg-cyan-500/[0.03]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-medium text-white/80">Confirm PIN:</div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-8 w-8" />
                        <input
                          type={showPin ? "text" : "password"}
                          inputMode="numeric"
                          maxLength={4}
                          value={confirmPinValue}
                          onChange={(e) =>
                            setConfirmPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSavePin()
                          }}
                          placeholder="••••"
                          aria-label="Confirm 4-digit Administrator PIN"
                          className={`w-20 rounded-lg border bg-[rgba(22,28,36,0.68)] px-2.5 py-1.5 text-center text-xs font-bold tracking-widest text-white transition-all outline-none ${
                            pinMismatch ?
                              "border-rose-500/60 focus:border-rose-500/80"
                            : "border-white/10 focus:border-cyan-500/60 focus:bg-cyan-500/[0.03]"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSavePin}
                        disabled={pinValue.length !== 4 || confirmPinValue.length !== 4}
                        className="rounded-lg bg-cyan-600 px-4 py-1.5 text-[11px] font-bold text-white transition-all duration-150 hover:bg-cyan-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30">
                        Save PIN
                      </button>
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
