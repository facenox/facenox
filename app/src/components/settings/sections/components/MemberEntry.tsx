import type { AttendanceMember } from "@/types/recognition"
import type { EditingMember, MemberField } from "@/components/settings/sections/types"

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

  return (
    <div className="group/member relative rounded-lg border border-transparent bg-[rgba(17,22,29,0.84)] px-3 py-1.5 transition-all hover:border-white/10 hover:bg-[rgba(22,28,36,0.52)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Name */}
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
                className="h-5 rounded border border-white/10 bg-[rgba(22,28,36,0.68)] px-1.5 py-0.5 text-[11px] font-bold text-white transition-all duration-300 outline-none focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
              />
            : <div
                onClick={() => onStartEditing(member, "name")}
                className="cursor-pointer truncate text-[11px] font-bold text-white/90 transition-colors hover:text-cyan-400">
                {member.name}
              </div>
            }
          </div>

          <span className="shrink-0 text-[9px] font-medium text-white/5 select-none">/</span>

          {/* Role & Email - Combined */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
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
                className="h-5 max-w-[100px] rounded border border-white/10 bg-[rgba(22,28,36,0.68)] px-1.5 py-0.5 text-[10px] text-white/70 transition-all duration-300 outline-none focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
              />
            : <div
                onClick={() => onStartEditing(member, "role")}
                className={`cursor-pointer truncate text-[11px] font-bold transition-colors ${
                  member.role ?
                    "text-white/45 hover:text-white/80"
                  : "text-white/20 italic hover:text-white/40"
                }`}>
                {member.role || "No role"}
              </div>
            }

            <span className="shrink-0 text-[9px] font-black text-white/10 select-none">·</span>

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
                className="h-5 max-w-[150px] rounded border border-white/10 bg-[rgba(22,28,36,0.68)] px-1.5 py-0.5 text-[10px] text-white/70 transition-all duration-300 outline-none focus:border-cyan-500/32 focus:ring-1 focus:ring-cyan-500/5"
              />
            : <div
                onClick={() => onStartEditing(member, "email")}
                className={`cursor-pointer truncate text-[11px] font-bold transition-colors ${
                  member.email ?
                    "text-white/40 hover:text-white/70"
                  : "text-white/20 italic hover:text-white/40"
                }`}>
                {member.email || "No email"}
              </div>
            }
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2">
            {member.has_face_data ?
              <div className="text-[11px] font-bold text-cyan-400/80">Face</div>
            : <div className="text-[11px] font-bold text-amber-500/50">Empty</div>}

            <button
              onClick={() => onDeleteMember(member.person_id, member.name)}
              disabled={deletingMember === member.person_id}
              className="flex h-5 w-5 items-center justify-center rounded-lg text-white/20 opacity-0 transition-all group-hover/member:opacity-100 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
              title="Delete member">
              <i
                className={`fa-solid ${deletingMember === member.person_id ? "fa-spinner fa-spin" : "fa-trash-can"} text-[9px]`}></i>
            </button>
          </div>
          {savingMember === member.person_id && (
            <i className="fa-solid fa-spinner fa-spin text-[9px] text-cyan-400/60"></i>
          )}
        </div>
      </div>
    </div>
  )
}
