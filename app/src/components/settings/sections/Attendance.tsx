import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Cloud, Check, X, RotateCw, Eye, EyeOff, Copy } from "lucide-react"
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
  const effectiveDays = Math.max(0, rawLocalDays)

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 px-10 pt-8 pb-10">
      <div className="overflow-hidden">
        <div className="pt-6 pb-2">
          <h3 className="text-[10px] font-extrabold tracking-[0.2em] text-white/55 uppercase">
            Global settings
          </h3>
        </div>

        <div className="py-2">
          {/* Auto-start Scanning on Launch */}
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-white/90">Auto-start scanning</div>
                <InfoPopover
                  title="Auto-start scanning"
                  description="Start the camera and face recognition automatically when Facenox opens."
                  details={[
                    "Use this on computers dedicated to attendance check-ins.",
                    "Requires a connected camera.",
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
              ariaLabel="Auto-start scanning on launch"
            />
          </div>

          <div className="h-px w-full bg-white/8" />

          <div className="flex flex-col">
            <div className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium text-white/90">Recognition limit</div>
                  <InfoPopover
                    title="Recognition limit"
                    description="Sets the maximum number of faces recognized simultaneously per camera frame."
                    details={[
                      "A lower limit reduces the number of faces processed per frame.",
                      "Prioritizes faces that appear largest in the camera image.",
                      "Turning this off removes the per-frame recognition limit.",
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
                        "No per-frame recognition limit is applied."
                      : "Limit the number of faces recognized per frame."}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              <Switch
                checked={attendanceSettings.maxRecognitionFacesPerFrame > 0}
                onChange={(checked) => onMaxRecognitionFacesChange(checked ? 5 : 0)}
                ariaLabel="Recognition limit"
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
                <div className="text-sm font-medium text-white/90">Liveness verification</div>
                <InfoPopover
                  title="Liveness verification"
                  description="Checks for signs of photo and screen spoofing during face recognition."
                  details={[
                    "Analyzes camera images locally and may request a head turn to check physical presence.",
                    "Use even lighting and face the camera.",
                    "Liveness checks may take longer on slower computers.",
                    "You cannot turn this off when your organization requires it.",
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
                      "Check for photo and screen spoofing during recognition."
                    : "Standard face recognition only."}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            <Switch
              checked={attendanceSettings.enableSpoofDetection || attendanceSettings.forceLiveness}
              onChange={onSpoofDetectionToggle}
              disabled={attendanceSettings.forceLiveness}
              ariaLabel="Liveness verification (anti-spoof)"
            />
          </div>

          <div className="h-px w-full bg-white/8" />

          {/* Retention Policy (Local Kiosk Cache with Cloud Plan Constraint) */}
          <div className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-white/90">Retention policy</div>
                {isPaired &&
                  (cloudCeiling ?
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      <Cloud className="size-2.5" /> Cloud plan: {cloudCeiling}d window
                    </span>
                  : isCloudUnlimited ?
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      <Cloud className="size-2.5" /> Cloud plan: Unlimited
                    </span>
                  : null)}
                <InfoPopover
                  title="Retention policy"
                  description="Choose how many days of local attendance records to keep."
                  details={[
                    "Older records are removed when the local service starts. Member profiles, groups, and face templates are unchanged.",
                    "Set this to 0 to turn off automatic cleanup.",
                    ...(isPaired && cloudCeiling ?
                      [`Cloud history is separate. Your plan provides access to ${cloudCeiling} days online.`]
                    : []),
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
                      if (effectiveDays <= 0) {
                        return "Automatic cleanup is off. Local attendance records are kept until you delete them."
                      }

                      const timeStr = `${effectiveDays} ${effectiveDays === 1 ? "day" : "days"}`

                      return `Delete local attendance records older than ${timeStr} automatically. Member profiles and enrolled face data are unchanged.`
                    })()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end">
              <div className="flex items-center gap-2">
                <div className="relative flex min-h-4 min-w-[36px] items-center justify-end">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={effectiveDays <= 0 ? "cleanup-off" : "days"}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 2 }}
                      transition={{ duration: SETTINGS_STATUS_SWAP_DURATION }}
                      className="text-[11px] font-medium text-white/65">
                      {effectiveDays <= 0 ? "No automatic cleanup" : "days"}
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
                        const maxLimit = 3650
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
                        onDataRetentionChange(Math.min(3650, num))
                      }
                    }}
                    className={`w-14 rounded-lg border bg-white/[0.04] px-2 py-1.5 text-center text-xs font-bold text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all duration-300 outline-none ${
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
                  <div className="text-sm font-medium text-white/90">Administrator PIN lock</div>
                  <InfoPopover
                    title="Administrator PIN lock"
                    description="Require a 4-digit PIN to open settings and manage members."
                    details={[
                      "Use this on shared or unattended computers.",
                      "The PIN is also required when opening Settings with the keyboard shortcut.",
                      "Change the default PIN (1234) using the controls below.",
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
                ariaLabel="Administrator PIN lock"
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
                              <Check className="mr-1.5 size-3" />
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
                              <X className="mr-1.5 size-3" />
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
                              <RotateCw className="mr-1 size-2.5" />
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
                            {showPin ?
                              <EyeOff className="size-3.5" />
                            : <Eye className="size-3.5" />}
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
                            className={`w-20 rounded-lg border bg-white/[0.04] px-2.5 py-1.5 text-center text-xs font-bold tracking-widest text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-all outline-none ${
                              pinMismatch ? "border-rose-500/60 focus:border-rose-500/80"
                              : pinStep === "confirm" ?
                                "border-white/30 focus:border-white/50 focus:bg-white/[0.08]"
                              : "border-white/10 focus:border-white/30 focus:bg-white/[0.08]"
                            }`}
                          />
                        </motion.div>
                      </div>
                    </div>

                    {/* Recovery Key — └─ connector (last item, spine ends here) */}
                    <div className="relative flex flex-wrap items-center justify-between gap-3 py-2 pl-4">
                      <div className="pointer-events-none absolute top-0 bottom-1/2 left-0 w-3 rounded-bl-sm border-b border-l border-white/10" />
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs font-medium text-white/80">Recovery key:</div>
                        <InfoPopover
                          title="Recovery key"
                          description="Use this key to regain access if you forget the administrator PIN."
                          details={[
                            "Keep a copy in a secure place. Anyone with this key can unlock administrator access.",
                            ...(isPaired ?
                              [
                                "You can also request a PIN reset from Facenox Cloud. This computer must reconnect to receive it.",
                              ]
                            : [
                                "Cloud PIN reset requires pairing this computer with Facenox Cloud.",
                              ]),
                          ]}
                          side="right"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold tracking-wider text-white/80 select-all">
                          {recoveryKey || "—"}
                        </span>

                        <Tooltip content={copiedKey ? "Copied" : "Copy key"} position="top">
                          <button
                            type="button"
                            onClick={handleCopyRecoveryKey}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                            aria-label="Copy recovery key">
                            {copiedKey ?
                              <Check className="size-3.5 text-cyan-400" />
                            : <Copy className="size-3.5" />}
                          </button>
                        </Tooltip>

                        <Tooltip
                          content={confirmRegenerate ? "Click to confirm" : "Regenerate key"}
                          position="top">
                          <button
                            type="button"
                            onClick={handleRegenerateKey}
                            className={`flex h-7 items-center justify-center rounded-lg transition-colors ${
                              confirmRegenerate ?
                                "bg-amber-500/15 px-2 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25"
                              : "w-7 text-white/45 hover:bg-white/5 hover:text-white"
                            }`}
                            aria-label="Regenerate recovery key">
                            <RotateCw
                              className={`size-3.5 ${confirmRegenerate ? "mr-1 animate-spin text-amber-300" : ""}`}
                            />
                            {confirmRegenerate && "Confirm"}
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
