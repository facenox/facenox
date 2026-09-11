import { memo } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface ActiveHeadTurnGuideProps {
  active: boolean
}

export const ActiveHeadTurnGuide = memo(function ActiveHeadTurnGuide({
  active,
}: ActiveHeadTurnGuideProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="active-head-turn-guide"
          initial={{ opacity: 0, y: 14, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="pointer-events-none absolute bottom-6 left-1/2 z-40 -translate-x-1/2 select-none">
          <div className="relative flex items-center gap-2.5 rounded-full border border-cyan-500/25 bg-[rgba(10,14,20,0.92)] p-1.5 pr-4.5 shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-md">
            {/* Cropped 3D Minimalist Mannequin Head in Circular Badge */}
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] ring-1 ring-cyan-400/25">
              <img
                src="./assets/anti-spoof/head-turn-guide.webp"
                alt="3D Head Turn Guidance"
                className="h-full w-full object-contain"
              />
            </div>

            {/* Clean Single-Line Command */}
            <span className="text-xs font-semibold tracking-wide whitespace-nowrap text-white/95">
              Slowly Turn Head
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
