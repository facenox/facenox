import React, { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Dropdown, Tooltip } from "@/components/shared"
import { generateGroupDisplayNames } from "@/utils"
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
  setEnrollmentState: (
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
  setEnrollmentState,
  sections,
  groupSections,
}) => {
  const [isPaired, setIsPaired] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.sync) return

    const fetchConfig = () => {
      window.electronAPI.sync
        .getConfig()
        .then((c) => setIsPaired(c.connected))
        .catch(console.error)
    }

    fetchConfig()

    const unsubscribe = window.electronAPI.sync.onDataChanged(() => {
      fetchConfig()
    })

    return unsubscribe
  }, [])

  return (
    <div className="settings-sidebar flex w-[200px] shrink-0 flex-col border-r border-white/5 bg-[var(--bg-primary)] sm:w-[220px] lg:w-[240px]">
      {/* Workspace Switcher Header */}
      <div className="pt-6 pr-[16px] pb-2 pl-[16px]">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1" key={dropdownGroups.length}>
            <Dropdown
              options={generateGroupDisplayNames(dropdownGroups).map((group) => ({
                value: group.id,
                label: group.displayName,
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
              placeholder={dropdownGroups.length === 0 ? "No groups yet" : "Select group..."}
              disabled={dropdownGroups.length === 0}
              emptyMessage="No groups available"
              maxHeight={256}
              buttonClassName="!h-8 !w-full !rounded-md !border-white/5 !bg-white/5 !px-3.5 !text-xs !font-bold !tracking-wide !text-white/80 !transition-colors hover:!bg-white/[0.08] hover:!border-white/10 focus:!border-white/20 dropdown-trigger !shadow-none"
              showPlaceholderOption={false}
              menuWidth={220}
              align="center"
              alignToSelector=".settings-sidebar"
            />
          </div>
          {!isPaired && (
            <Tooltip content="Create Group" position="bottom">
              <button
                onClick={() => {
                  setActiveSection("group")
                  if (activeSection !== "group") {
                    setGroupInitialSection("overview")
                  }
                  setEnrollmentState(null, null)
                  setTriggerCreateGroup(Date.now())
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/5 bg-white/5 text-white/65 transition-all hover:border-white/10 hover:bg-white/[0.08] hover:text-white active:scale-95">
                <i className="fa-solid fa-plus text-[11px]"></i>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="hover-scrollbar settings-sidebar-scroll flex-1 space-y-6 overflow-y-auto pt-4 pr-[6px] pb-6 pl-[16px]">
        <section>
          <div className="mb-3 px-3">
            <h2 className="text-[10px] font-bold tracking-[0.15em] text-white/55 uppercase">
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
                      setEnrollmentState(null, null)
                      setTriggerCreateGroup(0)
                    }}
                    className={`group/item relative flex w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 py-2 text-left text-[13px] font-medium transition-all ${
                      isActive ?
                        "bg-cyan-500/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}>
                    {isActive && (
                      <motion.div
                        layoutId="active-settings-sidebar-pill"
                        className="absolute left-[-16px] h-5 w-[3px] rounded-r-[2px] bg-cyan-400"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <i
                      className={`${subsection.icon} w-5 text-sm transition-colors ${isActive ? "text-cyan-400" : "text-white/55 group-hover/item:text-white/70"}`}></i>
                    {subsection.label}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 px-3">
            <h2 className="text-[10px] font-bold tracking-[0.15em] text-white/55 uppercase">
              Preferences
            </h2>
          </div>

          <div className="space-y-1">
            {sections.map((section) => {
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`group/item relative flex w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 py-2 text-left text-[13px] font-medium transition-all ${
                    isActive ?
                      "bg-cyan-500/10 text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}>
                  {isActive && (
                    <motion.div
                      layoutId="active-settings-sidebar-pill"
                      className="absolute left-[-16px] h-5 w-[3px] rounded-r-[2px] bg-cyan-400"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <i
                    className={`${section.icon} w-5 text-sm transition-colors ${isActive ? "text-cyan-400" : "text-white/55 group-hover/item:text-white/70"}`}></i>
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
