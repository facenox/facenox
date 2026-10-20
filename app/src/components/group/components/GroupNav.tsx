import { useEffect } from "react"
import type { GroupSection } from "@/components/group/types"
import type { AttendanceGroup } from "@/types/recognition"
import { Tooltip } from "@/components/shared"

interface GroupNavProps {
  activeSection: GroupSection
  onSectionChange: (section: GroupSection) => void
  selectedGroup: AttendanceGroup | null
  isCollapsed: boolean
}

interface SectionConfig {
  id: GroupSection
  label: string
  shortcut: string
}

const SECTIONS: SectionConfig[] = [
  {
    id: "overview",
    label: "Overview",
    shortcut: "1",
  },
  {
    id: "reports",
    label: "Reports",
    shortcut: "2",
  },
  {
    id: "members",
    label: "Members",
    shortcut: "3",
  },
  {
    id: "settings",
    label: "Settings",
    shortcut: "4",
  },
]

export function GroupNav({
  activeSection,
  onSectionChange,
  selectedGroup,
  isCollapsed,
}: GroupNavProps) {
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only trigger if Ctrl/Cmd is not pressed (to avoid conflicts)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Check if user is typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      const section = SECTIONS.find((s) => s.shortcut === e.key)
      if (section && selectedGroup) {
        e.preventDefault()
        onSectionChange(section.id)
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [onSectionChange, selectedGroup])

  return (
    <nav className="custom-scroll flex-1 overflow-y-auto py-2">
      <ul className="space-y-1 px-2">
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.id
          const isDisabled = !selectedGroup

          return (
            <li key={section.id}>
              <Tooltip content={isCollapsed ? section.label : ""} position="right">
                <button
                  onClick={() => !isDisabled && onSectionChange(section.id)}
                  disabled={isDisabled}
                  className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${
                    isActive ? "bg-white/10 text-white"
                    : isDisabled ? "cursor-not-allowed text-white/20"
                    : "text-white/70 hover:bg-white/8 hover:text-white"
                  } `}
                  aria-label={section.label}
                  aria-current={isActive ? "page" : undefined}>
                  {/* Label (hidden when collapsed) */}
                  {!isCollapsed && (
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium">{section.label}</div>
                    </div>
                  )}

                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute top-1/2 left-0 h-8 w-1 -translate-y-1/2 rounded-r-full bg-white" />
                  )}
                </button>
              </Tooltip>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
