import type { AttendanceGroup } from "@/types/recognition"
import { AnimatePresence } from "framer-motion"
import { useGroupStore } from "@/components/group/stores"
import { useGroupModals } from "@/components/group/hooks"
import { AddMember, CreateGroup, EditGroup, EditMember } from "@/components/group/modals"

interface GroupModalsProps {
  isEmbedded?: boolean
  onMemberSuccess: () => void
  onGroupSuccess: (group?: AttendanceGroup) => void
}

export function GroupModals({
  isEmbedded = false,
  onMemberSuccess,
  onGroupSuccess,
}: GroupModalsProps) {
  const { selectedGroup, fetchGroups, setSelectedGroup, members } = useGroupStore()
  const {
    showAddMemberModal,
    showEditMemberModal,
    showCreateGroupModal,
    showEditGroupModal,
    editingMember,
    closeAddMember,
    closeEditMember,
    closeCreateGroup,
    closeEditGroup,
  } = useGroupModals()
  return (
    <>
      {selectedGroup && (
        <AddMember
          isOpen={showAddMemberModal}
          group={selectedGroup}
          existingMembers={members}
          onClose={closeAddMember}
          onSuccess={onMemberSuccess}
        />
      )}

      <AnimatePresence>
        {editingMember && (
          <EditMember
            isOpen={showEditMemberModal}
            member={editingMember}
            onClose={closeEditMember}
            onSuccess={onMemberSuccess}
          />
        )}
      </AnimatePresence>

      <CreateGroup
        isOpen={showCreateGroupModal}
        onClose={closeCreateGroup}
        onSuccess={(newGroup) => {
          if (!isEmbedded) {
            fetchGroups()
          }
          if (newGroup && !isEmbedded) {
            setSelectedGroup(newGroup)
          }
          onGroupSuccess(newGroup)
        }}
      />

      {selectedGroup && (
        <EditGroup
          isOpen={showEditGroupModal}
          group={selectedGroup}
          onClose={closeEditGroup}
          onSuccess={() => {
            if (!isEmbedded) {
              fetchGroups()
            }
            onGroupSuccess()
          }}
        />
      )}
    </>
  )
}
