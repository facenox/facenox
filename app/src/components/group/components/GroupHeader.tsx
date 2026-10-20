import { ChevronLeft, ChevronRight } from "lucide-react"
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
          <img src="./icons/logo-transparent.png" alt="Facenox" className="h-9 w-9" />
          <h1 className="text-lg font-semibold text-white">Group</h1>
        </div>
      )}

      {/* Collapse/Expand Button */}
      <Tooltip content={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} position="right">
        <button
          onClick={onToggleCollapse}
          className={`group flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] transition-all hover:bg-white/[0.08] ${isCollapsed ? "mx-auto" : "ml-auto"}`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {isCollapsed ?
            <ChevronRight className="size-4 text-white/65 transition-all duration-200 group-hover:text-white" />
          : <ChevronLeft className="size-4 text-white/65 transition-all duration-200 group-hover:text-white" />
          }
        </button>
      </Tooltip>
    </div>
  )
}
