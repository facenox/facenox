import type {
  GroupWithMembers,
  EditingMember,
  EditingGroup,
  MemberField,
  GroupField,
} from "@/components/settings/sections/types"
import { MemberEntry } from "@/components/settings/sections/components/MemberEntry"
import { Tooltip } from "@/components/shared"
import { Modal } from "@/components/common/Modal"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"

interface GroupEntryProps {
  group: GroupWithMembers
  isExpanded: boolean
  editingGroup: EditingGroup | null
  editingMember: EditingMember | null
  editValue: string
  savingGroup: string | null
  savingMember: string | null
  deletingGroup: string | null
  deletingMember: string | null
  onToggle: (groupId: string) => void
  onStartEditingGroup: (group: AttendanceGroup, field: GroupField) => void
  onStartEditingMember: (member: AttendanceMember, field: MemberField) => void
  onEditValueChange: (value: string) => void
  onSaveGroupEdit: (groupId: string, field: GroupField, value: string) => void
  onSaveMemberEdit: (personId: string, field: MemberField, value: string) => void
  onCancelEditing: () => void
  onDeleteGroup: (groupId: string) => void
  onDeleteMember: (personId: string, name: string) => void
}

export function GroupEntry({
  group,
  isExpanded,
  editingGroup,
  editingMember,
  editValue,
  savingGroup,
  savingMember,
  deletingGroup,
  deletingMember,
  onToggle,
  onStartEditingGroup,
  onStartEditingMember,
  onEditValueChange,
  onSaveGroupEdit,
  onSaveMemberEdit,
  onCancelEditing,
  onDeleteGroup,
  onDeleteMember,
}: GroupEntryProps) {
  const memberCount = group.members.length
  const registeredCount = group.members.filter((m) => m.has_face_data).length

  const handleGroupKeyDown = (e: React.KeyboardEvent, field: GroupField) => {
    if (e.key === "Enter") {
      onSaveGroupEdit(group.id, field, editValue)
    } else if (e.key === "Escape") {
      onCancelEditing()
    }
  }

  return (
    <div
      className={`group/row flex flex-col rounded-lg border transition-colors ${isExpanded ? "border-white/10 bg-white/[0.02]" : "border-transparent bg-transparent hover:bg-white/[0.02]"}`}>
      {/* Group Header */}
      <div className="flex w-full items-center justify-between p-4 transition-colors">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <button
            onClick={() => onToggle(group.id)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white ${isExpanded ? "bg-white/10 text-white" : ""}`}>
            <i className={`fa-solid fa-users text-[11px]`}></i>
          </button>

          <div className="flex min-w-0 flex-col">
            {/* Group Name */}
            {editingGroup?.groupId === group.id && editingGroup.field === "name" ?
              <input
                type="text"
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onBlur={() => onSaveGroupEdit(group.id, "name", editValue)}
                onKeyDown={(e) => handleGroupKeyDown(e, "name")}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                disabled={savingGroup === group.id}
                className="h-6 rounded-md border-0 bg-white/10 px-2 py-0.5 text-[14px] font-medium text-white transition-all outline-none focus:ring-1 focus:ring-white/20"
              />
            : <div
                onClick={(e) => {
                  e.stopPropagation()
                  onStartEditingGroup(group, "name")
                }}
                className="flex items-center gap-2 truncate text-[14px] font-medium text-white transition-colors hover:text-white/70">
                {group.name}
                {savingGroup === group.id && (
                  <i className="fa-solid fa-spinner fa-spin text-[10px] text-white/40"></i>
                )}
              </div>
            }
            <div className="mt-0.5 hidden truncate font-mono text-[11px] text-white/30 sm:block">
              Group ID: {group.id}
            </div>
          </div>
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-medium text-white/50">
              {memberCount} {memberCount === 1 ? "Member" : "Members"}
            </span>
            {registeredCount > 0 && (
              <span className="rounded-md bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-400">
                {registeredCount} Registered
              </span>
            )}

            <button
              onClick={() => onToggle(group.id)}
              className="ml-2 rounded-md bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/15">
              Manage
            </button>
          </div>

          <Tooltip content="Delete group" position="top">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDeleteGroup(group.id)
              }}
              disabled={deletingGroup === group.id || deletingGroup === "all"}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/20 transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">
              <i
                className={`fa-solid ${deletingGroup === group.id ? "fa-spinner fa-spin" : "fa-trash-can opacity-0 group-hover/row:opacity-100"} text-[13px]`}></i>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Members Modal */}
      <Modal
        isOpen={isExpanded}
        onClose={() => onToggle(group.id)}
        title={`${group.name} Members`}
        maxWidth="max-w-3xl">
        <div className="p-1">
          {group.members.length === 0 ?
            <div className="px-4 py-8 text-center text-[13px] text-white/30">
              No members in this group
            </div>
          : <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
              {group.members.map((member) => (
                <MemberEntry
                  key={member.person_id}
                  member={member}
                  editingMember={editingMember}
                  editValue={editValue}
                  savingMember={savingMember}
                  deletingMember={deletingMember}
                  onStartEditing={onStartEditingMember}
                  onEditValueChange={onEditValueChange}
                  onSaveEdit={onSaveMemberEdit}
                  onCancelEditing={onCancelEditing}
                  onDeleteMember={onDeleteMember}
                />
              ))}
            </div>
          }
        </div>
      </Modal>
    </div>
  )
}
