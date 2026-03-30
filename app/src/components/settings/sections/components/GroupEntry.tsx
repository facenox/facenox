import type {
  GroupWithMembers,
  EditingMember,
  EditingGroup,
  MemberField,
  GroupField,
} from "@/components/settings/sections/types"
import { MemberEntry } from "@/components/settings/sections/components/MemberEntry"
import { Tooltip } from "@/components/shared"
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
    <div className="group/row overflow-hidden rounded-lg border border-white/10 bg-[rgba(17,22,29,0.96)] font-sans transition-all hover:bg-[rgba(22,28,36,0.52)]">
      {/* Group Header */}
      <div
        onClick={() => onToggle(group.id)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 transition-colors">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <i
            className={`fa-solid fa-chevron-right text-[10px] text-white/40 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""} w-3 text-center group-hover/row:text-white/70`}></i>

          <div className="flex min-w-0 flex-1 items-baseline gap-3">
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
                className="h-6 rounded border border-white/10 bg-[rgba(22,28,36,0.68)] px-1.5 py-0.5 text-xs font-bold text-white transition-all duration-300 outline-none focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
              />
            : <div
                onClick={(e) => {
                  e.stopPropagation()
                  onStartEditingGroup(group, "name")
                }}
                className="flex items-center gap-2 truncate text-xs font-bold text-white transition-colors hover:text-cyan-400">
                {group.name}
                {savingGroup === group.id && (
                  <i className="fa-solid fa-spinner fa-spin text-[9px] text-cyan-400/50"></i>
                )}
              </div>
            }

            {/* Combined Metadata */}
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[9px] font-medium text-white/5">·</span>
              <div className="text-[11px] font-bold text-white/35">Group ID: {group.id}</div>
            </div>
          </div>
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="text-[11px] font-bold text-white/35">
              {memberCount} {memberCount === 1 ? "Member" : "Members"}
            </div>
            {registeredCount > 0 && (
              <div className="text-[11px] font-bold text-cyan-400/80">
                {registeredCount} Registered
              </div>
            )}
          </div>

          <Tooltip content="Delete group" position="top">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDeleteGroup(group.id)
              }}
              disabled={deletingGroup === group.id || deletingGroup === "all"}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/30 opacity-0 transition-all group-hover/row:opacity-100 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">
              <i
                className={`fa-solid ${deletingGroup === group.id ? "fa-spinner fa-spin" : "fa-trash-can"} text-[10px]`}></i>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Members List */}
      {isExpanded && (
        <div className="border-t border-white/10 bg-[rgba(22,28,36,0.44)]">
          {group.members.length === 0 ?
            <div className="px-4 py-8 text-center text-sm text-white/40">
              No members in this group
            </div>
          : <div className="space-y-1 p-2">
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
      )}
    </div>
  )
}
