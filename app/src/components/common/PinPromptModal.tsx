import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useUIStore } from "@/components/main/stores"
import { ModalCloseButton } from "@/components/common/ModalCloseButton"

export function PinPromptModal() {
  const isPinPromptOpen = useUIStore((state) => state.isPinPromptOpen)
  const closePinPrompt = useUIStore((state) => state.closePinPrompt)
  const verifyPin = useUIStore((state) => state.verifyPin)
  const setAdminPinSettings = useUIStore((state) => state.setAdminPinSettings)

  const [pin, setPin] = useState("")
  const [error, setError] = useState(false)
  const [isShaking, setIsShaking] = useState(false)
  const [showEmergencyReset, setShowEmergencyReset] = useState(false)
  const [resetConfirmInput, setResetConfirmInput] = useState("")
  const [resetError, setResetError] = useState(false)

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
    }
  }, [isPinPromptOpen])

  const handleWrongPin = useCallback(() => {
    setError(true)
    setIsShaking(true)
    setTimeout(() => {
      setIsShaking(false)
      setPin("")
    }, 600)
  }, [])

  const handleDigit = useCallback((digit: string) => {
    setPin((prevPin) => {
      if (prevPin.length >= 4) return prevPin
      return prevPin + digit
    })
    setError(false)
  }, [])

  // Auto-submit when 4 digits are entered
  useEffect(() => {
    if (pin.length !== 4) return
    const success = verifyPin(pin)
    if (!success) handleWrongPin()
  }, [pin, verifyPin, handleWrongPin])

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1))
    setError(false)
  }, [])

  const handleClear = useCallback(() => {
    setPin("")
    setError(false)
  }, [])

  const handleManualSubmit = useCallback(() => {
    if (!pin) return
    const success = verifyPin(pin)
    if (!success) handleWrongPin()
  }, [pin, verifyPin, handleWrongPin])

  // Global window keyboard handler to prevent duplicate input
  useEffect(() => {
    if (!isPinPromptOpen || showEmergencyReset) return

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // Secret Admin Emergency Shortcut: Ctrl + Shift + R
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

    // 5 rapid taps on the lock icon opens emergency reset
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
    if (resetConfirmInput.trim().toUpperCase() === "RESET") {
      setAdminPinSettings({ adminPin: "1234", adminPinEnabled: false })
      verifyPin("1234")
      setShowEmergencyReset(false)
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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-0 bg-[rgba(5,7,10,0.72)] backdrop-blur-sm"
            onClick={closePinPrompt}
          />

          {showEmergencyReset ?
            /* Emergency Reset Dialog */
            <motion.div
              key="emergency-reset-modal"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 flex w-full max-w-[340px] flex-col rounded-2xl border border-white/10 bg-[rgba(15,19,25,0.98)] p-6 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation text-sm text-amber-400" />
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-white">
                      Emergency PIN Reset
                    </h3>
                    <p className="mt-0.5 text-xs text-white/50">Restore default PIN (1234)</p>
                  </div>
                </div>
                <ModalCloseButton onClick={() => setShowEmergencyReset(false)} />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-white/60">
                Type <span className="font-bold text-amber-400">RESET</span> below to disable Admin
                Lock and restore the default PIN (1234).
              </p>

              <input
                type="text"
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEmergencyResetSubmit()
                  if (e.key === "Escape") setShowEmergencyReset(false)
                }}
                placeholder="RESET"
                autoFocus
                className="mt-3 w-full rounded-xl border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2.5 text-center text-xs font-bold tracking-widest text-white transition-all outline-none placeholder:text-white/20 focus:border-amber-400/60 focus:bg-[rgba(28,35,44,0.82)]"
              />

              {resetError && (
                <span className="mt-2 text-center text-[11px] font-medium text-rose-400">
                  Please type RESET to confirm.
                </span>
              )}

              <div className="mt-6 flex w-full gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowEmergencyReset(false)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2 text-[11px] font-medium text-white/70 transition-all duration-200 hover:bg-white/10 hover:text-white active:scale-[0.97]">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEmergencyResetSubmit}
                  disabled={resetConfirmInput.trim().toUpperCase() !== "RESET"}
                  className="flex-1 rounded-lg bg-amber-500 py-2 text-[11px] font-bold text-slate-950 transition-all duration-200 hover:bg-amber-400 active:scale-[0.97] disabled:opacity-30">
                  Reset PIN
                </button>
              </div>
            </motion.div>
          : /* Standard PIN Modal Dialog */
            <motion.div
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
              className="relative z-10 flex w-full max-w-[340px] flex-col rounded-2xl border border-white/10 bg-[rgba(15,19,25,0.98)] p-6 shadow-2xl backdrop-blur-2xl">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div
                    className="flex cursor-pointer items-center gap-2 select-none"
                    onClick={handleLockIconClick}
                    onTouchStart={handleLockTouchStart}
                    onTouchEnd={handleLockTouchEnd}
                    onMouseDown={handleLockTouchStart}
                    onMouseUp={handleLockTouchEnd}
                    title="Admin PIN Lock (Click 5x for emergency reset)">
                    <i className="fa-solid fa-lock text-sm text-cyan-400" />
                    <h3 className="text-base font-semibold tracking-tight text-white">
                      Administrator Lock
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-white/50">Enter PIN to access settings</p>
                </div>
                <ModalCloseButton onClick={closePinPrompt} />
              </div>

              {/* PIN Indicators */}
              <div className="my-5 flex items-center justify-center gap-3">
                {[0, 1, 2, 3].map((index) => {
                  const isFilled = pin.length > index
                  const isActive = pin.length === index
                  return (
                    <div
                      key={index}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-200 ${
                        error ?
                          "border-rose-500/70 bg-rose-500/10 shadow-[0_0_16px_rgba(244,63,94,0.3)]"
                        : isFilled ?
                          "border-cyan-500/60 bg-cyan-500/15 shadow-[0_0_16px_rgba(6,182,212,0.25)]"
                        : isActive ? "border-cyan-500/30 bg-white/[0.04]"
                        : "border-white/10 bg-white/[0.02]"
                      }`}>
                      {isFilled && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className={`h-3 w-3 rounded-full ${
                            error ?
                              "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                            : "bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                          }`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Error text */}
              <div className="flex h-5 items-center justify-center">
                <AnimatePresence>
                  {error && (
                    <motion.span
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-rose-400">
                      <i className="fa-solid fa-circle-exclamation text-[10px]" /> Incorrect PIN.
                      Please try again.
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Touch Keypad */}
              <div className="mt-2 grid w-full grid-cols-3 gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleDigit(num)}
                    className="flex h-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-base font-semibold text-white/90 shadow-sm transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-95 active:border-cyan-500/50 active:bg-cyan-500/20 active:text-cyan-300">
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={pin.length === 0}
                  className="flex h-12 items-center justify-center rounded-xl border border-transparent text-[11px] font-semibold tracking-wider text-white/50 uppercase transition-all duration-150 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-20">
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleDigit("0")}
                  className="flex h-12 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-base font-semibold text-white/90 shadow-sm transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-95 active:border-cyan-500/50 active:bg-cyan-500/20 active:text-cyan-300">
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  disabled={pin.length === 0}
                  className="flex h-12 items-center justify-center rounded-xl border border-transparent text-white/50 transition-all duration-150 hover:bg-white/5 hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-20"
                  aria-label="Backspace">
                  <i className="fa-solid fa-delete-left text-sm" />
                </button>
              </div>
            </motion.div>
          }
        </div>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}
