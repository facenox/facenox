import { motion } from "framer-motion"

interface EmptyStateProps {
  title: string
  description?: string
  iconClass?: string
  action?: {
    label: string
    onClick: () => void
    iconClass?: string
  }
  children?: React.ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  iconClass = "fa-solid fa-users text-2xl",
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
      className={`flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center p-8 px-6 text-center ${className}`}>
      <div className="text-white/35">
        <i className={iconClass} />
      </div>

      <div className="mt-3.5 space-y-1">
        <h3 className="text-sm font-semibold text-white/90">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-white/55">{description}</p>
        )}
      </div>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 flex items-center gap-2 rounded border border-white/10 bg-[rgba(22,28,36,0.62)] px-4 py-1.5 text-xs font-semibold text-white/70 transition-all hover:bg-[rgba(22,28,36,0.85)] hover:text-white active:scale-95">
          <i className={action.iconClass || "fa-solid fa-plus text-[10px]"} />
          <span>{action.label}</span>
        </button>
      )}

      {children}
    </motion.div>
  )
}
