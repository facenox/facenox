import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { AttendanceSettings } from "@/components/settings/types"
import { InfoPopover, Switch, Tooltip } from "@/components/shared"
import { useUIStore } from "@/components/main/stores"

interface AttendanceProps {
  attendanceSettings: AttendanceSettings
  onSpoofDetectionToggle: (enabled: boolean) => void
  onMaxRecognitionFacesChange: (count: number) => void
  onDataRetentionChange: (days: number) => void
  isPaired?: boolean
}

const SETTINGS_STATUS_SWAP_DURATION = 0.14
const SETTINGS_PANEL_ANIMATION_DURATION = 0.18

export function Attendance({
  attendanceSettings,
  onSpoofDetectionToggle,
  onMaxRecognitionFacesChange,
  onDataRetentionChange,
  isPaired = false,
}: AttendanceProps) {
  const adminPinEnabled = useUIStore((state) => state.adminPinEnabled)
  const setAdminPinSettings = useUIStore((state) => state.setAdminPinSettings)
  const recoveryKey = useUIStore((state) => state.recoveryKey)
  const regenerateRecoveryKey = useUIStore((state) => state.regenerateRecoveryKey)
  const autoStartScan = useUIStore((state) => state.quickSettings.autoStartScan ?? false)
  const setQuickSettings = useUIStore((state) => state.setQuickSettings)

  const [pinInput, setPinInput] = useState("")
  const [firstPin, setFirstPin] = useState("")
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter")
  const [showPin, setShowPin] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [pinMismatch, setPinMismatch] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [retentionInput, setRetentionInput] = useState<string | null>(null)
  const [isRetentionCapped, setIsRetentionCapped] = useState(false)

  const triggerCappedNudge = useCallback(() => {
    setIsRetentionCapped(true)
    setTimeout(() => setIsRetentionCapped(false), 300)
  }, [])

  // Auto-reset confirmation state after 4 seconds
  useEffect(() => {
    if (!confirmRegenerate) return
    const timer = setTimeout(() => setConfirmRegenerate(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmRegenerate])

  const handleCopyRecoveryKey = async () => {
    if (!recoveryKey) return
    try {
      await navigator.clipboard.writeText(recoveryKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    } catch (err) {
      console.error("Failed to copy recovery key:", err)
    }
  }

  const handleRegenerateKey = () => {
    if (!confirmRegenerate) {
      setConfirmRegenerate(true)
      return
    }
    regenerateRecoveryKey()
    setConfirmRegenerate(false)
  }

  // Clear pin inputs when panel toggles
  useEffect(() => {
    setPinInput("")
    setFirstPin("")
    setPinStep("enter")
    setPinMismatch(false)
    setIsShaking(false)
  }, [adminPinEnabled])

  const handlePinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 4)
    setPinInput(value)

    if (pinStep === "enter") {
      if (value.length === 4) {
        setTimeout(() => {
          setFirstPin(value)
          setPinStep("confirm")
          setPinInput("")
        }, 160)
      }
    } else if (pinStep === "confirm") {
      if (value.length === 4) {
        setTimeout(() => {
          if (value === firstPin) {
            // Success: Match! Auto-save
            setAdminPinSettings({ adminPin: value })
            setIsSaved(true)
            setPinStep("enter")
            setFirstPin("")
            setPinInput("")
            setTimeout(() => setIsSaved(false), 2500)
          } else {
            // Mismatch: Shake & revert to enter step
            setIsShaking(true)
            setPinMismatch(true)
            setTimeout(() => {
              setIsShaking(false)
              setPinStep("enter")
              setFirstPin("")
              setPinInput("")
            }, 600)
            setTimeout(() => setPinMismatch(false), 2500)
          }
        }, 150)
      }
    }
  }

  const handleCancelConfirm = () => {
    setPinStep("enter")
    setFirstPin("")
    setPinInput("")
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
          {/* Auto-start Scanning on Launch */}
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Auto-start Scanning</div>
                <InfoPopover
                  title="Auto-start Scanning"
                  description="Automatically activates the camera and face recognition scanner when Facenox launches."
                  details={[
                    "Designed for dedicated attendance kiosks and unattended gate checkpoints.",
                    "Starts face detection immediately on startup without requiring manual intervention.",
                    "Requires a functioning camera to be connected.",
                  ]}
                  side="right"
                />
              </div>
              <div className="relative min-h-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={autoStartScan ? "auto-on" : "auto-off"}
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                    className="text-xs font-normal text-white/65">
                    {autoStartScan ?
                      "Start scanning automatically when the application launches."
                    : "Keep scanner idle on startup until manually started."}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <Switch
              checked={autoStartScan}
              onChange={(checked) =>
                setQuickSettings((prev) => ({ ...prev, autoStartScan: checked }))
              }
              ariaLabel="Auto-start Scanning on Launch"
            />
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
                onChange={(checked) => onMaxRecognitionFacesChange(checked ? 5 : 0)}
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
                          className={`relative min-w-[28px] cursor-pointer px-1.5 py-1 text-center text-[11px] font-extrabold tracking-wider transition-all duration-150 ${
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
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      <i className="fa-solid fa-cloud text-[9px]" /> Cloud plan: {cloudCeiling}d max
                    </span>
                  : isCloudUnlimited ?
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
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
              <div className="relative mt-0.5 min-h-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${cloudCeiling}-${isCloudUnlimited}-${effectiveDays}`}
                    initial={{ opacity: 0, y: -2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 2 }}
                    transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                    className="text-xs text-white/65">
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
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end">
              <div className="flex items-center gap-2">
                <div className="relative flex h-4 min-w-[36px] items-center justify-end overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={effectiveDays <= 0 ? "forever" : "days"}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-[11px] font-medium text-white/65">
                      {effectiveDays <= 0 ? "forever" : "days"}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <motion.div
                  animate={isRetentionCapped ? { x: [-3, 3, -2, 2, 0] } : {}}
                  transition={{ duration: 0.25 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={retentionInput !== null ? retentionInput : String(effectiveDays)}
                    onFocus={() => {
                      setRetentionInput(String(effectiveDays))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "")
                      setRetentionInput(raw)
                      if (raw !== "") {
                        const num = parseInt(raw, 10)
                        const maxLimit = cloudCeiling || 3650
                        const clamped = Math.min(maxLimit, num)
                        if (num > maxLimit) {
                          triggerCappedNudge()
                        }
                        onDataRetentionChange(clamped)
                      }
                    }}
                    onBlur={() => {
                      const raw = retentionInput
                      setRetentionInput(null)
                      if (raw !== null) {
                        const num = raw === "" ? 0 : parseInt(raw, 10)
                        if (cloudCeiling) {
                          if (num <= 0) {
                            triggerCappedNudge()
                            onDataRetentionChange(cloudCeiling)
                          } else {
                            if (num > cloudCeiling) triggerCappedNudge()
                            onDataRetentionChange(Math.min(cloudCeiling, num))
                          }
                        } else {
                          onDataRetentionChange(Math.min(3650, num))
                        }
                      } else if (cloudCeiling && (attendanceSettings.dataRetentionDays ?? 0) <= 0) {
                        triggerCappedNudge()
                        onDataRetentionChange(cloudCeiling)
                      }
                    }}
                    className={`w-14 rounded-lg border bg-[rgba(22,28,36,0.68)] px-2 py-1.5 text-center text-xs font-bold text-white transition-all duration-300 outline-none ${
                      isRetentionCapped ?
                        "border-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                      : "border-white/10 focus:border-white/20"
                    }`}
                  />
                </motion.div>
              </div>
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
                      "Recommended when placed in public or unattended areas.",
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
                  <div className="flex flex-col pb-1">
                    {/* Single 2-Step PIN Row — ├─ connector */}
                    <div className="relative flex flex-wrap items-center justify-between gap-3 py-2 pl-4">
                      <div className="pointer-events-none absolute inset-y-0 left-0 border-l border-white/10" />
                      <div className="pointer-events-none absolute top-1/2 left-0 w-3 border-b border-white/10" />
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-medium text-white/80">
                          {pinStep === "confirm" ? "Confirm PIN:" : "New PIN:"}
                        </div>
                        {pinStep === "confirm" && (
                          <button
                            type="button"
                            onClick={handleCancelConfirm}
                            className="text-[10px] text-white/40 underline transition-colors hover:text-white/70"
                            title="Cancel and enter a different PIN">
                            Change
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Inline status & micro-feedback right beside the input */}
                        <AnimatePresence mode="wait">
                          {isSaved ?
                            <motion.div
                              key="saved"
                              initial={{ opacity: 0, x: 4 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -4 }}
                              transition={{ duration: 0.15 }}
                              className="flex items-center text-[11px] font-medium text-cyan-400">
                              <i className="fa-solid fa-check mr-1.5 text-[11px]" />
                              PIN updated
                            </motion.div>
                          : pinMismatch ?
                            <motion.div
                              key="mismatch"
                              initial={{ opacity: 0, x: 4 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -4 }}
                              transition={{ duration: 0.15 }}
                              className="flex items-center text-[11px] font-medium text-rose-400">
                              <i className="fa-solid fa-xmark mr-1.5 text-[11px]" />
                              PINs do not match
                            </motion.div>
                          : pinStep === "confirm" ?
                            <motion.div
                              key="confirm"
                              initial={{ opacity: 0, x: 4 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -4 }}
                              transition={{ duration: 0.15 }}
                              className="flex items-center text-[11px] font-medium text-cyan-300">
                              <i className="fa-solid fa-arrow-rotate-right mr-1 text-[10px]" />
                              Re-enter to confirm
                            </motion.div>
                          : null}
                        </AnimatePresence>

                        <Tooltip content={showPin ? "Hide PIN" : "Show PIN"} position="top">
                          <button
                            type="button"
                            onClick={() => setShowPin(!showPin)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                            aria-label={showPin ? "Hide PIN" : "Show PIN"}>
                            <i
                              className={`fa-solid ${showPin ? "fa-eye-slash" : "fa-eye"} text-xs`}
                            />
                          </button>
                        </Tooltip>
                        <motion.div
                          animate={isShaking ? { x: [-6, 6, -4, 4, -2, 2, 0] } : {}}
                          transition={{ duration: 0.35 }}>
                          <input
                            type={showPin ? "text" : "password"}
                            inputMode="numeric"
                            maxLength={4}
                            value={pinInput}
                            onChange={handlePinInputChange}
                            placeholder="••••"
                            aria-label={
                              pinStep === "confirm" ? "Confirm 4-digit PIN" : (
                                "New 4-digit Administrator PIN"
                              )
                            }
                            className={`w-20 rounded-lg border bg-[rgba(22,28,36,0.68)] px-2.5 py-1.5 text-center text-xs font-bold tracking-widest text-white transition-all outline-none ${
                              pinMismatch ? "border-rose-500/60 focus:border-rose-500/80"
                              : pinStep === "confirm" ?
                                "border-white/30 focus:border-white/50 focus:bg-[rgba(28,35,44,0.82)]"
                              : "border-white/10 focus:border-white/30 focus:bg-[rgba(28,35,44,0.82)]"
                            }`}
                          />
                        </motion.div>
                      </div>
                    </div>

                    {/* Recovery Key — └─ connector (last item, spine ends here) */}
                    <div className="relative flex flex-wrap items-center justify-between gap-3 py-2 pl-4">
                      <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs font-medium text-white/80">Recovery Key:</div>
                        <InfoPopover
                          title="Recovery Key"
                          description="Restores administrator access and resets the PIN if forgotten."
                          details={[
                            "Used to unlock settings or reset credentials during emergency recovery.",
                            "Keep this key secure. Anyone with this key can bypass the administrator lock.",
                            ...(isPaired ?
                              [
                                "Remote reset is also available from your Facenox Cloud dashboard when paired.",
                              ]
                            : [
                                "Keep an offline backup of this key as remote reset is unavailable when disconnected.",
                              ]),
                          ]}
                          side="right"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold tracking-wider text-white/80 select-all">
                          {recoveryKey || "—"}
                        </span>

                        <Tooltip content={copiedKey ? "Copied!" : "Copy key"} position="top">
                          <button
                            type="button"
                            onClick={handleCopyRecoveryKey}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                            aria-label="Copy Recovery Key">
                            <i
                              className={`fa-solid ${copiedKey ? "fa-check text-cyan-400" : "fa-copy"} text-xs`}
                            />
                          </button>
                        </Tooltip>

                        <Tooltip
                          content={
                            confirmRegenerate ? "Click to confirm regenerate" : "Regenerate key"
                          }
                          position="top">
                          <button
                            type="button"
                            onClick={handleRegenerateKey}
                            className={`flex h-7 items-center justify-center rounded-lg transition-colors ${
                              confirmRegenerate ?
                                "bg-amber-500/15 px-2 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25"
                              : "w-7 text-white/45 hover:bg-white/5 hover:text-white"
                            }`}
                            aria-label="Regenerate Recovery Key">
                            <i
                              className={`fa-solid fa-arrows-rotate text-xs ${confirmRegenerate ? "mr-1 animate-spin text-amber-300" : ""}`}
                            />
                            {confirmRegenerate && "Confirm?"}
                          </button>
                        </Tooltip>
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
