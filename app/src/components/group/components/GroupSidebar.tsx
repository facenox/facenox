import { Dropdown, Tooltip } from "@/components/shared"

import { useGroupStore, useGroupUIStore } from "@/components/group/stores"
import { useGroupModals } from "@/components/group/hooks"
import { GroupHeader } from "@/components/group/components/GroupHeader"
import { GroupNav } from "@/components/group/components/GroupNav"

interface GroupSidebarProps {
  onBack: () => void
}

export function GroupSidebar({ onBack }: GroupSidebarProps) {
  const { selectedGroup, groups, setSelectedGroup } = useGroupStore()
  const { activeSection, isSidebarCollapsed, setActiveSection, toggleSidebar } = useGroupUIStore()
  const { openCreateGroup } = useGroupModals()
  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-white/10 bg-[rgba(12,16,22,0.94)] transition-all duration-300 ease-in-out ${isSidebarCollapsed ? "w-16" : "w-64"}`}>
      <GroupHeader isCollapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />

      {!isSidebarCollapsed && (
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Dropdown
                options={groups.map((group) => ({
                  value: group.id,
                  label: group.name,
                }))}
                value={selectedGroup?.id ?? null}
                onChange={(value: string | number | null) => {
                  const groupId = value as string | null
                  if (groupId) {
                    const group = groups.find((g) => g.id === groupId)
                    setSelectedGroup(group ?? null)
                  } else {
                    setSelectedGroup(null)
                  }
                }}
                placeholder="Select group..."
                emptyMessage="No groups available"
                maxHeight={256}
                buttonClassName="h-10"
                allowClear={true}
              />
            </div>
            <Tooltip content="New Group" position="top">
              <button
                onClick={openCreateGroup}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[rgba(24,30,38,0.85)]"
                aria-label="New Group">
                <span className="text-lg">+</span>
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      <GroupNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        selectedGroup={selectedGroup}
        isCollapsed={isSidebarCollapsed}
      />

      <div
        className={`mt-auto border-t border-white/10 py-3 ${isSidebarCollapsed ? "px-2" : "px-4"}`}>
        <button
          onClick={onBack}
          className={`w-full rounded-lg border-none bg-transparent text-center text-[11px] font-medium text-white/40 transition-all hover:bg-[rgba(24,30,38,0.85)] hover:text-white/80 ${isSidebarCollapsed ? "px-2 py-2" : "px-3 py-2"}`}
          aria-label="Close">
          {!isSidebarCollapsed ?
            <span className="text-sm">Close</span>
          : <svg className="mx-auto h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          }
        </button>
      </div>
    </aside>
  )
}
