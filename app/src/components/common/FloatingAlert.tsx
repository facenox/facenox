import { motion } from "framer-motion"

export type AlertVariant = "success" | "warning" | "error"

interface FloatingAlertProps {
  /** The message text to display inside the alert. */
  message: string
  /** The type of alert which determines the theme color and icon. */
  variant: AlertVariant
  /** Callback fired when the user clicks the dismiss button. */
  onDismiss: () => void
}

/**
 * Renders a standardized, floating notification alert that slides down from the top of the viewport.
 *
 * WHY: This centralizes the styling and animations of error, success, and warning toasts across
 * the app to ensure visual consistency and reduce code redundancy in main layout files.
 */
export function FloatingAlert({ message, variant, onDismiss }: FloatingAlertProps) {
  const configs = {
    success: {
      borderBg: "border-emerald-500/30 bg-[rgba(6,28,20,0.92)] text-emerald-100/95",
      icon: "fa-solid fa-circle-check text-emerald-400",
      label: "Success",
      labelColor: "text-emerald-400",
    },
    warning: {
      borderBg: "border-amber-500/30 bg-[rgba(24,18,10,0.9)] text-amber-100/95",
      icon: "fa-solid fa-triangle-exclamation text-amber-400",
      label: "Warning",
      labelColor: "text-amber-400",
    },
    error: {
      borderBg: "border-red-500/30 bg-[rgba(28,10,10,0.9)] text-red-100/95",
      icon: "fa-solid fa-circle-xmark text-red-400",
      label: "Error",
      labelColor: "text-red-400",
    },
  }

  const current = configs[variant]

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -20, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`pointer-events-auto mb-3 flex items-start gap-3 rounded-xl border p-4 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ${current.borderBg}`}>
      <i className={`${current.icon} mt-0.5`} />
      <div className="flex-1 text-sm leading-relaxed">
        <span className={`mr-1.5 font-semibold whitespace-nowrap ${current.labelColor}`}>
          {current.label}:
        </span>
        {message}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-none bg-transparent p-0 text-white/55 shadow-none transition-all hover:bg-white/[0.08] hover:text-white"
        aria-label={`Dismiss ${variant}`}>
        <i className="fa-solid fa-xmark text-xs" />
      </button>
    </motion.div>
  )
}
