import { Dropdown, Tooltip } from "@/components/shared";

import { useGroupStore, useGroupUIStore } from "@/components/group/stores";
import { useGroupModals } from "@/components/group/hooks";
import { GroupHeader } from "@/components/group/components/GroupHeader";
import { GroupNav } from "@/components/group/components/GroupNav";

interface GroupSidebarProps {
  onBack: () => void;
}

export function GroupSidebar({ onBack }: GroupSidebarProps) {
  const { selectedGroup, groups, setSelectedGroup } = useGroupStore();
  const { activeSection, isSidebarCollapsed, setActiveSection, toggleSidebar } =
    useGroupUIStore();
  const { openCreateGroup } = useGroupModals();
  return (
    <aside
      className={`
        flex flex-col border-r border-white/10 bg-white/5
        transition-all duration-300 ease-in-out flex-shrink-0
        ${isSidebarCollapsed ? "w-16" : "w-64"} h-full
      `}
    >
      <GroupHeader
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {!isSidebarCollapsed && (
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Dropdown
                options={groups.map((group) => ({
                  value: group.id,
                  label: group.name,
                }))}
                value={selectedGroup?.id ?? null}
                onChange={(value: string | number | null) => {
                  const groupId = value as string | null;
                  if (groupId) {
                    const group = groups.find((g) => g.id === groupId);
                    setSelectedGroup(group ?? null);
                  } else {
                    setSelectedGroup(null);
                  }
                }}
                placeholder="Select group…"
                emptyMessage="No groups available"
                maxHeight={256}
                buttonClassName="h-10"
                allowClear={true}
              />
            </div>
            <Tooltip content="New Group" position="top">
              <button
                onClick={openCreateGroup}
                className="w-10 h-10 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center flex-shrink-0"
                aria-label="New Group"
              >
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
        className={`py-3 border-t border-white/10 mt-auto ${isSidebarCollapsed ? "px-2" : "px-4"}`}
      >
        <button
          onClick={onBack}
          className={`w-full rounded-lg text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white/80 border-none bg-transparent transition-all text-center ${isSidebarCollapsed ? "px-2 py-2" : "px-3 py-2"}`}
          aria-label="Close"
        >
          {!isSidebarCollapsed ? (
            <span className="text-sm">Close</span>
          ) : (
            <svg
              className="w-5 h-5 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
        </button>
      </div>
    </aside>
  );
}
