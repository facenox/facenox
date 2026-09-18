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
      initial={{ y: 16, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 16, opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`pointer-events-auto mt-2 inline-flex w-fit max-w-2xl items-center gap-3 rounded-xl border px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md ${current.borderBg}`}>
      <i className={`${current.icon} shrink-0 text-sm`} />
      <div className="text-sm leading-snug">
        <span className={`mr-1.5 font-semibold whitespace-nowrap ${current.labelColor}`}>
          {current.label}:
        </span>
        {message}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-none bg-transparent p-0 text-white/55 shadow-none transition-all hover:bg-white/[0.08] hover:text-white"
        aria-label={`Dismiss ${variant}`}>
        <i className="fa-solid fa-xmark text-xs" />
      </button>
    </motion.div>
  )
}
