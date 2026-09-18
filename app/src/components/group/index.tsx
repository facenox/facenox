import { useEffect, useRef, useCallback, memo } from "react"
import { AnimatePresence } from "framer-motion"

export type { GroupSection } from "@/components/group/types"
import type { GroupPanelProps } from "@/components/group/types"
import type { AttendanceGroup } from "@/types/recognition"

import { useGroupStore, useGroupUIStore } from "@/components/group/stores"
import { useGroupData } from "@/components/group/hooks"
import { FloatingAlert } from "@/components/common"
import { GroupContent, GroupModals, GroupSidebar } from "@/components/group/components"

function GroupPanelComponent({
  onBack,
  initialSection,
  initialGroup,
  onGroupsChanged,
  isEmbedded = false,
  embeddedGroups = [],
  embeddedMembers = [],
  triggerCreateGroup = 0,
  deselectMemberTrigger,
  onHasSelectedMemberChange,
  onDaysTrackedChange,
  onExportHandlersReady,
  onAddMemberHandlerReady,
  onSectionChange,
}: GroupPanelProps) {
  const selectedGroup = useGroupStore((state) => state.selectedGroup)
  const error = useGroupStore((state) => state.error)
  const setSelectedGroup = useGroupStore((state) => state.setSelectedGroup)
  const setError = useGroupStore((state) => state.setError)
  const fetchGroups = useGroupStore((state) => state.fetchGroups)
  const fetchGroupDetails = useGroupStore((state) => state.fetchGroupDetails)
  const setActiveSection = useGroupUIStore((state) => state.setActiveSection)
  const openCreateGroup = useGroupUIStore((state) => state.openCreateGroup)
  const openAddMember = useGroupUIStore((state) => state.openAddMember)

  useGroupData(initialGroup, {
    isEmbedded,
    embeddedGroups,
    embeddedMembers,
  })

  const notifyParentDataChanged = useCallback(
    (newGroup?: AttendanceGroup) => {
      onGroupsChanged?.(newGroup)
    },
    [onGroupsChanged],
  )

  const handleMemberSuccess = useCallback(() => {
    const currentGroup = useGroupStore.getState().selectedGroup
    if (!isEmbedded && currentGroup) {
      fetchGroupDetails(currentGroup.id)
    }
    notifyParentDataChanged()
  }, [fetchGroupDetails, isEmbedded, notifyParentDataChanged])

  const handleGroupSuccess = useCallback(
    (newGroup?: AttendanceGroup) => {
      if (!isEmbedded) {
        fetchGroups()
      }
      if (newGroup && !isEmbedded) {
        setSelectedGroup(newGroup)
      }

      notifyParentDataChanged(newGroup)
    },
    [fetchGroups, isEmbedded, setSelectedGroup, notifyParentDataChanged],
  )

  const handleMembersChange = useCallback(() => {
    if (!isEmbedded && selectedGroup) {
      fetchGroupDetails(selectedGroup.id)
    }
    notifyParentDataChanged()
  }, [selectedGroup, fetchGroupDetails, isEmbedded, notifyParentDataChanged])

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection)
      prevActiveSectionRef.current = initialSection // Sync the ref to prevent staleness
    }
  }, [initialSection, setActiveSection])

  const prevTriggerRef = useRef(0)
  useEffect(() => {
    if (triggerCreateGroup > 0 && triggerCreateGroup !== prevTriggerRef.current) {
      openCreateGroup()
      prevTriggerRef.current = triggerCreateGroup
    }
  }, [triggerCreateGroup, openCreateGroup])

  useEffect(() => {
    if (onAddMemberHandlerReady) {
      onAddMemberHandlerReady(openAddMember)
    }
  }, [onAddMemberHandlerReady, openAddMember])

  const prevActiveSectionRef = useRef(useGroupUIStore.getState().activeSection)

  useEffect(() => {
    const unsubscribe = useGroupUIStore.subscribe((state) => {
      if (state.activeSection !== prevActiveSectionRef.current) {
        prevActiveSectionRef.current = state.activeSection
        onSectionChange?.(state.activeSection)
      }
    })

    return unsubscribe
  }, [onSectionChange])

  if (isEmbedded) {
    return (
      <>
        <div className="pointer-events-none fixed bottom-12 left-1/2 z-50 flex -translate-x-1/2 items-center justify-center px-4">
          <AnimatePresence>
            {error && (
              <FloatingAlert message={error} variant="error" onDismiss={() => setError(null)} />
            )}
          </AnimatePresence>
        </div>

        <div className="flex h-full flex-col overflow-hidden">
          <GroupContent
            onMembersChange={handleMembersChange}
            deselectMemberTrigger={deselectMemberTrigger}
            onHasSelectedMemberChange={onHasSelectedMemberChange}
            onDaysTrackedChange={onDaysTrackedChange}
            onExportHandlersReady={onExportHandlersReady}
          />
        </div>

        <GroupModals
          isEmbedded={isEmbedded}
          onMemberSuccess={handleMemberSuccess}
          onGroupSuccess={handleGroupSuccess}
        />
      </>
    )
  }

  return (
    <div className="flex h-full overflow-hidden bg-[var(--bg-primary)] text-white">
      <div className="pointer-events-none fixed bottom-12 left-1/2 z-50 flex -translate-x-1/2 items-center justify-center px-4">
        <AnimatePresence>
          {error && (
            <FloatingAlert message={error} variant="error" onDismiss={() => setError(null)} />
          )}
        </AnimatePresence>
      </div>

      <GroupSidebar onBack={onBack} />

      <main className="relative flex h-full flex-1 flex-col overflow-hidden bg-[var(--bg-primary)]">
        <GroupContent
          onMembersChange={handleMembersChange}
          deselectMemberTrigger={deselectMemberTrigger}
          onHasSelectedMemberChange={onHasSelectedMemberChange}
          onDaysTrackedChange={onDaysTrackedChange}
          onExportHandlersReady={onExportHandlersReady}
        />
      </main>

      <GroupModals
        isEmbedded={isEmbedded}
        onMemberSuccess={handleMemberSuccess}
        onGroupSuccess={handleGroupSuccess}
      />
    </div>
  )
}

export const GroupPanel = memo(GroupPanelComponent)
