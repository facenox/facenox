import { useState, useCallback } from "react"
import type {
  GroupWithMembers,
  EditingMember,
  EditingGroup,
  MemberField,
  GroupField,
} from "@/components/settings/sections/types"
import { MemberEntry } from "@/components/settings/sections/components/MemberEntry"
import { Modal } from "@/components/common/Modal"
import { EditGroup } from "@/components/group/modals"
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
  onGroupsChanged?: () => void
}

/**
 * Renders a directory group row with its list of members in a modal.
 * Connects group editing and deletion state to the settings page
 * context, and triggers state synchronization on metadata updates.
 */
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
  onGroupsChanged,
}: GroupEntryProps) {
  const memberCount = group.members.length
  const enrolledCount = group.members.filter((m) => m.has_face_data).length

  const [scrollTop, setScrollTop] = useState(0)
  const [prevExpanded, setPrevExpanded] = useState(isExpanded)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  if (isExpanded !== prevExpanded) {
    setPrevExpanded(isExpanded)
    if (!isExpanded) {
      setScrollTop(0)
    }
  }

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const ITEM_HEIGHT = 58

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 5)
  const endIndex = Math.min(
    group.members.length - 1,
    Math.floor((scrollTop + 500) / ITEM_HEIGHT) + 5,
  )

  const visibleMembers = group.members.slice(startIndex, endIndex + 1)

  const paddingTop = startIndex * ITEM_HEIGHT
  const paddingBottom = Math.max(0, (group.members.length - 1 - endIndex) * ITEM_HEIGHT)

  const handleGroupKeyDown = (e: React.KeyboardEvent, field: GroupField) => {
    if (e.key === "Enter") {
      onSaveGroupEdit(group.id, field, editValue)
    } else if (e.key === "Escape") {
      onCancelEditing()
    }
  }

  return (
    <div className="group/row flex flex-col bg-transparent transition-colors hover:bg-white/[0.01]">
      {/* Group Header */}
      <div className="flex w-full items-center justify-between px-2 py-3.5 transition-colors">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center text-white/55 transition-colors group-hover/row:text-white/65">
            <i className="fa-solid fa-layer-group text-[12px]"></i>
          </div>

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
                className="h-6 rounded-md border-0 bg-white/10 px-2 py-0.5 text-[13px] font-semibold text-white transition-all outline-none focus:ring-1 focus:ring-white/20"
              />
            : <div
                onClick={(e) => {
                  e.stopPropagation()
                  onStartEditingGroup(group, "name")
                }}
                className="flex cursor-pointer items-center gap-2 truncate text-[13px] font-semibold text-white/90 transition-colors hover:text-white">
                {group.displayName || group.name}
                {savingGroup === group.id && (
                  <i className="fa-solid fa-spinner fa-spin text-[10px] text-white/55"></i>
                )}
              </div>
            }
            <div className="mt-0.5 hidden truncate font-mono text-[11px] tracking-tight text-white/55 sm:block">
              ID: {group.id}
            </div>
          </div>
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-3">
          <span className="text-[11px] font-medium text-white/55">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
          {enrolledCount > 0 && (
            <>
              <span className="text-[11px] font-medium text-white/20">•</span>
              <span className="text-[11px] font-medium text-cyan-400/80">
                {enrolledCount} Enrolled
              </span>
            </>
          )}

          <button
            onClick={() => onToggle(group.id)}
            title="Edit Group"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent text-white/55 shadow-none transition-all duration-300 outline-none hover:bg-white/5 hover:text-white focus:outline-none active:scale-95 lg:opacity-0 lg:group-hover/row:opacity-100">
            <i className="fa-solid fa-pen text-[11px] opacity-70" />
          </button>
        </div>
      </div>

      {/* Members Modal */}
      <Modal
        isOpen={isExpanded}
        onClose={() => onToggle(group.id)}
        title={`${group.displayName || group.name} Members`}
        headerActions={
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsEditModalOpen(true)
              }}
              className="flex h-7 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] px-2.5 text-[10px] font-bold tracking-wider text-white/70 uppercase shadow-none transition-all hover:border-white/25 hover:bg-white/5 active:scale-95">
              <i className="fa-solid fa-pen text-[10px]"></i>
              <span>Edit Group</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDeleteGroup(group.id)
                onToggle(group.id)
              }}
              disabled={deletingGroup === group.id || deletingGroup === "all"}
              className="flex h-7 items-center justify-center gap-1.5 rounded-md border-0 bg-red-500/10 px-2.5 text-[10px] font-bold tracking-wider text-red-400 uppercase shadow-none transition-all hover:bg-red-500/20 active:scale-95 disabled:opacity-50">
              <i
                className={`fa-solid ${deletingGroup === group.id ? "fa-spinner fa-spin" : "fa-trash-can"} text-[10px]`}></i>
              <span>Delete Group</span>
            </button>
          </div>
        }
        maxWidth="max-w-3xl">
        <div className="p-1">
          {group.members.length === 0 ?
            <div className="px-4 py-8 text-center text-[12px] text-white/55">
              No members in this group
            </div>
          : <div
              onScroll={handleScroll}
              className="custom-scroll max-h-[60vh] divide-y divide-white/5 overflow-y-auto pr-1">
              <div
                style={{
                  paddingTop: `${paddingTop}px`,
                  paddingBottom: `${paddingBottom}px`,
                }}>
                {visibleMembers.map((member, idx) => (
                  <MemberEntry
                    key={member.person_id || `member-${idx}`}
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
            </div>
          }
        </div>
      </Modal>

      <EditGroup
        isOpen={isEditModalOpen}
        group={group}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => {
          onGroupsChanged?.()
        }}
      />
    </div>
  )
}
