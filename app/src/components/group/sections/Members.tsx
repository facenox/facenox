import { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { attendanceManager } from "@/services"
import { useGroupUIStore, useGroupStore } from "@/components/group/stores"
import { useAttendanceStore } from "@/components/main/stores"
import { generateDisplayNames } from "@/utils"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { EmptyState } from "@/components/group/shared/EmptyState"
import { Dropdown, useDialog, Tooltip } from "@/components/shared"
import { DeleteMemberModal } from "./DeleteMemberModal"
import { BulkConsentModal } from "./BulkConsentModal"
import { FaceCapture } from "./enrollment/FaceCapture"
import { CameraQueue } from "./enrollment/CameraQueue"
import { BulkEnrollment } from "./enrollment/BulkEnrollment"
import { MemberRow } from "./members/MemberRow"

interface MembersProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  onMembersChange: () => void
  onEdit?: (member: AttendanceMember) => void
  onAdd?: () => void
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
  const mode = useGroupUIStore((state) => state.lastEnrollmentMode)
  const source = useGroupUIStore((state) => state.lastEnrollmentSource)
  const resetEnrollment = useGroupUIStore((state) => state.resetEnrollment)
  const setEnrollmentState = useGroupUIStore((state) => state.setEnrollmentState)
  const jumpToEnrollment = useGroupUIStore((state) => state.jumpToEnrollment)
  const showAddMemberModal = useGroupUIStore((state) => state.showAddMemberModal)
  const dialog = useDialog()

  const [memberSearch, setMemberSearch] = useState("")
  const [enrollmentFilter, setEnrollmentFilter] = useState<"all" | "enrolled" | "non-enrolled">(
    "all",
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [shouldKeepExpanded, setShouldKeepExpanded] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showAddMemberModal) {
      setSelectedIds(new Set())
    }
  }, [showAddMemberModal])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectedIds.size === 0) return
      const target = e.target as HTMLElement
      if (
        target.closest("button, input, select, [data-member-row], [role=button], [role=combobox]")
      )
        return
      setSelectedIds(new Set())
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [selectedIds.size])

  const handleSearchFocus = () => {
    setIsSearchFocused(true)
  }

  const handleSearchBlur = () => {
    setTimeout(() => {
      setIsSearchFocused(false)
    }, 150)
  }

  const handleDropdownOpenChange = (open: boolean) => {
    if (open) {
      if (isSearchFocused || memberSearch.trim().length > 0) {
        setShouldKeepExpanded(true)
      }
    } else {
      setShouldKeepExpanded(false)
    }
  }

  const toggleSelect = useCallback((personId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }, [])

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMembers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredMembers.map((m) => m.person_id)))
    }
  }

  const membersWithDisplayNames = generateDisplayNames(members)

  let filteredMembers = membersWithDisplayNames

  if (memberSearch.trim()) {
    const query = memberSearch.toLowerCase()
    filteredMembers = filteredMembers.filter(
      (member) =>
        member.name.toLowerCase().includes(query) ||
        member.displayName.toLowerCase().includes(query) ||
        member.person_id.toLowerCase().includes(query) ||
        (member.role || "member").toLowerCase().includes(query),
    )
  }

  if (enrollmentFilter !== "all") {
    filteredMembers = filteredMembers.filter((member) => {
      const isEnrolled = member.has_face_data
      return enrollmentFilter === "enrolled" ? isEnrolled : !isEnrolled
    })
  }

  filteredMembers = [...filteredMembers].sort((a, b) => {
    if (!a.has_face_data && b.has_face_data) return -1
    if (a.has_face_data && !b.has_face_data) return 1
    return a.displayName.localeCompare(b.displayName)
  })

  // Reset scroll state and position when filter or search changes
  useEffect(() => {
    setScrollTop(0)
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [memberSearch, enrollmentFilter])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedIds((prev) => {
          if (prev.size > 0) {
            e.preventDefault()
            return new Set()
          }
          return prev
        })
        if (
          document.activeElement instanceof HTMLInputElement &&
          document.activeElement.type === "search"
        ) {
          document.activeElement.blur()
        }
        return
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (isCmdOrCtrl && e.key.toLowerCase() === "a") {
        const target = e.target as HTMLElement
        const isInputField =
          target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

        if (!isInputField) {
          e.preventDefault()
          setSelectedIds(new Set(filteredMembers.map((m) => m.person_id)))
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [filteredMembers])

  useEffect(() => {
    onHasSelectedMemberChange?.(selectedIds.size > 0)
    return () => {
      onHasSelectedMemberChange?.(false)
    }
  }, [selectedIds, onHasSelectedMemberChange])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const ITEM_HEIGHT = 60

  // Calculate visible range with a larger overscan buffer to prevent blanking on fast scrolls
  const OVERSCAN = 20
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(
    filteredMembers.length - 1,
    Math.floor((scrollTop + 800) / ITEM_HEIGHT) + OVERSCAN,
  )

  const visibleMembers = filteredMembers.slice(startIndex, endIndex + 1)

  const paddingTop = startIndex * ITEM_HEIGHT
  const paddingBottom = Math.max(0, (filteredMembers.length - 1 - endIndex) * ITEM_HEIGHT)

  const selectedMembersList = (() => {
    if (selectedIds.size === 0) return []
    return filteredMembers.filter((m) => selectedIds.has(m.person_id))
  })()

  const selectedStats = (() => {
    let ready = 0
    let noConsent = 0
    let enrolled = 0

    const isConsentCertified = Boolean(group?.settings?.biometric_consent_certified)

    selectedMembersList.forEach((m) => {
      const hasConsent = isConsentCertified || !!m.has_consent
      if (!hasConsent) noConsent++
      else if (m.has_face_data) enrolled++
      else ready++
    })
    return {
      ready,
      noConsent,
      enrolled,
      total: selectedMembersList.length,
      eligible: ready + enrolled,
    }
  })()

  const [memberToDelete, setMemberToDelete] = useState<AttendanceMember | null>(null)

  const [isBulkConsentModalOpen, setIsBulkConsentModalOpen] = useState(false)
  const [bulkConsentScope, setBulkConsentScope] = useState<"all" | "selected">("all")

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

  const removeMember = useCallback(
    async (member: AttendanceMember) => {
      const targetId = member.person_id
      const previousGroupMembers = useGroupStore.getState().members
      const previousAttendanceMembers = useAttendanceStore.getState().groupMembers

      useGroupStore.setState({
        members: previousGroupMembers.filter((m) => m.person_id !== targetId),
      })
      useAttendanceStore.setState({
        groupMembers: previousAttendanceMembers.filter((m) => m.person_id !== targetId),
      })

      try {
        await attendanceManager.removeMember(targetId)
        onMembersChange()
      } catch (err) {
        console.error("Error removing member, rolling back state:", err)
        useGroupStore.setState({ members: previousGroupMembers })
        useAttendanceStore.setState({ groupMembers: previousAttendanceMembers })
      }
    },
    [onMembersChange],
  )

  const confirmRemoveMember = async () => {
    if (!memberToDelete) return
    await removeMember(memberToDelete)
    setMemberToDelete(null)
  }

  const handleResetFace = useCallback(
    async (member: AttendanceMember) => {
      try {
        const confirmed = await dialog.confirm({
          title: "Remove Enrollment",
          message: `Are you sure you want to remove the enrollment for ${member.name}? They will need to re-enroll to be recognized.`,
          confirmText: "Remove",
          confirmVariant: "danger",
        })

        if (confirmed) {
          const result = await attendanceManager.removeFaceDataForGroupPerson(
            group.id,
            member.person_id,
          )
          if (result.success) {
            onMembersChange()
          }
        }
      } catch (err) {
        console.error("Error resetting face data:", err)
      }
    },
    [dialog, group.id, onMembersChange],
  )

  const isSearchExpanded = memberSearch.trim().length > 0 || isSearchFocused || shouldKeepExpanded
  const dropdownWidthClass =
    enrollmentFilter === "all" ? "w-[68px]"
    : enrollmentFilter === "enrolled" ? "w-[112px]"
    : "w-[138px]"

  const searchBarMaxWidthClass =
    isSearchExpanded ?
      enrollmentFilter === "all" ? "max-w-[320px]"
      : enrollmentFilter === "enrolled" ? "max-w-[364px]"
      : "max-w-[390px]"
    : enrollmentFilter === "all" ? "max-w-[260px]"
    : enrollmentFilter === "enrolled" ? "max-w-[304px]"
    : "max-w-[330px]"

  return (
    <div ref={outerRef} className="relative flex h-full w-full flex-col overflow-hidden">
      {/* BACKGROUND CONTENT: Always render the list or empty state */}
      {members.length === 0 ?
        <motion.div key="empty" className="relative flex h-full w-full flex-col">
          <EmptyState
            title="This group has no members"
            description={
              isPaired ?
                isCustomServer ?
                  "Members are managed on your custom server dashboard."
                : "Members are managed in Facenox Cloud."
              : "Add, edit, and remove members to manage profiles and enrollment status."
            }
            action={
              onAdd ?
                {
                  label: "Add Member",
                  onClick: onAdd,
                  iconClass: "fa-solid fa-user-plus text-[10px]",
                }
              : undefined
            }
          />
        </motion.div>
      : <motion.div
          key="members-list"
          className="relative flex h-full w-full flex-col overflow-hidden">
          <div className="sticky top-0 z-30 shrink-0 space-y-4 bg-transparent px-10 pt-8 pb-4">
            <div className="flex items-center justify-between gap-4">
              <div
                className={`group/bar flex w-full items-center transition-all duration-300 ease-out ${searchBarMaxWidthClass}`}>
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
                    type="search"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    onFocus={handleSearchFocus}
                    onBlur={handleSearchBlur}
                    placeholder="Search name or role..."
                    className="h-9 w-full rounded-l-lg rounded-r-none border border-r-0 border-white/5 bg-white/5 py-2 pr-3 pl-9 text-xs font-medium text-white transition-all duration-300 outline-none placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.08]"
                  />
                </div>

                <div className="relative shrink-0">
                  <Dropdown
                    options={[
                      { value: "all", label: "All" },
                      { value: "enrolled", label: "Enrolled" },
                      { value: "non-enrolled", label: "Not Enrolled" },
                    ]}
                    value={enrollmentFilter}
                    onChange={(val) => {
                      if (val) {
                        setEnrollmentFilter(val as "all" | "enrolled" | "non-enrolled")
                      }
                    }}
                    allowClear={false}
                    menuWidth={160}
                    align="right"
                    onOpenChange={handleDropdownOpenChange}
                    buttonClassName={`h-9 !bg-white/5 !border-white/5 group-focus-within/bar:!border-white/20 border-l-0 rounded-l-none rounded-r-lg px-3 ${dropdownWidthClass} text-[11px] font-bold tracking-wider text-white hover:!bg-white/[0.08] hover:!border-white/10 focus:!border-white/20 focus:!bg-white/[0.08] transition-all duration-300`}
                    optionClassName="text-[11px] font-bold tracking-wider"
                    iconClassName="text-[10px]"
                  />
                </div>
              </div>
            </div>

            {members.length > 0 && filteredMembers.length > 0 && (
              <div className="flex min-h-8 w-full items-center justify-between py-1">
                <div className="text-xs text-white/55">
                  {selectedStats.total > 0 ?
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-white/80">
                        {selectedStats.total} selected
                      </span>
                      <div className="h-3 w-px bg-white/10" />
                      <div className="flex gap-2 text-[10px] font-medium">
                        {selectedStats.ready > 0 && (
                          <span className="text-cyan-400">
                            {selectedStats.ready} not enrolled yet
                          </span>
                        )}
                        {selectedStats.enrolled > 0 && (
                          <span className="text-white/55">{selectedStats.enrolled} enrolled</span>
                        )}
                        {selectedStats.noConsent > 0 && (
                          <span className="text-amber-400">
                            {selectedStats.noConsent} no consent
                          </span>
                        )}
                      </div>
                    </div>
                  : <span>
                      Showing {filteredMembers.length} of {members.length} member
                      {members.length !== 1 ? "s" : ""}
                    </span>
                  }
                </div>
                <div className="flex items-center gap-4">
                  <AnimatePresence>
                    {selectedIds.size >= 2 && selectedStats.noConsent > 0 && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() => {
                          setBulkConsentScope("selected")
                          setIsBulkConsentModalOpen(true)
                        }}
                        className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-amber-400 transition-all hover:bg-amber-500/20">
                        GRANT CONSENT ({selectedStats.noConsent})
                      </motion.button>
                    )}

                    {selectedIds.size >= 2 && selectedStats.eligible === 1 && (
                      <motion.div
                        key="enroll-single"
                        initial={{ opacity: 0, scale: 0.95, x: 10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95, x: 10 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}>
                        <Tooltip
                          content={
                            selectedStats.enrolled > 0 ?
                              "This member is already enrolled. Proceed to re-enroll."
                            : "Proceed to enroll member"
                          }>
                          <motion.button
                            onClick={() =>
                              jumpToEnrollment(
                                selectedMembersList.find((m) => m.has_consent)!.person_id,
                              )
                            }
                            className={`flex items-center gap-2 rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all ${
                              selectedStats.enrolled > 0 ?
                                "border border-white/10 bg-transparent text-white/65 hover:bg-white/5 hover:text-white"
                              : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 hover:text-cyan-200"
                            }`}>
                            {selectedStats.enrolled > 0 ? "RE-ENROLL (1)" : "ENROLL (1)"}
                          </motion.button>
                        </Tooltip>
                      </motion.div>
                    )}

                    {selectedIds.size >= 2 && selectedStats.eligible > 1 && (
                      <motion.div
                        key="enroll-multi"
                        initial={{ opacity: 0, scale: 0.95, x: 10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95, x: 10 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}>
                        <Tooltip
                          content={
                            selectedStats.enrolled > 0 ?
                              `Includes ${selectedStats.enrolled} already enrolled member${selectedStats.enrolled > 1 ? "s" : ""}`
                            : "Proceed to enroll members"
                          }>
                          <div>
                            <Dropdown
                              options={[
                                {
                                  value: "camera",
                                  label: (
                                    <div className="flex items-center gap-2">
                                      <i className="fa-solid fa-video w-3 text-center text-xs text-white/55" />
                                      <span>via Webcam</span>
                                    </div>
                                  ),
                                },
                                {
                                  value: "upload",
                                  label: (
                                    <div className="flex items-center gap-2">
                                      <i className="fa-solid fa-folder-open w-3 text-center text-xs text-white/55" />
                                      <span>via File Upload</span>
                                    </div>
                                  ),
                                },
                              ]}
                              value={null}
                              onChange={(val) => {
                                if (val === "camera") setEnrollmentState("camera", "queue")
                                if (val === "upload") setEnrollmentState("upload", "bulk")
                              }}
                              allowClear={false}
                              showPlaceholderOption={false}
                              trigger={
                                <button
                                  className={`flex items-center gap-2 rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wider transition-all ${
                                    selectedStats.enrolled > 0 && selectedStats.ready === 0 ?
                                      "border border-white/10 bg-transparent text-white/65 hover:bg-white/5 hover:text-white"
                                    : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 hover:text-cyan-200"
                                  }`}>
                                  {selectedStats.enrolled > 0 && selectedStats.ready === 0 ?
                                    "RE-ENROLL"
                                  : "ENROLL"}{" "}
                                  ({selectedStats.eligible})
                                  <i className="fa-solid fa-chevron-down ml-0.5 text-[9px] opacity-60"></i>
                                </button>
                              }
                              menuWidth={180}
                              buttonClassName="p-0 border-0 bg-transparent hover:bg-transparent h-auto w-auto"
                              optionClassName="text-[11px] font-bold tracking-wider py-2.5"
                            />
                          </div>
                        </Tooltip>
                      </motion.div>
                    )}

                    {selectedIds.size >= 2 && (
                      <motion.button
                        key="delete"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        onClick={async () => {
                          const confirmed = await dialog.confirm({
                            title: "Remove Members",
                            message: `Are you sure you want to remove ${selectedIds.size} member${selectedIds.size > 1 ? "s" : ""}?`,
                            confirmText: `Remove (${selectedIds.size})`,
                            confirmVariant: "danger",
                          })
                          if (confirmed) {
                            const ids = [...selectedIds]
                            const previousGroupMembers = useGroupStore.getState().members
                            const previousAttendanceMembers =
                              useAttendanceStore.getState().groupMembers

                            useGroupStore.setState({
                              members: previousGroupMembers.filter(
                                (m) => !ids.includes(m.person_id),
                              ),
                            })
                            useAttendanceStore.setState({
                              groupMembers: previousAttendanceMembers.filter(
                                (m) => !ids.includes(m.person_id),
                              ),
                            })

                            try {
                              const result = await attendanceManager.removeMembersBulk(ids)
                              if (result.error_count > 0) {
                                console.warn("Some members failed to delete:", result.errors)
                              }
                              onMembersChange()
                            } catch (err) {
                              console.error("Error removing members, rolling back state:", err)
                              useGroupStore.setState({ members: previousGroupMembers })
                              useAttendanceStore.setState({
                                groupMembers: previousAttendanceMembers,
                              })
                            }
                            setSelectedIds(new Set())
                          }
                        }}
                        className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-red-400 transition-all hover:bg-red-500/20">
                        <i className="fa-solid fa-trash-can text-[9px]" />
                        DELETE ({selectedIds.size})
                      </motion.button>
                    )}

                    {selectedIds.size > 0 && (
                      <motion.button
                        key="clear"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() => setSelectedIds(new Set())}
                        className="flex items-center gap-2 text-[11px] font-bold text-white/55 transition-all hover:text-white">
                        Clear
                      </motion.button>
                    )}
                  </AnimatePresence>
                  <button
                    onClick={
                      selectedIds.size === filteredMembers.length ? undefined : toggleSelectAll
                    }
                    disabled={selectedIds.size === filteredMembers.length}
                    className={`flex items-center gap-2 text-[11px] font-bold transition-all ${
                      selectedIds.size === filteredMembers.length ?
                        "cursor-default text-white/20"
                      : "text-cyan-400/80 hover:text-cyan-400"
                    }`}>
                    Select All
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="custom-scroll hover-scrollbar flex flex-1 flex-col overflow-y-auto px-10 pb-10"
            style={{
              maskImage: "linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)",
            }}>
            <AnimatePresence mode="wait">
              {filteredMembers.length === 0 ?
                <EmptyState
                  key="empty"
                  className="min-h-[300px]"
                  title={
                    memberSearch.trim() ? "No results found"
                    : enrollmentFilter === "enrolled" ?
                      "No enrolled members"
                    : enrollmentFilter === "non-enrolled" ?
                      "All members are enrolled"
                    : "No members found"
                  }
                  description={
                    memberSearch.trim() ? `No members matched "${memberSearch}"`
                    : enrollmentFilter === "enrolled" ?
                      "There are no enrolled members in this group."
                    : enrollmentFilter === "non-enrolled" ?
                      "All members in this group have been enrolled."
                    : "There are no members added to this group yet."
                  }
                  iconClass={
                    memberSearch.trim() ?
                      "fa-solid fa-ghost text-2xl"
                    : "fa-solid fa-user-slash text-2xl"
                  }
                />
              : <motion.div
                  key={`results-${enrollmentFilter}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex w-full flex-col gap-1"
                  style={{
                    paddingTop: `${paddingTop}px`,
                    paddingBottom: `${paddingBottom}px`,
                  }}>
                  {visibleMembers.map((member, idx) => (
                    <div key={member.person_id || `member-${idx}`} data-member-row>
                      <MemberRow
                        member={member}
                        isSelected={selectedIds.has(member.person_id)}
                        isSelectionMode={selectedIds.size >= 2}
                        onToggleSelect={toggleSelect}
                        onEdit={onEdit}
                        onDelete={setMemberToDelete}
                        onResetFace={handleResetFace}
                        isConsentCertified={Boolean(group?.settings?.biometric_consent_certified)}
                      />
                    </div>
                  ))}
                </motion.div>
              }
            </AnimatePresence>
          </div>

          {/* Consent banner */}
          {!group?.settings?.biometric_consent_certified && members.some((m) => !m.has_consent) && (
            <div className="pointer-events-none absolute right-0 bottom-6 left-0 z-40 flex justify-center">
              <div className="animate-in fade-in slide-in-from-bottom-4 pointer-events-auto flex items-center gap-4 rounded-lg border border-white/10 bg-[#0d1117]/95 px-4 py-2 text-[11px] font-medium text-white/65 shadow-xl duration-500">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-triangle-exclamation shrink-0 text-amber-500/80" />
                  <span className="leading-snug whitespace-nowrap">
                    Some members need biometric consent.
                  </span>
                </div>
                <button
                  onClick={() => {
                    setBulkConsentScope("all")
                    setIsBulkConsentModalOpen(true)
                  }}
                  className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-bold tracking-wider text-white/70 transition-all duration-200 hover:border-white/25 hover:bg-white/5 active:scale-[0.97]">
                  Grant all
                </button>
              </div>
            </div>
          )}

          <DeleteMemberModal
            isOpen={!!memberToDelete}
            member={memberToDelete}
            onClose={() => setMemberToDelete(null)}
            onConfirm={confirmRemoveMember}
          />

          <BulkConsentModal
            isOpen={isBulkConsentModalOpen}
            onClose={() => setIsBulkConsentModalOpen(false)}
            onConfirm={handleBulkConsent}
            members={bulkConsentScope === "selected" ? selectedMembersList : members}
          />
        </motion.div>
      }

      {/* OVERLAY CONTENT: Enrollment tasks */}
      <AnimatePresence>
        {mode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="absolute inset-0 z-50 flex flex-col bg-[#0b0e14]">
            {mode === "bulk" && source === "upload" && (
              <BulkEnrollment
                group={group}
                members={selectedMembersList.filter(
                  (m) => Boolean(group?.settings?.biometric_consent_certified) || !!m.has_consent,
                )}
                onRefresh={onMembersChange}
                onClose={resetEnrollment}
                className="flex-1"
              />
            )}
            {mode === "queue" && source === "camera" && (
              <CameraQueue
                group={group}
                members={members}
                preselectedIds={selectedMembersList
                  .filter(
                    (m) => Boolean(group?.settings?.biometric_consent_certified) || !!m.has_consent,
                  )
                  .map((m) => m.person_id)}
                onRefresh={onMembersChange}
                onClose={resetEnrollment}
              />
            )}
            {mode === "single" && source && (
              <FaceCapture
                group={group}
                members={members}
                onRefresh={onMembersChange}
                initialSource={source === "camera" ? "live" : source}
                deselectMemberTrigger={deselectMemberTrigger}
                onHasSelectedMemberChange={onHasSelectedMemberChange}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
