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
}

export function MemberEntry({
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
    <div className="group/member relative flex items-center justify-between rounded-md border border-white/[0.01] bg-white/[0.015] p-3 transition-colors hover:border-white/5 hover:bg-white/[0.03]">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="shrink-0 font-sans">
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
                onClick={() => onStartEditing(member, "name")}
                className="cursor-pointer truncate text-[13px] font-medium text-white/90 transition-colors hover:text-white">
                {member.name}
              </div>
            }
          </div>

          <span className="shrink-0 text-[10px] font-medium text-white/10 select-none">/</span>

          <div className="flex min-w-0 flex-1 items-center gap-3">
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
                className="h-6 w-24 rounded-md border-0 bg-white/10 px-2 py-0.5 text-[12px] text-white/70 transition-all outline-none focus:ring-1 focus:ring-white/20"
              />
            : <div
                onClick={() => onStartEditing(member, "role")}
                className={`cursor-pointer truncate text-[12px] font-medium transition-colors ${
                  member.role ?
                    "text-white/40 hover:text-white/70"
                  : "text-white/10 italic hover:text-white/30"
                }`}>
                {member.role || "No role"}
              </div>
            }

            {showEmailField && (
              <>
                <span className="shrink-0 text-[10px] font-bold text-white/10 select-none">/</span>

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
                    className="h-6 w-32 rounded-md border-0 bg-white/10 px-2 py-0.5 text-[12px] text-white/70 transition-all outline-none focus:ring-1 focus:ring-white/20"
                  />
                : <div
                    onClick={() => onStartEditing(member, "email")}
                    className="cursor-pointer truncate text-[12px] font-medium text-white/30 transition-colors hover:text-white/50">
                    {member.email}
                  </div>
                }
              </>
            )}
          </div>
        </div>
      </div>

      <div className="ml-4 flex min-w-[120px] shrink-0 items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          {member.has_face_data ?
            <div className="rounded-md bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-400">
              Registered
            </div>
          : <div className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-500">
              Not Registered
            </div>
          }

          <Tooltip content="Delete member" position="top">
            <button
              onClick={() => onDeleteMember(member.person_id, member.name)}
              disabled={deletingMember === member.person_id}
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/20 transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">
              <i
                className={`fa-solid ${deletingMember === member.person_id ? "fa-spinner fa-spin" : "fa-trash-can opacity-0 group-hover/member:opacity-100"} text-[13px]`}></i>
            </button>
          </Tooltip>
        </div>
        {savingMember === member.person_id && (
          <i className="fa-solid fa-spinner fa-spin absolute right-2 text-[10px] text-white/40"></i>
        )}
      </div>
    </div>
  )
}
