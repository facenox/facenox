import { Tooltip } from "./Tooltip"
import type { AttendanceMember } from "@/types/recognition"

interface MemberTooltipProps {
  member?: AttendanceMember | null
  displayName?: string
  children: React.ReactElement
  position?: "top" | "bottom" | "left" | "right"
  role?: string
  showEnrollment?: boolean
}

export function MemberTooltip({
  member,
  displayName,
  children,
  position = "right",
  role,
  showEnrollment = true,
}: MemberTooltipProps) {
  const isEnrolled = member?.has_face_data ?? false
  const name = displayName || member?.name
  const memberRole = role || member?.role || "Member"

  const content = (
    <div className="flex flex-col items-center gap-0.5 text-center">
      {name && (
        <span className="max-w-[200px] text-[11px] leading-tight font-semibold [overflow-wrap:anywhere] break-words text-white">
          {name}
        </span>
      )}
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="font-medium text-white/70">{memberRole}</span>
        {showEnrollment && (
          <span className={`font-semibold ${isEnrolled ? "text-cyan-400" : "text-white/45"}`}>
            {isEnrolled ? "Enrolled" : "Not Enrolled"}
          </span>
        )}
      </div>

      {member?.email && (
        <span className="max-w-[180px] truncate text-[9px] text-white/45">{member.email}</span>
      )}
    </div>
  )

  return (
    <Tooltip content={content} position={position} delay={300}>
      {children}
    </Tooltip>
  )
}
