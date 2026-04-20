import { motion } from "framer-motion"
import { Tooltip } from "@/components/shared"
import type { AttendanceMember } from "@/types/recognition"
import { RegistrationAction } from "./RegistrationAction"

interface MemberRowProps {
  member: AttendanceMember & { displayName: string }
  onEdit: (member: AttendanceMember) => void
  onDelete: (member: AttendanceMember) => void
  onResetFace: (member: AttendanceMember) => void
}

export function MemberRow({ member, onEdit, onDelete, onResetFace }: MemberRowProps) {
  const isRegistered = !!member.has_face_data

  return (
    <motion.div
      layout
      className="group flex w-full items-center justify-between gap-4 border-b border-white/[0.03] px-1 py-2.5 transition-colors hover:bg-white/[0.01]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2 text-[13px] font-bold tracking-tight text-white/90">
            {member.displayName}
            {!member.has_consent && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-amber-500/80 uppercase">
                No Consent
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="text-[10px] font-medium text-white/30">
              {member.role || (
                <span className="tracking-normal lowercase italic opacity-50">Member</span>
              )}
            </div>
            {member.email && (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/20">
                <span className="h-0.5 w-0.5 rounded-full bg-white/10" />
                {member.email}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* Row Actions (Ultra-Subtle) */}
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <Tooltip content="Edit details">
            <button
              onClick={() => onEdit(member)}
              className="flex h-7 w-7 items-center justify-center rounded text-white/20 transition-all hover:bg-white/5 hover:text-white">
              <i className="fa-solid fa-pen-to-square text-[10px]"></i>
            </button>
          </Tooltip>

          {isRegistered && (
            <Tooltip content="Clear face data">
              <button
                onClick={() => onResetFace(member)}
                className="flex h-7 w-7 items-center justify-center rounded text-white/20 transition-all hover:bg-amber-500/10 hover:text-amber-500">
                <i className="fa-solid fa-user-slash text-[10px]"></i>
              </button>
            </Tooltip>
          )}

          <Tooltip content="Remove member">
            <button
              onClick={() => onDelete(member)}
              className="flex h-7 w-7 items-center justify-center rounded text-white/20 transition-all hover:bg-red-500/10 hover:text-red-400">
              <i className="fa-solid fa-trash-can text-[10px]"></i>
            </button>
          </Tooltip>
        </div>

        <RegistrationAction memberId={member.person_id} isRegistered={isRegistered} />
      </div>
    </motion.div>
  )
}
