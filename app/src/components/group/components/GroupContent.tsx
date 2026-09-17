import React, { useMemo, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useGroupStore, useGroupUIStore } from "@/components/group/stores"
import { Members, Overview, Reports } from "@/components/group/sections"
import { EmptyState } from "@/components/group/shared"

interface GroupContentProps {
  onMembersChange: () => void
  deselectMemberTrigger?: number
  onHasSelectedMemberChange?: (hasSelectedMember: boolean) => void
  onDaysTrackedChange?: (daysTracked: number, loading: boolean) => void
  onExportHandlersReady?: (handlers: { exportCSV: () => void }) => void
}

function GroupContentComponent({
  onMembersChange,
  deselectMemberTrigger,
  onHasSelectedMemberChange,
  onDaysTrackedChange,
  onExportHandlersReady,
}: GroupContentProps) {
  const selectedGroup = useGroupStore((state) => state.selectedGroup)
  const groupsLength = useGroupStore((state) => state.groups.length)
  const members = useGroupStore((state) => state.members)
  const activeSection = useGroupUIStore((state) => state.activeSection)
  const openAddMember = useGroupUIStore((state) => state.openAddMember)
  const openEditMember = useGroupUIStore((state) => state.openEditMember)
  const openCreateGroup = useGroupUIStore((state) => state.openCreateGroup)

  const handleMembersChange = () => {
    onMembersChange()
  }

  const selectedGroupId = selectedGroup?.id
  const hasSelectedGroup = useMemo(() => {
    if (!selectedGroup || !selectedGroupId) return false
    const currentGroups = useGroupStore.getState().groups
    return currentGroups.some((g) => g.id === selectedGroupId)
  }, [selectedGroup, selectedGroupId])
  const hasGroups = groupsLength > 0

  const motionProps = {
    initial: { opacity: 0, scale: 0.995 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.995 },
    transition: { duration: 0.18, ease: "easeOut" as const },
    style: { willChange: "opacity, transform" } as React.CSSProperties,
  }

  if (!hasSelectedGroup || !selectedGroup) {
    return (
      <div className="h-full px-6 pt-6">
        <EmptyState
          title={hasGroups ? "Select a group to continue" : "No groups created"}
          description={
            hasGroups ?
              "Choose a group from the sidebar to view overview, reports, and members."
            : "Create a group to start organizing members and recording attendance."
          }
          action={
            !hasGroups ?
              {
                label: "Create Group",
                onClick: openCreateGroup,
                iconClass: "fa-solid fa-plus text-[10px]",
              }
            : undefined
          }
          className="h-full"
        />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {activeSection === "overview" && (
          <motion.div
            key={`overview-${selectedGroupId}`}
            {...motionProps}
            className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <Overview group={selectedGroup} members={members} onAddMember={openAddMember} />
          </motion.div>
        )}

        {activeSection === "reports" && (
          <motion.div
            key={`reports-${selectedGroupId}`}
            {...motionProps}
            className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <Reports
              group={selectedGroup}
              onDaysTrackedChange={onDaysTrackedChange}
              onExportHandlersReady={onExportHandlersReady}
              onAddMember={openAddMember}
            />
          </motion.div>
        )}

        {activeSection === "members" && (
          <motion.div
            key={`members-${selectedGroupId}`}
            {...motionProps}
            className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <Members
              group={selectedGroup}
              members={members}
              onMembersChange={handleMembersChange}
              onEdit={openEditMember}
              onAdd={openAddMember}
              deselectMemberTrigger={deselectMemberTrigger}
              onHasSelectedMemberChange={onHasSelectedMemberChange}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const GroupContent = memo(GroupContentComponent)
