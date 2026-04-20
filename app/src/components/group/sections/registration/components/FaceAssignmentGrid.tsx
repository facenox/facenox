import type { AttendanceMember } from "@/types/recognition"
import type { DetectedFace } from "@/components/group/sections/registration/types"
import { Dropdown } from "@/components/shared"

interface FaceAssignmentGridProps {
  detectedFaces: DetectedFace[]
  members: AttendanceMember[]
  availableMembers: AttendanceMember[]
  assignedCount: number
  isRegistering: boolean
  onAssignMember: (faceId: string, personId: string) => void
  onUnassign: (faceId: string) => void
  onBulkRegister: () => void
}

export function FaceAssignmentGrid({
  detectedFaces,
  members,
  availableMembers,
  assignedCount,
  isRegistering,
  onAssignMember,
  onUnassign,
  onBulkRegister,
}: FaceAssignmentGridProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-7 items-center rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 shadow-[0_0_15px_rgba(34,211,238,0.05)]">
          <span className="text-[10px] font-bold tracking-tight text-white/90">
            {assignedCount}
            <span className="mx-1 text-white/30">/</span>
            {detectedFaces.length}
            <span className="ml-1.5 font-medium tracking-wider text-white/40">Assigned</span>
          </span>
        </div>

        <div className="flex h-7 items-center rounded-full border border-white/10 bg-[rgba(22,28,36,0.62)] px-3">
          <span className="text-[10px] font-medium text-white/40">
            {availableMembers.length} {availableMembers.length === 1 ? "member" : "members"}{" "}
            available
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {detectedFaces.map((face) => {
          const assignedMember =
            face.assignedPersonId ?
              members.find((m) => m.person_id === face.assignedPersonId)
            : null

          return (
            <div
              key={face.faceId}
              className={`group overflow-hidden rounded-lg border transition-all ${
                face.assignedPersonId ?
                  "border-cyan-400/40 bg-linear-to-br from-cyan-500/10 to-cyan-600/5"
                : face.isAcceptable ?
                  "border-white/10 bg-[rgba(17,22,29,0.96)] hover:border-white/20"
                : "border-amber-400/30 bg-amber-500/5"
              }`}>
              <div className="relative aspect-square">
                <img
                  src={face.previewUrl}
                  alt="Detected face"
                  className="h-full w-full object-cover"
                />
                {!face.isAcceptable && (
                  <div className="absolute right-2 bottom-2 left-2 translate-z-0 transform rounded-lg bg-amber-500/90 px-2 py-1.5 text-center shadow-lg">
                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-black">
                      <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
                      Quality Issue
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2 p-3">
                {!face.assignedPersonId ?
                  <Dropdown
                    options={availableMembers.map((m) => ({
                      value: m.person_id,
                      label: m.name,
                    }))}
                    value=""
                    onChange={(val) => val && onAssignMember(face.faceId, val as string)}
                    placeholder="Select member..."
                    showPlaceholderOption={true}
                    allowClear={false}
                    buttonClassName="!py-1.5 !text-[11px] border-white/10 bg-[rgba(22,28,36,0.68)] hover:border-cyan-400/30 hover:bg-cyan-500/3"
                  />
                : <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-bold text-cyan-200">
                        {assignedMember?.name}
                      </div>
                      <div className="text-[9px] font-medium tracking-wider text-cyan-400/40">
                        Assigned
                      </div>
                    </div>
                    <button
                      onClick={() => onUnassign(face.faceId)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[rgba(22,28,36,0.62)] text-white/50 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
                      <i className="fa-solid fa-xmark text-[10px]"></i>
                    </button>
                  </div>
                }
              </div>
            </div>
          )
        })}
      </div>

      {assignedCount > 0 && (
        <button
          onClick={onBulkRegister}
          disabled={isRegistering}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-4 text-sm font-medium text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:border-white/10 disabled:bg-[rgba(22,28,36,0.62)] disabled:text-white/20">
          {isRegistering ?
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>Registering {assignedCount} faces...</span>
            </>
          : <>
              <span className="text-lg">✓</span>
              <span>
                Register {assignedCount} {assignedCount === 1 ? "Face" : "Faces"}
              </span>
            </>
          }
        </button>
      )}
    </div>
  )
}
