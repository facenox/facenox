interface EmptyStateProps {
  title: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ title, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex h-full min-h-0 w-full flex-1 items-center justify-center ${className}`}>
      <div className="flex flex-col items-center justify-center space-y-3 text-center">
        <div className="text-xs font-medium tracking-tight text-white/50">{title}</div>

        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-1.5 text-xs text-white/80 shadow-sm transition-colors hover:bg-[rgba(28,35,44,0.82)] hover:text-white active:scale-95">
            <i className="fa-solid fa-user-plus text-[10px]"></i>
            <span className="font-semibold">{action.label}</span>
          </button>
        )}
      </div>
    </div>
  )
}
