interface ErrorMessageProps {
  message: string
  onClose?: () => void
  className?: string
  showIcon?: boolean
}

export function ErrorMessage({
  message,
  onClose,
  className = "",
  showIcon = true,
}: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={`flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-200 shadow-[0_4px_16px_rgba(0,0,0,0.2)] backdrop-blur-sm ${className}`}>
      {showIcon && <i className="fa-solid fa-circle-exclamation shrink-0 text-xs text-red-400" />}
      <span className="flex-1 leading-snug">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-red-300/60 transition-colors hover:bg-white/10 hover:text-red-200 focus-visible:outline-none"
          aria-label="Dismiss error">
          <i className="fa-solid fa-xmark text-xs" />
        </button>
      )}
    </div>
  )
}
