import { useState, useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { attendanceManager } from "@/services"
import { useGroupUIStore } from "@/components/group/stores"
import { generateDisplayNames } from "@/utils"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { EmptyState } from "@/components/group/shared/EmptyState"
import { Dropdown, Tooltip } from "@/components/shared"
import { DeleteMemberModal } from "./DeleteMemberModal"
import { BulkConsentModal } from "./BulkConsentModal"
import { FaceCapture } from "./registration/FaceCapture"
import { CameraQueue } from "./registration/CameraQueue"
import { BulkRegistration } from "./registration/BulkRegistration"

interface MembersProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  onMembersChange: () => void
  onEdit: (member: AttendanceMember) => void
  onAdd: () => void
  deselectMemberTrigger?: number
  onHasSelectedMemberChange?: (hasSelectedMember: boolean) => void
}

export function Members({
  group,
  members,
  onMembersChange,
  onEdit,
  onAdd,
  deselectMemberTrigger,
  onHasSelectedMemberChange,
}: MembersProps) {
  const mode = useGroupUIStore((state) => state.lastRegistrationMode)
  const source = useGroupUIStore((state) => state.lastRegistrationSource)
  const resetRegistration = useGroupUIStore((state) => state.resetRegistration)
  const setRegistrationState = useGroupUIStore((state) => state.setRegistrationState)

  const [memberSearch, setMemberSearch] = useState("")
  const [registrationFilter, setRegistrationFilter] = useState<
    "all" | "registered" | "non-registered" | "no-consent"
  >("all")

  const membersWithDisplayNames = useMemo(() => {
    return generateDisplayNames(members)
  }, [members])

  const filteredMembers = useMemo(() => {
    let result = membersWithDisplayNames

    if (memberSearch.trim()) {
      const query = memberSearch.toLowerCase()
      result = result.filter(
        (member) =>
          member.name.toLowerCase().includes(query) ||
          member.displayName.toLowerCase().includes(query) ||
          member.person_id.toLowerCase().includes(query),
      )
    }

    if (registrationFilter !== "all") {
      result = result.filter((member) => {
        if (registrationFilter === "no-consent") {
          return !member.has_consent
        }
        const isRegistered = member.has_face_data
        return registrationFilter === "registered" ? isRegistered : !isRegistered
      })
    }

    result = [...result].sort((a, b) => {
      // Sort by registration status first (Unregistered first)
      if (!a.has_face_data && b.has_face_data) return -1
      if (a.has_face_data && !b.has_face_data) return 1
      // Then alphabetically
      return a.displayName.localeCompare(b.displayName)
    })

    return result
  }, [memberSearch, membersWithDisplayNames, registrationFilter])

  const [memberToDelete, setMemberToDelete] = useState<AttendanceMember | null>(null)

  const [isBulkConsentModalOpen, setIsBulkConsentModalOpen] = useState(false)

  const handleBulkConsent = async (confirmedIds: string[]) => {
    try {
      await Promise.all(
        confirmedIds.map((id) =>
          attendanceManager.updateMember(id, {
            has_consent: true,
          }),
        ),
      )
      onMembersChange()
      setIsBulkConsentModalOpen(false)
    } catch (err) {
      console.error("Error updating bulk consent:", err)
    }
  }

  const confirmRemoveMember = async () => {
    if (!memberToDelete) return

    try {
      await attendanceManager.removeMember(memberToDelete.person_id)
      onMembersChange()
      setMemberToDelete(null)
    } catch (err) {
      console.error("Error removing member:", err)
    }
  }

  const animationProps = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2 },
  }

  return (
    <AnimatePresence mode="wait">
      {mode === "bulk" && source === "upload" ?
        <motion.div
          key="bulk-upload"
          {...animationProps}
          className="relative flex h-full w-full flex-col">
          <BulkRegistration
            group={group}
            members={members}
            onRefresh={onMembersChange}
            onClose={resetRegistration}
          />
        </motion.div>
      : mode === "queue" && source === "camera" ?
        <motion.div
          key="camera-queue"
          {...animationProps}
          className="relative flex h-full w-full flex-col">
          <CameraQueue
            group={group}
            members={members}
            onRefresh={onMembersChange}
            onClose={resetRegistration}
          />
        </motion.div>
      : mode === "single" && source ?
        <motion.div
          key="single-capture"
          {...animationProps}
          className="relative flex h-full w-full flex-col">
          <FaceCapture
            group={group}
            members={members}
            onRefresh={onMembersChange}
            initialSource={source === "camera" ? "live" : source}
            deselectMemberTrigger={deselectMemberTrigger}
            onHasSelectedMemberChange={onHasSelectedMemberChange}
          />
        </motion.div>
      : members.length === 0 ?
        <motion.div
          key="empty-state"
          {...animationProps}
          className="relative flex h-full w-full flex-col">
          <EmptyState
            title="No members in this group yet"
            action={
              onAdd ?
                {
                  label: "Add Member",
                  onClick: onAdd,
                }
              : undefined
            }
          />
        </motion.div>
      : <motion.div
          key="members-list"
          {...animationProps}
          className="relative mx-auto flex w-full max-w-[900px] flex-col space-y-4 px-10 pt-4 pb-10">
          <div className="flex shrink-0 items-center justify-between gap-4">
            <div className="relative w-full max-w-[320px]">
              <svg
                className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/30"
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
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full rounded-xl border border-white/5 bg-white/5 py-2.5 pr-3 pl-10 text-[11px] font-medium text-white shadow-inner transition-all duration-300 outline-none placeholder:text-white/30 focus:border-cyan-500/32 focus:bg-white/10 focus:ring-1 focus:ring-cyan-500/5"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Dropdown
                options={[
                  { value: "all", label: "Filter: All" },
                  { value: "non-registered", label: "Unregistered" },
                  { value: "registered", label: "Registered" },
                  { value: "no-consent", label: "Needs Consent" },
                ]}
                value={registrationFilter}
                onChange={(val) => {
                  if (val) {
                    setRegistrationFilter(
                      val as "all" | "registered" | "non-registered" | "no-consent",
                    )
                  }
                }}
                allowClear={false}
                buttonClassName="!bg-white/5 !border-white/5 py-1.5 px-3 min-w-[130px] rounded-lg text-[11px] font-bold tracking-wider text-white hover:!bg-white/10"
                optionClassName="text-[11px] font-bold tracking-wider"
                iconClassName="text-[10px]"
              />

              <div className="mx-2 h-4 w-px bg-white/10" />

              <Tooltip content="Multi-member camera queue">
                <button
                  onClick={() => setRegistrationState("camera", "queue")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/50 transition-all hover:bg-cyan-500/20 hover:text-cyan-400">
                  <i className="fa-solid fa-users-viewfinder text-[11px]"></i>
                </button>
              </Tooltip>
              <Tooltip content="Batch upload photos">
                <button
                  onClick={() => setRegistrationState("upload", "bulk")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-white/50 transition-all hover:bg-cyan-500/20 hover:text-cyan-400">
                  <i className="fa-solid fa-layer-group text-[11px]"></i>
                </button>
              </Tooltip>
            </div>
          </div>

          {members.length > 0 && filteredMembers.length > 0 && (
            <div className="px-2 py-1 text-xs text-white/30">
              Showing {filteredMembers.length} of {members.length} member
              {members.length !== 1 ? "s" : ""}
            </div>
          )}

          <div className="flex flex-col">
            {filteredMembers.length === 0 && (
              <div className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-6 text-center">
                <div className="text-xs text-white/40">
                  {memberSearch.trim() ?
                    `No results for "${memberSearch}"`
                  : registrationFilter === "registered" ?
                    "No registered members"
                  : registrationFilter === "non-registered" ?
                    "All members are registered"
                  : "No members found"}
                </div>
              </div>
            )}

            {filteredMembers.map((member) => {
              const isRegistered = member.has_face_data
              return (
                <div
                  key={member.person_id}
                  className="group relative flex w-full items-center justify-between gap-4 rounded-lg border-b border-white/5 px-2 py-3 transition-colors hover:bg-white/[0.02]">
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="mb-0.5 text-sm font-bold tracking-tight text-white">
                      {member.displayName}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {member.role ?
                        <div className="flex items-center gap-1.5 text-xs font-medium text-white/40">
                          <i className="fa-solid fa-briefcase text-[10px]"></i>
                          {member.role}
                        </div>
                      : <div className="text-xs font-medium text-white/20 italic">Member</div>}
                      {member.email && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-white/40">
                          <i className="fa-solid fa-envelope text-[10px]"></i>
                          {member.email}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="relative z-10 flex shrink-0 items-center gap-3">
                    {!member.has_consent && (
                      <div className="flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-1 text-[9px] font-black tracking-wider text-indigo-400 uppercase">
                        <i className="fa-solid fa-eye-slash text-[8px]" />
                        No Consent
                      </div>
                    )}
                    <div className="flex translate-x-1 items-center gap-1.5 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
                      <Tooltip content="Edit member" position="top">
                        <button
                          onClick={() => onEdit(member)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-all hover:bg-white/10 hover:text-white">
                          <i className="fa-solid fa-pen-to-square text-xs"></i>
                        </button>
                      </Tooltip>
                      <Tooltip content="Delete member" position="top">
                        <button
                          onClick={() => setMemberToDelete(member)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-all hover:bg-red-500/10 hover:text-red-400">
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </Tooltip>
                    </div>

                    {!isRegistered ?
                      <button
                        onClick={() => {
                          const jump = useGroupUIStore.getState().jumpToRegistration
                          jump(member.person_id)
                        }}
                        className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/20 active:scale-95">
                        Register
                      </button>
                    : <button
                        onClick={() => {
                          const jump = useGroupUIStore.getState().jumpToRegistration
                          jump(member.person_id)
                        }}
                        className="group/btn relative flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/25 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400">
                        <i className="fa-solid fa-check text-[10px] transition-all duration-300 group-hover/btn:absolute group-hover/btn:scale-75 group-hover/btn:opacity-0"></i>

                        <i className="fa-solid fa-rotate-right absolute scale-75 text-[10px] opacity-0 transition-all duration-300 group-hover/btn:relative group-hover/btn:scale-100 group-hover/btn:opacity-100"></i>

                        <span className="transition-all duration-300 group-hover/btn:hidden">
                          Registered
                        </span>
                        <span className="hidden transition-all duration-300 group-hover/btn:inline">
                          Re-register
                        </span>
                      </button>
                    }
                  </div>
                </div>
              )
            })}
          </div>

          {/* Consent banner */}
          {members.some((m) => !m.has_consent) && (
            <div className="pointer-events-none sticky right-0 bottom-6 left-0 z-20 flex justify-center">
              <div className="animate-in fade-in slide-in-from-bottom-4 pointer-events-auto flex items-center gap-4 rounded-xl border border-white/10 bg-[#0f1319] px-4 py-2.5 text-[11px] font-medium text-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.8)] duration-500">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation shrink-0 text-amber-500/80" />
                  <span className="leading-snug whitespace-nowrap">
                    Some members need biometric consent.
                  </span>
                </div>
                <div className="h-4 w-px bg-white/10" />
                <button
                  onClick={() => setIsBulkConsentModalOpen(true)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold tracking-wider text-white/50 transition-all hover:bg-white/10 active:scale-95">
                  Grant all
                </button>
              </div>
            </div>
          )}

          <AnimatePresence>
            {memberToDelete && (
              <DeleteMemberModal
                isOpen={true}
                member={memberToDelete}
                onClose={() => setMemberToDelete(null)}
                onConfirm={confirmRemoveMember}
              />
            )}
          </AnimatePresence>

          <BulkConsentModal
            isOpen={isBulkConsentModalOpen}
            onClose={() => setIsBulkConsentModalOpen(false)}
            onConfirm={handleBulkConsent}
            members={members}
          />
        </motion.div>
      }
    </AnimatePresence>
  )
}
