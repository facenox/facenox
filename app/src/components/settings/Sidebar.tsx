import React from "react"
import { Dropdown, Tooltip } from "@/components/shared"
import type { AttendanceGroup } from "@/types/recognition"
import type { GroupSection } from "@/components/group/types"

interface SidebarProps {
  activeSection: string
  setActiveSection: (section: string) => void
  groupInitialSection: GroupSection | undefined
  setGroupInitialSection: (section: GroupSection) => void
  dropdownGroups: AttendanceGroup[]
  dropdownValue: string | null
  onGroupSelect?: (group: AttendanceGroup) => void
  setTriggerCreateGroup: (trigger: number) => void
  setRegistrationState: (
    source: "upload" | "camera" | null,
    mode: "single" | "bulk" | "queue" | null,
  ) => void
  sections: { id: string; label: string; icon: string }[]
  groupSections: { id: GroupSection; label: string; icon: string }[]
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  setActiveSection,
  groupInitialSection,
  setGroupInitialSection,
  dropdownGroups,
  dropdownValue,
  onGroupSelect,
  setTriggerCreateGroup,
  setRegistrationState,
  sections,
  groupSections,
}) => {
  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r border-white/5 bg-[#0a0c10] sm:w-[240px] lg:w-[260px]">
      {/* Workspace Switcher Header */}
      <div className="px-3 pt-6 pb-2">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1" key={dropdownGroups.length}>
            <Dropdown
              options={dropdownGroups.map((group) => ({
                value: group.id,
                label: group.name,
              }))}
              value={dropdownValue}
              onChange={(groupId) => {
                if (groupId) {
                  const group = dropdownGroups.find((g) => g.id === groupId)
                  if (group && onGroupSelect) onGroupSelect(group)
                } else {
                  window.dispatchEvent(
                    new CustomEvent("selectGroup", {
                      detail: { group: null },
                    }),
                  )
                }
              }}
              placeholder="Select group..."
              emptyMessage="No groups available"
              maxHeight={256}
              buttonClassName="!h-8 !w-full !rounded-md border-transparent! bg-transparent! !px-2 !text-sm !font-semibold !text-white !transition-colors hover:bg-white/10! focus:ring-0! shadow-none!"
              showPlaceholderOption={false}
            />
          </div>
          <Tooltip content="Create Group" position="bottom">
            <button
              onClick={() => {
                setActiveSection("group")
                if (activeSection !== "group") {
                  setGroupInitialSection("overview")
                }
                setTriggerCreateGroup(Date.now())
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-white/50 transition-colors hover:bg-white/10 hover:text-white">
              <i className="fa-solid fa-plus text-[11px]"></i>
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="hover-scrollbar settings-sidebar-scroll flex-1 space-y-6 overflow-y-auto pt-4 pr-3 pb-6 pl-4">
        <section>
          <div className="mb-3 px-3">
            <h2 className="text-xs font-bold tracking-wider text-white/40 uppercase">
              Group Management
            </h2>
          </div>

          <div className="space-y-3">
            <div
              className={`space-y-1 ${!dropdownValue ? "pointer-events-none opacity-40 grayscale" : ""}`}>
              {groupSections.map((subsection) => {
                const isActive = activeSection === "group" && groupInitialSection === subsection.id
                return (
                  <button
                    key={subsection.id}
                    onClick={() => {
                      setActiveSection("group")
                      setGroupInitialSection(subsection.id)
                      setTriggerCreateGroup(0)
                      if (subsection.id === "registration") {
                        setRegistrationState(null, null)
                      }
                    }}
                    className={`group/item flex w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 py-2.5 text-left text-[14px] font-medium transition-colors ${
                      isActive ? "!bg-white/10 text-white" : (
                        "text-white/60 hover:!bg-white/5 hover:text-white"
                      )
                    }`}>
                    <i
                      className={`${subsection.icon} w-5 text-sm ${isActive ? "text-cyan-400" : "text-white/40 group-hover/item:text-white/70"}`}></i>
                    {subsection.label}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 px-3">
            <h2 className="text-xs font-bold tracking-wider text-white/40 uppercase">General</h2>
          </div>

          <div className="space-y-1">
            {sections.map((section) => {
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`group/item flex w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 py-2.5 text-left text-[14px] font-medium transition-colors ${
                    isActive ? "!bg-white/10 text-white" : (
                      "text-white/60 hover:!bg-white/5 hover:text-white"
                    )
                  }`}>
                  <i
                    className={`${section.icon} w-5 text-sm ${isActive ? "text-white" : "text-white/40 group-hover/item:text-white/70"}`}></i>
                  {section.label}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
