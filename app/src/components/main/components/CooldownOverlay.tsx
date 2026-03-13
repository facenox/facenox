import type { CooldownInfo } from "@/components/main/types"
import { AnimatePresence, motion } from "framer-motion"
import { useState, useEffect } from "react"

interface CooldownOverlayProps {
  persistentCooldowns: Map<string, CooldownInfo>
  attendanceCooldownSeconds: number
}

export function CooldownOverlay({ persistentCooldowns }: CooldownOverlayProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const [, info] of persistentCooldowns) {
      const expiresAt = info.startTime + info.cooldownDurationSeconds * 1000
      const msLeft = expiresAt - Date.now() + 100

      timers.push(setTimeout(() => setNow(Date.now()), Math.max(0, msLeft)))
    }

    return () => timers.forEach(clearTimeout)
  }, [persistentCooldowns])

  const activeCooldowns = Array.from(persistentCooldowns.entries())
    .filter(([, info]) => now - info.startTime < info.cooldownDurationSeconds * 1000)
    .sort((a, b) => b[1].startTime - a[1].startTime)
    .slice(0, 3)

  return (
    <div className="pointer-events-none absolute top-6 left-6 z-100 flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {activeCooldowns.map(([personId, info]) => (
          <motion.div
            layout
            key={`${personId}-${info.startTime}`}
            initial={{ opacity: 0, x: -20, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{
              duration: 0.3,
              ease: "easeOut",
              layout: { duration: 0.2 },
            }}
            className="group relative">
            {/* Main Card */}
            <div className="relative flex min-w-50 items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0b]/90 p-3 shadow-2xl">
              {/* Avatar */}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                <i className="fa-solid fa-check text-xs text-cyan-400"></i>
              </div>

              {/* Content */}
              <div className="flex min-w-0 flex-1 flex-col justify-center pr-1">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="truncate text-xs leading-tight font-semibold text-white">
                    {info.memberName || "Authorized Personnel"}
                  </h4>
                  <span className="px-1.5 text-[11px] font-medium text-cyan-400/80">Logged</span>
                </div>
              </div>
            </div>

            {/* Subtle Aura */}
            <div className="absolute -inset-0.5 rounded-xl bg-cyan-500/10 opacity-0 blur-xl transition-opacity group-hover:opacity-100" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
