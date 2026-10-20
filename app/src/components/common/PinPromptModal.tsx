import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Cloud, Shield, Clock, AlertCircle, Delete } from "lucide-react"
import { useUIStore } from "@/components/main/stores"
import { ModalCloseButton } from "@/components/common/ModalCloseButton"
import { useCloudSyncStatus } from "@/components/common/useCloudSyncStatus"

export function PinPromptModal() {
  const isPinPromptOpen = useUIStore((state) => state.isPinPromptOpen)
  const closePinPrompt = useUIStore((state) => state.closePinPrompt)
  const verifyPin = useUIStore((state) => state.verifyPin)
  const verifyRecoveryKey = useUIStore((state) => state.verifyRecoveryKey)
  const pinLockoutUntil = useUIStore((state) => state.pinLockoutUntil)
  const pinFailedAttempts = useUIStore((state) => state.pinFailedAttempts)

  const { isPaired } = useCloudSyncStatus()

  const [pin, setPin] = useState("")
  const [error, setError] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [showEmergencyReset, setShowEmergencyReset] = useState(false)
  const [resetConfirmInput, setResetConfirmInput] = useState("")
  const [resetError, setResetError] = useState(false)

  const calculateRemaining = useCallback(() => {
    return Math.max(0, Math.ceil((pinLockoutUntil - Date.now()) / 1000))
  }, [pinLockoutUntil])

  const [lockoutSeconds, setLockoutSeconds] = useState(0)
  const lockoutTimerRef = useRef<NodeJS.Timeout | null>(null)

  const lockClickCountRef = useRef(0)
  const lockClickTimerRef = useRef<NodeJS.Timeout | null>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isPinPromptOpen) {
      setPin("")
      setError(false)
      setIsShaking(false)
      setShowEmergencyReset(false)
      setResetConfirmInput("")
      setResetError(false)
      setLockoutSeconds(calculateRemaining())
    } else {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
    }
  }, [isPinPromptOpen, calculateRemaining])

  useEffect(() => {
    if (lockoutSeconds <= 0) return
    if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
    lockoutTimerRef.current = setInterval(() => {
      const remaining = calculateRemaining()
      setLockoutSeconds(remaining)
      if (remaining <= 0) {
        if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
      }
    }, 1000)
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
    }
  }, [lockoutSeconds, calculateRemaining])

  const handleWrongPin = useCallback(() => {
    setError(true)
    setIsShaking(true)
    setTimeout(() => {
      setIsShaking(false)
      setPin("")
    }, 600)
    const remaining = calculateRemaining()
    if (remaining > 0) {
      setLockoutSeconds(remaining)
    }
  }, [calculateRemaining])

  const handleDigit = useCallback(
    (digit: string) => {
      if (lockoutSeconds > 0) return
      setPin((prevPin) => {
        if (prevPin.length >= 4) return prevPin
        return prevPin + digit
      })
      setError(false)
    },
    [lockoutSeconds],
  )

  useEffect(() => {
    if (pin.length !== 4) return
    const success = verifyPin(pin)
    if (!success) handleWrongPin()
  }, [pin, verifyPin, handleWrongPin])

  const handleBackspace = useCallback(() => {
    if (lockoutSeconds > 0) return
    setPin((prev) => prev.slice(0, -1))
    setError(false)
  }, [lockoutSeconds])

  const handleClear = useCallback(() => {
    if (lockoutSeconds > 0) return
    setPin("")
    setError(false)
  }, [lockoutSeconds])

  const handleManualSubmit = useCallback(() => {
    if (!pin || lockoutSeconds > 0) return
    const success = verifyPin(pin)
    if (!success) handleWrongPin()
  }, [pin, verifyPin, handleWrongPin, lockoutSeconds])

  useEffect(() => {
    if (!isPinPromptOpen || showEmergencyReset) return

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // Emergency recovery shortcut: Ctrl + Shift + R
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault()
        setShowEmergencyReset(true)
        return
      }

      if (e.key === "Escape") {
        e.preventDefault()
        closePinPrompt()
      } else if (e.key === "Enter") {
        e.preventDefault()
        handleManualSubmit()
      } else if (e.key === "Backspace") {
        e.preventDefault()
        handleBackspace()
      } else if (/^\d$/.test(e.key)) {
        e.preventDefault()
        handleDigit(e.key)
      }
    }

    window.addEventListener("keydown", handleWindowKeyDown)
    return () => window.removeEventListener("keydown", handleWindowKeyDown)
  }, [
    isPinPromptOpen,
    showEmergencyReset,
    closePinPrompt,
    handleManualSubmit,
    handleBackspace,
    handleDigit,
  ])

  const handleLockIconClick = () => {
    lockClickCountRef.current += 1
    if (lockClickTimerRef.current) clearTimeout(lockClickTimerRef.current)
    lockClickTimerRef.current = setTimeout(() => {
      lockClickCountRef.current = 0
    }, 1500)

    // 5 rapid taps on lock icon triggers emergency reset
    if (lockClickCountRef.current >= 5) {
      lockClickCountRef.current = 0
      setShowEmergencyReset(true)
    }
  }

  const handleLockTouchStart = () => {
    longPressTimerRef.current = setTimeout(() => {
      setShowEmergencyReset(true)
    }, 3000)
  }

  const handleLockTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
  }

  const handleEmergencyResetSubmit = () => {
    const success = verifyRecoveryKey(resetConfirmInput)
    if (success) {
      setShowEmergencyReset(false)
      setResetConfirmInput("")
      setResetError(false)
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current)
      setLockoutSeconds(0)
    } else {
      setResetError(true)
      setTimeout(() => setResetError(false), 2000)
    }
  }

  const modalContent = (
    <AnimatePresence>
      {isPinPromptOpen && (
        <div
          className="fixed right-0 bottom-0 left-0 z-100 flex items-center justify-center overflow-hidden p-4 select-none"
          style={{ top: "32px" }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-xs"
            onClick={closePinPrompt}
          />

          <AnimatePresence mode="wait">
            {showEmergencyReset ?
              <motion.div
                key="emergency-reset-modal"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex w-full max-w-[340px] flex-col rounded-xl border border-white/10 bg-[#0f1011] p-5 shadow-2xl backdrop-blur-2xl">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-white">
                      Emergency recovery
                    </h3>
                    <p className="mt-1 text-xs text-white/50">Restore administrator access</p>
                  </div>
                  <ModalCloseButton onClick={() => setShowEmergencyReset(false)} />
                </div>

                <p className="mt-4 text-xs leading-relaxed text-white/65">
                  Enter the recovery key from Settings to reset the PIN to default (1234).
                </p>

                <input
                  type="text"
                  value={resetConfirmInput}
                  onChange={(e) => setResetConfirmInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEmergencyResetSubmit()
                    if (e.key === "Escape") setShowEmergencyReset(false)
                  }}
                  placeholder="XXXX-XXXX"
                  autoFocus
                  maxLength={16}
                  className="mt-3.5 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-center font-mono text-xs font-semibold tracking-widest text-white uppercase transition-all outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-white/20 focus:border-white/30 focus:bg-white/[0.08]"
                />

                <div className="mt-2.5 flex min-h-5 items-center justify-center text-center">
                  <AnimatePresence mode="wait">
                    {resetError ?
                      <motion.span
                        key="reset-error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.14 }}
                        className="text-center text-[11px] font-medium text-rose-400">
                        Invalid recovery key.
                      </motion.span>
                    : isPaired ?
                      <motion.span
                        key="paired-hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.14 }}
                        className="inline-flex items-center justify-center gap-1.5 text-center text-[11px] leading-snug text-white/40">
                        <Cloud className="size-3 text-emerald-400" />
                        <span>No key? Device can be reset remotely via Cloud.</span>
                      </motion.span>
                    : <motion.span
                        key="unpaired-hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.14 }}
                        className="inline-flex items-center justify-center gap-1.5 text-center text-[11px] leading-snug text-white/40">
                        <Shield className="size-3 text-white/30" />
                        <span>Standalone device. PIN can only be reset with this key.</span>
                      </motion.span>
                    }
                  </AnimatePresence>
                </div>

                <div className="mt-4 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEmergencyReset(false)}
                    className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleEmergencyResetSubmit}
                    disabled={resetConfirmInput.trim().length < 4}
                    className="rounded-lg bg-gradient-to-b from-cyan-400 to-cyan-500 px-5 py-2 text-[11px] font-bold tracking-wider text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-200 hover:from-cyan-300 hover:to-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30">
                    Verify & reset
                  </button>
                </div>
              </motion.div>
            : <motion.div
                key="standard-pin-modal"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: 0,
                  x: isShaking ? [-8, 8, -6, 6, -3, 3, 0] : 0,
                }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{
                  duration: isShaking ? 0.4 : 0.14,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="relative z-10 flex w-full max-w-[340px] flex-col rounded-xl border border-white/10 bg-[#0f1011] p-5 shadow-2xl backdrop-blur-2xl">
                <div className="flex items-start justify-between">
                  <div>
                    <h3
                      className="cursor-pointer text-base font-semibold tracking-tight text-white select-none"
                      onClick={handleLockIconClick}
                      onTouchStart={handleLockTouchStart}
                      onTouchEnd={handleLockTouchEnd}
                      onMouseDown={handleLockTouchStart}
                      onMouseUp={handleLockTouchEnd}>
                      Administrator lock
                    </h3>
                    <p className="mt-1 text-xs text-white/50">Enter PIN to access settings</p>
                  </div>
                  <ModalCloseButton onClick={closePinPrompt} />
                </div>

                <div
                  className={`my-5 flex items-center justify-center gap-3 transition-opacity duration-300 ${
                    lockoutSeconds > 0 ? "opacity-40" : ""
                  }`}>
                  {[0, 1, 2, 3].map((index) => {
                    const isFilled = pin.length > index
                    const isActive = lockoutSeconds === 0 && pin.length === index
                    return (
                      <div
                        key={index}
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-200 ${
                          error ?
                            "border-rose-500/70 bg-rose-500/10 shadow-[0_0_16px_rgba(244,63,94,0.3)]"
                          : isFilled ?
                            "border-white/40 bg-white/[0.06] shadow-[0_0_12px_rgba(255,255,255,0.08)]"
                          : isActive ? "border-white/30 bg-white/[0.04]"
                          : "border-white/10 bg-white/[0.02]"
                        }`}>
                        <AnimatePresence>
                          {isFilled && (
                            <motion.div
                              key="dot"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className={`h-3 w-3 rounded-full ${
                                error ?
                                  "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                                : "bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                              }`}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>

                <div className="flex min-h-5 items-center justify-center">
                  <AnimatePresence mode="wait">
                    {lockoutSeconds > 0 ?
                      <motion.span
                        key="lockout"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
                        <Clock className="size-3" /> Too many attempts. Wait {lockoutSeconds}s.
                      </motion.span>
                    : error ?
                      <motion.span
                        key="error"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-rose-400">
                        <AlertCircle className="size-3" /> Incorrect PIN.
                        {pinFailedAttempts >= 2 && pinFailedAttempts < 3 ?
                          " 1 attempt before lockout."
                        : " Try again."}
                      </motion.span>
                    : null}
                  </AnimatePresence>
                </div>

                <div
                  className={`mt-2 grid w-full grid-cols-3 gap-2.5 transition-opacity duration-300 ${lockoutSeconds > 0 ? "pointer-events-none opacity-30" : ""}`}>
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleDigit(num)}
                      disabled={lockoutSeconds > 0}
                      className="flex h-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-base font-semibold text-white/90 shadow-sm transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-95 active:border-white/30 active:bg-white/10 active:text-white disabled:pointer-events-none">
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={pin.length === 0 || lockoutSeconds > 0}
                    className="flex h-12 items-center justify-center rounded-xl border border-transparent text-[11px] font-semibold tracking-wider text-white/50 uppercase transition-all duration-150 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-20">
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigit("0")}
                    disabled={lockoutSeconds > 0}
                    className="flex h-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-base font-semibold text-white/90 shadow-sm transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-95 active:border-white/30 active:bg-white/10 active:text-white disabled:pointer-events-none">
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleBackspace}
                    disabled={pin.length === 0 || lockoutSeconds > 0}
                    className="flex h-12 items-center justify-center rounded-xl border border-transparent text-white/50 transition-all duration-150 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-20"
                    aria-label="Backspace">
                    <Delete className="size-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-center pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setResetConfirmInput("")
                      setResetError(false)
                      setShowEmergencyReset(true)
                    }}
                    className="text-xs font-medium text-white/45 transition-colors hover:text-white/80">
                    Forgot PIN?
                  </button>
                </div>
              </motion.div>
            }
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}
