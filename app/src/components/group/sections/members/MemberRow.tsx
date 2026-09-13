import React from "react"
import { Tooltip } from "@/components/shared"
import type { AttendanceMember } from "@/types/recognition"
import { EnrollmentAction } from "./EnrollmentAction"

interface MemberRowProps {
  member: AttendanceMember & { displayName: string }
  isSelected?: boolean
  isSelectionMode?: boolean
  onToggleSelect?: (personId: string) => void
  onEdit?: (member: AttendanceMember) => void
  onDelete?: (member: AttendanceMember) => void
  onResetFace: (member: AttendanceMember) => void
  isConsentCertified?: boolean
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
    isConsentCertified,
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
              {!member.has_consent && !isConsentCertified && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-amber-500/80 uppercase">
                  No Consent
                </span>
              )}
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

        <div className="flex shrink-0 items-center gap-3">
          {!isSelectionMode && (
            <>
              {/* Row Actions (Ultra-Subtle) */}
              <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {onEdit && (
                  <Tooltip content="Edit details">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(member)
                      }}
                      className="border-transparent bg-transparent p-1.5 text-white/20 transition-colors hover:bg-transparent hover:text-white">
                      <i className="fa-solid fa-pen text-[12px]"></i>
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
                      className="border-transparent bg-transparent p-1.5 text-white/20 transition-colors hover:bg-transparent hover:text-amber-500">
                      <i className="fa-solid fa-user-slash text-[12px]"></i>
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
                      className="border-transparent bg-transparent p-1.5 text-white/20 transition-colors hover:bg-transparent hover:text-red-400">
                      <i className="fa-solid fa-trash-can text-[12px]"></i>
                    </button>
                  </Tooltip>
                )}
              </div>

              <div onClick={(e) => e.stopPropagation()}>
                <EnrollmentAction memberId={member.person_id} isEnrolled={isEnrolled} />
              </div>
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
      prevProps.isSelectionMode === nextProps.isSelectionMode &&
      prevProps.isConsentCertified === nextProps.isConsentCertified
    )
  },
)
