import React from "react"
import { Pencil, Trash2, UserX } from "lucide-react"
import { Tooltip } from "@/components/shared"
import type { AttendanceMember } from "@/types/recognition"
import { EnrollmentAction } from "./EnrollmentAction"

interface MemberRowProps {
  member: AttendanceMember & { displayName: string }
  isSelected?: boolean
  isSelectionMode?: boolean
  onToggleSelect?: (personId: string) => void
  onEdit?: (member: AttendanceMember & { displayName?: string }) => void
  onDelete?: (member: AttendanceMember & { displayName?: string }) => void
  onResetFace: (member: AttendanceMember & { displayName?: string }) => void
}

export const MemberRow = React.memo(
  function MemberRow({
    member,
    isSelected,
    isSelectionMode,
    onToggleSelect,
    onEdit,
    onDelete,
    onResetFace,
  }: MemberRowProps) {
    const isEnrolled = !!member.has_face_data

    return (
      <div
        onClick={() => onToggleSelect?.(member.person_id)}
        className={`group flex w-full items-center justify-between gap-4 border-b border-l-2 px-6 py-2.5 transition-all duration-200 ${
          onToggleSelect ? "cursor-pointer" : ""
        } ${
          isSelected ?
            "border-b-cyan-500/20 border-l-cyan-400 bg-cyan-500/10 hover:border-b-cyan-500/35 hover:bg-cyan-500/[0.16]"
          : "border-b-white/[0.03] border-l-transparent hover:bg-white/[0.02]"
        }`}>
        <div className="flex min-w-0 flex-1 items-center">
          <div className="min-w-0 flex-1">
            <div
              className={`mb-0.5 flex min-w-0 items-center gap-2 text-sm font-semibold transition-colors duration-200 ${
                isEnrolled ? "text-cyan-400" : "text-white"
              }`}>
              {isEnrolled ?
                <Tooltip content="Enrolled" position="top">
                  <span className="block truncate">{member.displayName}</span>
                </Tooltip>
              : <span className="block truncate">{member.displayName}</span>}
            </div>

            <div className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-white/55">
              <span className="truncate">{member.role || "Member"}</span>
              {member.email && (
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-0.5 w-0.5 shrink-0 rounded-[0.5px] bg-white/20" />
                  <span className="truncate">{member.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isSelectionMode && (
            <>
              {/* Row Actions */}
              <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
                {onEdit && (
                  <Tooltip content="Edit details">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(member)
                      }}
                      aria-label="Edit member"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent text-white/45 transition-all duration-150 hover:bg-white/10 hover:text-white focus:outline-none active:scale-95">
                      <Pencil className="size-3.5" />
                    </button>
                  </Tooltip>
                )}

                {isEnrolled && (
                  <Tooltip content="Remove enrollment">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onResetFace(member)
                      }}
                      aria-label="Remove enrollment"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent text-white/45 transition-all duration-150 hover:bg-amber-500/10 hover:!text-amber-400 focus:outline-none active:scale-95">
                      <UserX className="size-3.5" />
                    </button>
                  </Tooltip>
                )}

                {onDelete && (
                  <Tooltip content="Remove member">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(member)
                      }}
                      aria-label="Remove member"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent text-white/45 transition-all duration-150 hover:bg-red-500/10 hover:!text-red-400 focus:outline-none active:scale-95">
                      <Trash2 className="size-3.5" />
                    </button>
                  </Tooltip>
                )}

                {isEnrolled && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <EnrollmentAction memberId={member.person_id} isEnrolled={isEnrolled} />
                  </div>
                )}
              </div>

              {!isEnrolled && (
                <div onClick={(e) => e.stopPropagation()}>
                  <EnrollmentAction memberId={member.person_id} isEnrolled={isEnrolled} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.member === nextProps.member &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isSelectionMode === nextProps.isSelectionMode
    )
  },
)
