import React from "react"
import { motion } from "framer-motion"
import { Users, Plus } from "lucide-react"

interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }
  children?: React.ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  children,
  className = "",
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`flex h-full min-h-0 w-full max-w-full flex-1 flex-col items-center justify-center p-8 px-6 text-center ${className}`}>
      <div className="text-white/35">{icon || <Users className="size-8" />}</div>

      <div className="mt-3.5 max-w-full space-y-1 px-4">
        <h3 className="text-sm font-semibold [overflow-wrap:anywhere] break-words text-white/90">
          {title}
        </h3>
        {description && (
          <p className="mx-auto max-w-md text-xs leading-relaxed [overflow-wrap:anywhere] break-words text-white/55">
            {description}
          </p>
        )}
      </div>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 flex items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-white/70 transition-all hover:bg-white/[0.08] hover:text-white active:scale-95">
          {action.icon || <Plus className="size-3" />}
          <span>{action.label}</span>
        </button>
      )}

      {children}
    </motion.div>
  )
}
