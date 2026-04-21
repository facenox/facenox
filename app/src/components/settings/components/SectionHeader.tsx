import React from "react"
import { motion, AnimatePresence } from "framer-motion"

interface SectionHeaderProps {
  title: string
  eyebrow?: string
  eyebrowColor?: string
  actions?: React.ReactNode
  isGroupSection?: boolean
}

export function SectionHeader({
  title,
  eyebrow,
  eyebrowColor = "text-white/20",
  actions,
  isGroupSection = false,
}: SectionHeaderProps) {
  return (
    <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-[rgba(15,19,25,0.8)] pt-6 pr-14 pb-4 pl-10 backdrop-blur-md">
      <div
        className={`flex w-full items-center justify-between ${isGroupSection ? "" : "mx-auto max-w-[900px]"}`}>
        <div className="flex flex-col">
          <AnimatePresence mode="wait">
            {eyebrow && (
              <motion.span
                key={eyebrow}
                initial={{ opacity: 0, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.2 }}
                className={`mb-0.5 text-[10px] font-bold tracking-[0.15em] uppercase ${eyebrowColor}`}>
                {eyebrow}
              </motion.span>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.h2
              key={title}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {title}
            </motion.h2>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {actions && (
              <motion.div
                key={title + "-actions"}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}>
                {actions}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
