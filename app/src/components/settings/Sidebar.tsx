import React from "react"
import { motion } from "framer-motion"
import { Dropdown, Tooltip } from "@/components/shared"
import type { AttendanceGroup } from "@/types/recognition"
import { useGroupStore } from "@/components/group/stores"
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
  const storeGroups = useGroupStore((state) => state.groups)

  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r border-white/6 bg-[rgba(12,16,22,0.96)] sm:w-[240px] lg:w-[280px]">
      <div className="flex items-center justify-between px-3 pt-8 pb-4">
        <h1 className="text-[11px] font-medium text-white/30">Settings</h1>
      </div>

      <div className="hover-scrollbar settings-sidebar-scroll flex-1 space-y-10 overflow-y-auto pr-1 pb-6 pl-3">
        <section>
          <div className="mb-4 flex items-center justify-between px-3">
            <h2 className="text-[11px] font-medium text-white/30">Group Management</h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center px-1">
              <div className="min-w-0 flex-1" key={storeGroups.length}>
                <Dropdown
                  options={dropdownGroups.map((group) => ({
                    value: group.id,
                    label: group.name,
                  }))}
                  value={dropdownValue}
                  onChange={(groupId) => {
                    const groupStore = useGroupStore.getState()
                    if (groupId) {
                      const group = dropdownGroups.find((g) => g.id === groupId)
                      if (group) {
                        groupStore.setSelectedGroup(group)
                        if (onGroupSelect) onGroupSelect(group)
                      }
                    } else {
                      groupStore.setSelectedGroup(null)
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
                  buttonClassName="h-9 border-r-0 rounded-r-none focus:ring-0! focus:border-white/20!"
                  showPlaceholderOption={false}
                />
              </div>
              <Tooltip content="Create Group" position="top">
                <button
                  onClick={() => {
                    setActiveSection("group")
                    if (activeSection !== "group") {
                      setGroupInitialSection("overview")
                    }
                    setTriggerCreateGroup(Date.now())
                  }}
                  className="group/btn flex h-9 w-9 shrink-0 items-center justify-center rounded-l-none rounded-r-lg border border-white/10 bg-[rgba(20,25,32,0.78)] text-white/40 transition-all hover:bg-[rgba(28,35,44,0.92)] hover:text-cyan-400 focus:outline-none">
                  <i className="fa-solid fa-plus text-xs transition-transform group-hover/btn:scale-110"></i>
                </button>
              </Tooltip>
            </div>

            <div
              className={`space-y-0.5 ${!dropdownValue ? "pointer-events-none opacity-40 grayscale" : ""}`}>
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
                    className={`group/item relative flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-[14px] font-medium transition-all ${
                      isActive ?
                        "bg-[rgba(27,34,43,0.95)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                      : "text-white/60 hover:bg-[rgba(20,25,32,0.78)] hover:text-white"
                    }`}>
                    {isActive && (
                      <motion.div
                        layoutId="active-indicator-group"
                        className="absolute top-1/2 left-[-8px] h-6 w-1 -translate-y-1/2 rounded-r-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                      />
                    )}
                    <i
                      className={`${subsection.icon} w-4 text-xs transition-transform group-hover/item:scale-105 ${isActive ? "text-cyan-400" : "text-white/50"}`}></i>
                    {subsection.label}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 px-3">
            <h2 className="text-[11px] font-medium text-white/30">General</h2>
          </div>

          <div className="space-y-0.5">
            {sections.map((section) => {
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`group/item relative flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-[14px] font-medium transition-all ${
                    isActive ?
                      "bg-[rgba(27,34,43,0.95)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                    : "text-white/60 hover:bg-[rgba(20,25,32,0.78)] hover:text-white"
                  }`}>
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator-general"
                      className="absolute top-1/2 left-[-8px] h-6 w-1 -translate-y-1/2 rounded-r-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                    />
                  )}
                  <i
                    className={`${section.icon} w-4 text-xs transition-transform group-hover/item:scale-105 ${isActive ? "text-white" : "text-white/70"}`}></i>
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
