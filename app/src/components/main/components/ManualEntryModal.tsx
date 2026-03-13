import { useState, useMemo, useEffect } from "react"
import { attendanceManager } from "@/services/AttendanceManager"
import { Modal } from "@/components/common"
import { Tooltip } from "@/components/shared"
import { useAttendanceStore } from "@/components/main/stores"
import type { AttendanceMember, AttendanceGroup } from "@/components/main/types"

interface ManualEntryModalProps {
  onClose: () => void
  onSuccess: () => void
  members: AttendanceMember[]
  presentPersonIds: Set<string>
  onAddMember: () => void
  currentGroup?: AttendanceGroup | null
}

export const ManualEntryModal = ({
  onClose,
  onSuccess,
  members,
  presentPersonIds,
  onAddMember,
  currentGroup,
}: ManualEntryModalProps) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [faceDataMap, setFaceDataMap] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    if (!currentGroup?.id) return
    attendanceManager
      .getGroupPersons(currentGroup.id)
      .then((persons: AttendanceMember[]) => {
        const map = new Map<string, boolean>()
        persons.forEach((p) => map.set(p.person_id, p.has_face_data ?? false))
        setFaceDataMap(map)
      })
      .catch(() => {})
  }, [currentGroup?.id])

  const sortedAllMembers = useMemo(() => {
    return members
      .filter((m) => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [members, searchQuery])

  const noFaceCount = useMemo(() => {
    return sortedAllMembers.filter((m) => faceDataMap.size > 0 && !faceDataMap.get(m.person_id))
      .length
  }, [sortedAllMembers, faceDataMap])

  const handleManualEntry = async (personId: string) => {
    if (isSubmitting) return

    setIsSubmitting(true)
    setSubmittingId(personId)
    setError(null)

    try {
      const record = await attendanceManager.addRecord({
        person_id: personId,
        timestamp: new Date(),
        is_manual: true,
        notes: "Manual entry by admin",
      })

      const store = useAttendanceStore.getState()
      store.setRecentAttendance([record, ...store.recentAttendance])

      onSuccess()
      onClose()
    } catch (err) {
      setError("Failed to add record. Please try again.")
      console.error(err)
    } finally {
      setIsSubmitting(false)
      setSubmittingId(null)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={
        <div className="-mt-0.5 flex flex-col">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-users text-sm text-cyan-400"></i>
            <span className="text-xl font-bold tracking-tight">Members</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="rounded-full border border-white/5 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/45">
              {members.length} Total
            </div>
            <div className="rounded-full border border-cyan-500/10 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-400">
              {presentPersonIds.size} Present
            </div>
            {noFaceCount > 0 && (
              <div className="rounded-full border border-amber-500/10 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-500/80">
                {noFaceCount} Unregistered
              </div>
            )}
          </div>
        </div>
      }
      maxWidth="sm">
      <div className="space-y-4">
        {/* Search & Add Header */}
        <div className="mt-2 flex items-center">
          <div className="group/search relative flex-1">
            <i className="fa-solid fa-magnifying-glass absolute top-1/2 left-3.5 -translate-y-1/2 text-[11px] text-white/35 transition-colors group-focus-within/search:text-cyan-400"></i>
            <input
              type="text"
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-l-lg rounded-r-none border border-r-0 border-white/10 bg-white/5 pr-4 pl-9 text-[11px] font-medium text-white transition-all duration-300 outline-none placeholder:text-white/25 focus:border-white/20 focus:bg-white/10"
            />
          </div>
          <Tooltip content="Add member" position="top">
            <button
              onClick={() => {
                onClose()
                onAddMember()
              }}
              className="group/add flex h-9 w-9 shrink-0 items-center justify-center rounded-l-none rounded-r-lg border border-white/10 bg-white/5 text-white/50 transition-all hover:bg-white/10 hover:text-white focus:outline-none">
              <i className="fa-solid fa-plus text-xs transition-transform group-hover/add:scale-110"></i>
            </button>
          </Tooltip>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[11px] font-bold text-red-300">
            <i className="fa-solid fa-circle-exclamation text-[10px]"></i>
            {error}
          </div>
        )}

        {sortedAllMembers.length > 0 ?
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#080808]">
            <div className="custom-scroll max-h-48 overflow-y-auto">
              {sortedAllMembers.map((member) => {
                const isPresent = presentPersonIds.has(member.person_id)
                const isEntrySubmitting = submittingId === member.person_id
                const hasFace =
                  faceDataMap.size === 0 ? null : (faceDataMap.get(member.person_id) ?? false)

                return (
                  <div
                    key={member.person_id}
                    onClick={() => !isPresent && handleManualEntry(member.person_id)}
                    className={`group/item flex items-center gap-3 border-b border-white/5 px-4 py-2.5 transition-all last:border-0 ${
                      isPresent ?
                        "cursor-default bg-white/2 opacity-50 grayscale-[0.3]"
                      : "cursor-pointer hover:bg-white/5 active:scale-[0.99]"
                    }`}>
                    <span className="flex-1 truncate text-[12px] font-bold text-white/70 transition-colors group-hover/item:text-white">
                      {member.name}
                    </span>

                    <div className="flex shrink-0 items-center gap-2">
                      {isPresent ?
                        <div className="flex items-center gap-1.5 px-2 py-1">
                          <i className="fa-solid fa-check text-[10px] text-cyan-400"></i>
                          <span className="text-[11px] font-bold text-cyan-400">Present</span>
                        </div>
                      : isEntrySubmitting ?
                        <div className="flex w-24 justify-center">
                          <i className="fa-solid fa-spinner fa-spin text-[10px] text-cyan-400"></i>
                        </div>
                      : <div className="flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-cyan-400 opacity-0 transition-all group-hover/item:opacity-100 hover:bg-cyan-500/20 active:scale-95">
                          <i className="fa-solid fa-plus text-[8px]"></i>
                          Mark Present
                        </div>
                      }
                      {!isPresent && hasFace === false && (
                        <div
                          className={`px-2 py-1 text-[11px] font-bold text-amber-500/40 ${isEntrySubmitting || searchQuery ? "hidden" : "group-hover/item:opacity-0"} tracking-tight transition-opacity`}>
                          Not Registered
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        : <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/2 py-12">
            <i className="fa-solid fa-user-slash mb-3 text-xl text-white/10"></i>
            <p className="text-[11px] font-bold tracking-wider text-white/30">No results found</p>
          </div>
        }

        {noFaceCount > 0 && (
          <div className="rounded-xl border border-white/10 bg-[#080808] px-4 py-3 shadow-inner">
            <p className="flex items-start gap-3 text-[11px] leading-relaxed font-bold text-white/35">
              <i className="fa-solid fa-circle-info mt-1 shrink-0 text-[12px] text-amber-500/60"></i>
              <span className="tracking-tight">
                Members marked <span className="text-amber-500/80">&quot;No face data&quot;</span>{" "}
                weren&apos;t registered yet or were imported from another device. They must be
                enrolled on this device to be recognized by the camera.
              </span>
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
