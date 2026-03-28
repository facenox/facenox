import type { AttendanceGroup } from "@/types/recognition"

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
      {showAddMemberModal && selectedGroup && (
        <AddMember
          group={selectedGroup}
          existingMembers={members}
          onClose={closeAddMember}
          onSuccess={onMemberSuccess}
        />
      )}

      {showEditMemberModal && editingMember && (
        <EditMember member={editingMember} onClose={closeEditMember} onSuccess={onMemberSuccess} />
      )}

      {showCreateGroupModal && (
        <CreateGroup
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
      )}

      {showEditGroupModal && selectedGroup && (
        <EditGroup
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
