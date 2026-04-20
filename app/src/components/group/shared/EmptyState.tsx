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
    <div
      className={`flex h-full min-h-0 w-full flex-1 items-center justify-center p-8 ${className}`}>
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-white/20">
          <i className="fa-solid fa-users text-xl" />
        </div>

        <div className="space-y-1">
          <div className="text-[13px] font-bold text-white/70">{title}</div>
          <p className="text-[10px] font-medium text-white/20">
            No members added to this group yet.
          </p>
        </div>

        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-bold tracking-tight text-white/60 transition-all hover:bg-white/10 hover:text-white active:scale-95">
            <i className="fa-solid fa-plus text-[8px]" />
            <span>{action.label}</span>
          </button>
        )}
      </div>
    </div>
  )
}
