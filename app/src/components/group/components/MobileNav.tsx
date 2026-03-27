import type { GroupSection } from "@/components/group/types"
import type { AttendanceGroup } from "@/types/recognition"

interface MobileNavProps {
  activeSection: GroupSection
  onSectionChange: (section: GroupSection) => void
  selectedGroup: AttendanceGroup | null
  onClose: () => void
}

interface SectionConfig {
  id: GroupSection
  label: string
  icon: string
  description: string
}

const SECTIONS: SectionConfig[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "",
    description: "Statistics & activity",
  },
  { id: "reports", label: "Reports", icon: "", description: "View reports" },
  { id: "members", label: "Members", icon: "", description: "Manage members" },
  {
    id: "registration",
    label: "Registration",
    icon: "",
    description: "Register faces",
  },
  { id: "settings", label: "Settings", icon: "", description: "Configuration" },
]

export function MobileNav({
  activeSection,
  onSectionChange,
  selectedGroup,
  onClose,
}: MobileNavProps) {
  const handleSectionClick = (section: GroupSection) => {
    if (selectedGroup) {
      onSectionChange(section)
      onClose()
    }
  }

  return (
    <nav className="custom-scroll h-full overflow-y-auto px-4 pt-3 pb-4">
      <ul className="space-y-2">
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.id
          const isDisabled = !selectedGroup

          return (
            <li key={section.id}>
              <button
                onClick={() => handleSectionClick(section.id)}
                disabled={isDisabled}
                className={`relative flex w-full items-center gap-4 rounded-lg px-4 py-3 transition-all duration-200 ${
                  isActive ? "bg-white/10 text-white"
                  : isDisabled ? "cursor-not-allowed text-white/20"
                  : "text-white/50 hover:bg-white/8 hover:text-white active:bg-white/10"
                } `}>
                {/* Content */}
                <div className="flex-1 text-left">
                  <div className="text-base font-medium">{section.label}</div>
                  <div className="mt-1 text-[11px] font-medium text-white/40">
                    {section.description}
                  </div>
                </div>

                {/* Active indicator */}
                {isActive && (
                  <div className="absolute top-1/2 left-0 h-10 w-1 -translate-y-1/2 rounded-r-full bg-white" />
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {/* Footer Hint */}
      {selectedGroup && (
        <div className="mt-6 rounded-lg border border-white/10 bg-[rgba(17,22,29,0.96)] px-4 py-3">
          <div className="text-xs text-white/60">
            <div className="mb-1 font-semibold">Quick Tip</div>
            <div>Swipe from left edge to open this menu</div>
          </div>
        </div>
      )}
    </nav>
  )
}
