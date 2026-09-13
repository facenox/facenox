import React from "react"
import type { AttendanceMember } from "@/types/recognition"
import type { EditingMember, MemberField } from "@/components/settings/sections/types"
import { Tooltip } from "@/components/shared"

interface MemberEntryProps {
  member: AttendanceMember
  editingMember: EditingMember | null
  editValue: string
  savingMember: string | null
  deletingMember: string | null
  onStartEditing: (member: AttendanceMember, field: MemberField) => void
  onEditValueChange: (value: string) => void
  onSaveEdit: (personId: string, field: MemberField, value: string) => void
  onCancelEditing: () => void
  onDeleteMember: (personId: string, name: string) => void
  isPaired?: boolean
}

export const MemberEntry = React.memo(
  function MemberEntry({
    member,
    editingMember,
    editValue,
    savingMember,
    deletingMember,
    onStartEditing,
    onEditValueChange,
    onSaveEdit,
    onCancelEditing,
    onDeleteMember,
    isPaired,
  }: MemberEntryProps) {
    const isEditing = (field: MemberField) =>
      editingMember?.personId === member.person_id && editingMember.field === field

    const handleKeyDown = (e: React.KeyboardEvent, field: MemberField) => {
      if (e.key === "Enter") {
        onSaveEdit(member.person_id, field, editValue)
      } else if (e.key === "Escape") {
        onCancelEditing()
      }
    }

    const showEmailField = isEditing("email") || Boolean(member.email)

    return (
      <div className="group/member relative flex items-center justify-between rounded-lg bg-transparent px-3 py-3.5 transition-colors hover:bg-white/[0.01]">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col text-left">
            {/* Name */}
            {isEditing("name") ?
              <input
                type="text"
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onBlur={() => onSaveEdit(member.person_id, "name", editValue)}
                onKeyDown={(e) => handleKeyDown(e, "name")}
                autoFocus
                disabled={savingMember === member.person_id}
                className="h-6 rounded-md border-0 bg-white/10 px-2 py-0.5 text-[13px] font-medium text-white transition-all outline-none focus:ring-1 focus:ring-white/20"
              />
            : <div
                onClick={() => !isPaired && onStartEditing(member, "name")}
                className={`truncate text-[13px] font-semibold transition-colors ${
                  isPaired ? "text-white/70" : "cursor-pointer text-white/90 hover:text-white"
                }`}>
                {member.name}
              </div>
            }

            {/* Metadata Block: Role and Email */}
            <div className="mt-0.5 flex min-w-0 items-center gap-2.5 text-[11px]">
              {isEditing("role") ?
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => onEditValueChange(e.target.value)}
                  onBlur={() => onSaveEdit(member.person_id, "role", editValue)}
                  onKeyDown={(e) => handleKeyDown(e, "role")}
                  autoFocus
                  disabled={savingMember === member.person_id}
                  placeholder="Role"
                  className="h-5 w-24 rounded-md border-0 bg-white/10 px-2 py-0.5 text-[11px] text-white/70 transition-all outline-none focus:ring-1 focus:ring-white/20"
                />
              : <div
                  onClick={() => !isPaired && onStartEditing(member, "role")}
                  className={`truncate transition-colors ${
                    isPaired ?
                      member.role ?
                        "text-white/55"
                      : "text-white/20 italic"
                    : member.role ? "cursor-pointer text-white/65 hover:text-white/70"
                    : "cursor-pointer text-white/20 italic hover:text-white/55"
                  }`}>
                  {member.role || "No role"}
                </div>
              }

              {showEmailField && (
                <>
                  <span className="h-2 w-[1px] shrink-0 bg-white/10 select-none" />

                  {isEditing("email") ?
                    <input
                      type="email"
                      value={editValue}
                      onChange={(e) => onEditValueChange(e.target.value)}
                      onBlur={() => onSaveEdit(member.person_id, "email", editValue)}
                      onKeyDown={(e) => handleKeyDown(e, "email")}
                      autoFocus
                      disabled={savingMember === member.person_id}
                      placeholder="Email"
                      className="h-5 w-32 rounded-md border-0 bg-white/10 px-2 py-0.5 text-[11px] text-white/70 transition-all outline-none focus:ring-1 focus:ring-white/20"
                    />
                  : <div
                      onClick={() => !isPaired && onStartEditing(member, "email")}
                      className={`truncate transition-colors ${
                        isPaired ? "text-white/55" : (
                          "cursor-pointer text-white/65 hover:text-white/80"
                        )
                      }`}>
                      {member.email}
                    </div>
                  }
                </>
              )}
            </div>
          </div>
        </div>

        <div className="ml-4 flex shrink-0 items-center justify-end gap-3">
          <div className="flex items-center gap-3">
            {member.has_face_data ?
              <div className="flex items-center gap-1.5 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-cyan-400">
                Enrolled
              </div>
            : <div className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-400">
                Not Enrolled
              </div>
            }

            {!isPaired && (
              <Tooltip content="Delete member" position="top">
                <button
                  onClick={() => onDeleteMember(member.person_id, member.name)}
                  disabled={deletingMember === member.person_id}
                  className="flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-white/55 shadow-none transition-all duration-300 outline-none hover:bg-red-500/10 hover:text-red-400 focus:outline-none disabled:opacity-50">
                  <i
                    className={`fa-solid ${deletingMember === member.person_id ? "fa-spinner fa-spin" : "fa-trash-can opacity-40 group-hover/member:opacity-75 group-hover/member:hover:opacity-100"} text-[11px] transition-all`}></i>
                </button>
              </Tooltip>
            )}
          </div>
          {savingMember === member.person_id && (
            <i className="fa-solid fa-spinner fa-spin absolute right-2 text-[10px] text-white/55"></i>
          )}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    const wasEditing = prevProps.editingMember?.personId === prevProps.member.person_id
    const isEditing = nextProps.editingMember?.personId === nextProps.member.person_id
    const wasSaving = prevProps.savingMember === prevProps.member.person_id
    const isSaving = nextProps.savingMember === nextProps.member.person_id
    const wasDeleting = prevProps.deletingMember === prevProps.member.person_id
    const isDeleting = nextProps.deletingMember === nextProps.member.person_id

    if (wasEditing !== isEditing || wasSaving !== isSaving || wasDeleting !== isDeleting) {
      return false
    }

    if (isEditing && prevProps.editValue !== nextProps.editValue) {
      return false
    }

    return prevProps.member === nextProps.member
  },
)
