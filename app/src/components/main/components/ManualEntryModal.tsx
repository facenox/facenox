import { useState, useMemo, useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { attendanceManager } from "@/services/AttendanceManager"
import { ErrorMessage, Modal } from "@/components/common"
import { Tooltip, InfoPopover } from "@/components/shared"
import { useAttendanceStore } from "@/components/main/stores"
import type { AttendanceMember, AttendanceGroup } from "@/components/main/types"

interface ManualEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void | Promise<void>
  members: AttendanceMember[]
  presentPersonIds: Set<string>
  onAddMember?: () => void
  currentGroup?: AttendanceGroup | null
}

export const ManualEntryModal = ({
  isOpen,
  onClose,
  onSuccess,
  members,
  presentPersonIds,
  onAddMember,
  currentGroup,
}: ManualEntryModalProps) => {
  const [confirmingMember, setConfirmingMember] = useState<AttendanceMember | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [manualNote, setManualNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [faceDataMap, setFaceDataMap] = useState<Map<string, boolean>>(new Map())
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    setScrollTop(0)
  }, [searchQuery])

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

  const ITEM_HEIGHT = 38

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 5)
  const endIndex = Math.min(
    sortedAllMembers.length - 1,
    Math.floor((scrollTop + 208) / ITEM_HEIGHT) + 5,
  )

  const visibleMembers = sortedAllMembers.slice(startIndex, endIndex + 1)

  const paddingTop = startIndex * ITEM_HEIGHT
  const paddingBottom = Math.max(0, (sortedAllMembers.length - 1 - endIndex) * ITEM_HEIGHT)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  const handleClose = () => {
    setSearchQuery("")
    setManualNote("")
    setConfirmingMember(null)
    setError(null)
    setIsSubmitting(false)
    setSubmittingId(null)
    onClose()
  }

  const handleManualEntry = (member: AttendanceMember) => {
    setManualNote("")
    setError(null)
    setConfirmingMember(member)
  }

  const submitManualEntry = async () => {
    if (!confirmingMember || isSubmitting) return

    setIsSubmitting(true)
    setSubmittingId(confirmingMember.person_id)
    setError(null)

    try {
      const record = await attendanceManager.addRecord({
        person_id: confirmingMember.person_id,
        timestamp: new Date(),
        is_manual: true,
        notes: manualNote.trim() || "Manual entry by admin",
        created_by: "desktop_admin",
      })

      const store = useAttendanceStore.getState()
      store.setRecentAttendance([record, ...store.recentAttendance])

      await Promise.resolve(onSuccess())
      handleClose()
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
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div>
          <h3 className="text-xl font-semibold tracking-tight">
            {confirmingMember ? "Confirm Manual Attendance" : "Members"}
          </h3>
        </div>
      }
      icon={
        confirmingMember ?
          <i className="fa-solid fa-triangle-exclamation text-orange-300" />
        : undefined
      }
      maxWidth="sm">
      <div className="space-y-4">
        {confirmingMember ?
          <div className="space-y-4 py-1">
            <p className="text-xs leading-relaxed text-white/80">
              Mark <strong className="font-semibold text-white">{confirmingMember.name}</strong> as
              present manually
              {currentGroup?.name ?
                <>
                  {" "}
                  for <strong className="font-semibold text-white">{currentGroup.name}</strong>
                </>
              : ""}
              ?
            </p>

            <div className="group/note relative">
              <i className="fa-regular fa-clipboard absolute top-1/2 left-3.5 -translate-y-1/2 text-[11px] text-white/25 transition-colors group-focus-within/note:text-white/45"></i>
              <input
                type="text"
                placeholder="Add a reason / note for manual entry (Optional)..."
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/5 bg-white/5 pr-4 pl-9 text-[11px] font-bold tracking-wider text-white transition-all duration-300 outline-none placeholder:text-white/30 focus:border-white/30 focus:bg-white/[0.08] focus:outline-none"
                autoFocus
              />
            </div>

            {error && <ErrorMessage message={error} />}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none active:scale-[0.97]"
                onClick={() => setConfirmingMember(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                className="rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={submitManualEntry}>
                {isSubmitting ? "Marking Present..." : "Mark Present"}
              </button>
            </div>
          </div>
        : <>
            {/* Search & Add Header */}
            <div className="group/bar mt-2 flex items-center">
              <div className="relative flex-1">
                <svg
                  className="absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-white/25 transition-colors group-focus-within/bar:text-white/45"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`h-9 w-full ${onAddMember ? "rounded-r-none border-r-0" : "rounded-r-lg"} rounded-l-lg border border-white/5 bg-white/5 py-2 pr-4 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.08] focus-visible:outline-none`}
                />
              </div>
              {onAddMember && (
                <Tooltip content="Add member" position="top">
                  <button
                    onClick={() => {
                      handleClose()
                      onAddMember()
                    }}
                    className="group/add flex h-9 w-9 shrink-0 items-center justify-center rounded-l-none rounded-r-lg border border-l-0 border-white/5 bg-white/5 text-white/65 transition-all group-focus-within/bar:border-white/20 hover:border-white/10 hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none">
                    <i className="fa-solid fa-plus text-xs transition-transform group-hover/add:scale-110"></i>
                  </button>
                </Tooltip>
              )}
            </div>

            {/* Minimalist Members Section Stats Ratio */}
            <div className="flex items-center gap-3 px-1 text-[11px] font-medium text-white/40">
              <span className="text-white/40">
                <strong className="font-semibold text-cyan-400">{presentPersonIds.size}</strong>
                <span className="mx-1 text-white/25">/</span>
                <strong className="font-semibold text-white/70">{members.length}</strong>
                <span className="ml-1 text-white/55">Present</span>
              </span>
              {noFaceCount > 0 && (
                <>
                  <span className="text-white/10 select-none">•</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white/55">
                      <strong className="font-semibold text-white/70">{noFaceCount}</strong> Not
                      Enrolled
                    </span>
                    <InfoPopover
                      title="Not Enrolled"
                      description="Members marked 'Not Enrolled' do not have registered face templates (e.g., they were newly created or imported without biometric data). They must complete face enrollment to be recognized by the camera."
                      side="top"
                    />
                  </div>
                </>
              )}
            </div>

            {error && <ErrorMessage message={error} />}

            <AnimatePresence mode="wait">
              {sortedAllMembers.length > 0 ?
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
                  <div
                    onScroll={handleScroll}
                    className="custom-scroll max-h-52 overflow-x-hidden overflow-y-auto pr-1">
                    <div
                      className="flex w-full flex-col gap-1"
                      style={{
                        paddingTop: `${paddingTop}px`,
                        paddingBottom: `${paddingBottom}px`,
                      }}>
                      {visibleMembers.map((member, idx) => {
                        const isPresent = presentPersonIds.has(member.person_id)
                        const isEntrySubmitting = submittingId === member.person_id
                        const hasFace =
                          faceDataMap.size === 0 ?
                            null
                          : (faceDataMap.get(member.person_id) ?? false)

                        return (
                          <div
                            key={member.person_id || `member-${idx}`}
                            tabIndex={isPresent ? -1 : 0}
                            onClick={() => !isPresent && handleManualEntry(member)}
                            onKeyDown={(e) => {
                              if (!isPresent && (e.key === "Enter" || e.key === " ")) {
                                e.preventDefault()
                                handleManualEntry(member)
                              }
                            }}
                            className={`group/item flex items-center justify-between rounded-lg px-3.5 py-2.5 transition-colors focus-visible:bg-white/5 focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:outline-none ${
                              isPresent ?
                                "cursor-default bg-transparent"
                              : "cursor-pointer hover:bg-white/5 active:scale-[0.995]"
                            }`}>
                            <span className="flex-1 truncate text-[12px] font-bold text-white/70 transition-colors group-hover/item:text-white">
                              {member.name}
                            </span>

                            <div className="flex min-w-[96px] shrink-0 items-center justify-end">
                              {isPresent ?
                                <div className="flex items-center px-2 py-1">
                                  <span className="text-[11px] font-bold text-cyan-400">
                                    Present
                                  </span>
                                </div>
                              : isEntrySubmitting ?
                                <div className="flex w-24 justify-end pr-2">
                                  <i className="fa-solid fa-spinner fa-spin text-[10px] text-cyan-400"></i>
                                </div>
                              : <>
                                  <div className="hidden items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-cyan-400 transition-all group-hover/item:flex hover:bg-cyan-500/20 active:scale-95">
                                    <i className="fa-solid fa-plus text-[8px]"></i>
                                    Mark Present
                                  </div>
                                  {!isPresent && hasFace === false && (
                                    <div className="block px-2 py-1 text-[11px] font-bold tracking-tight text-white/30 transition-opacity group-hover/item:hidden">
                                      Not Enrolled
                                    </div>
                                  )}
                                </>
                              }
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </motion.div>
              : <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[rgba(22,28,36,0.44)] py-12">
                  <i className="fa-solid fa-user-slash mb-3 text-xl text-white/10"></i>
                  <p className="text-[11px] font-bold tracking-wider text-white/55">
                    No results found
                  </p>
                </motion.div>
              }
            </AnimatePresence>
          </>
        }
      </div>
    </Modal>
  )
}
