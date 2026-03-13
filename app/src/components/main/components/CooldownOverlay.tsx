import type { CooldownInfo } from "@/components/main/types"
import { AnimatePresence, motion } from "framer-motion"
import { useState, useEffect } from "react"

interface CooldownOverlayProps {
  persistentCooldowns: Map<string, CooldownInfo>
  attendanceCooldownSeconds: number
}

const MAX_CHIP_DISPLAY_DURATION_MS = 8000

export function CooldownOverlay({ persistentCooldowns }: CooldownOverlayProps) {
  const [now, setNow] = useState(() => Date.now())

  const hasActiveCooldowns = persistentCooldowns.size > 0

  useEffect(() => {
    if (!hasActiveCooldowns) return

    requestAnimationFrame(() => setNow(Date.now()))

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 200)

    return () => clearInterval(interval)
  }, [hasActiveCooldowns])

  const activeItems = Array.from(persistentCooldowns.entries())
    .filter(([, info]) => {
      const elapsed = now - info.startTime

      const visualThreshold = Math.min(
        info.cooldownDurationSeconds * 1000,
        MAX_CHIP_DISPLAY_DURATION_MS,
      )

      const isVisuallyActive = elapsed >= 0 && elapsed < visualThreshold

      if (elapsed < 0) return true

      return isVisuallyActive
    })
    .sort((a, b) => b[1].startTime - a[1].startTime)
    .slice(0, 3)

  return (
    <div className="pointer-events-none absolute top-6 left-6 z-100 flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {activeItems.map(([cooldownKey, info]) => (
          <motion.div
            layout
            key={cooldownKey}
            initial={{ opacity: 0, x: -20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{
              duration: 0.3,
              ease: "easeOut",
              layout: { duration: 0.2 },
            }}
            className="group relative">
            <div className="relative flex min-w-50 items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0b]/90 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                <i className="fa-solid fa-check text-xs text-cyan-400"></i>
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center pr-1">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="truncate text-xs leading-tight font-semibold text-white">
                    {info.memberName || "Authorized Personnel"}
                  </h4>
                  <span className="px-1.5 text-[11px] font-medium text-cyan-400/80">Logged</span>
                </div>
              </div>
            </div>

            <div className="absolute -inset-0.5 rounded-xl bg-cyan-500/10 opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
