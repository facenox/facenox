import { Tooltip } from "@/components/shared"

interface GroupHeaderProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export function GroupHeader({ isCollapsed, onToggleCollapse }: GroupHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
      {!isCollapsed && (
        <div className="flex items-center gap-2">
          <img
            src="./icons/logo.png"
            alt="Facenox"
            className="h-9 w-9"
          />
          <h1 className="text-lg font-semibold text-white">Group</h1>
        </div>
      )}

      {/* Collapse/Expand Button */}
      <Tooltip content={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} position="right">
        <button
          onClick={onToggleCollapse}
          className={`group flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition-all hover:bg-white/10 ${isCollapsed ? "mx-auto" : "ml-auto"}`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <i
            className={`fa-solid text-sm ${isCollapsed ? "fa-chevron-right" : "fa-chevron-left"} text-white/50 transition-all duration-200 group-hover:text-white`}></i>
        </button>
      </Tooltip>
    </div>
  )
}
