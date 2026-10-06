import { useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import type { AttendanceMember } from "@/types/recognition"
import type { DetectedFace } from "@/components/group/sections/enrollment/types"
import { createDisplayNameMap } from "@/utils/displayNameUtils"

interface MemberAssignComboboxProps {
  availableMembers: AttendanceMember[]
  displayNameMap: Map<string, string>
  totalMembersCount: number
  onSelect: (personId: string) => void
}

function MemberAssignCombobox({
  availableMembers,
  displayNameMap,
  totalMembersCount,
  onSelect,
}: MemberAssignComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [menuPos, setMenuPos] = useState<{
    top: number
    left: number
    width: number
    opensUp: boolean
  } | null>(null)

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return availableMembers
    const q = search.trim().toLowerCase()
    return availableMembers.filter((m) => {
      const displayName = displayNameMap.get(m.person_id) || m.name
      return (
        displayName.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.role && m.role.toLowerCase().includes(q)) ||
        m.person_id.toLowerCase().includes(q)
      )
    })
  }, [availableMembers, displayNameMap, search])

  const displayedMembers = useMemo(() => filteredMembers.slice(0, 50), [filteredMembers])

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const estimatedHeight = 260
    const opensUp = spaceBelow < estimatedHeight && rect.top > spaceBelow
    const top =
      opensUp ?
        Math.max(8, rect.top - estimatedHeight - 4)
      : Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + 4)
    const width = Math.max(220, rect.width)
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left))
    setMenuPos({ top, left, width, opensUp })
  }, [])

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition()
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    const handleScrollOrResize = () => {
      if (isOpen) updatePosition()
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleGlobalClick)
      window.addEventListener("resize", handleScrollOrResize)
      window.addEventListener("scroll", handleScrollOrResize, true)
    }
    return () => {
      document.removeEventListener("mousedown", handleGlobalClick)
      window.removeEventListener("resize", handleScrollOrResize)
      window.removeEventListener("scroll", handleScrollOrResize, true)
    }
  }, [isOpen, updatePosition])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      setIsOpen(false)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1 < displayedMembers.length ? prev + 1 : prev))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : 0))
    } else if (e.key === "Enter" && displayedMembers[activeIndex]) {
      e.preventDefault()
      onSelect(displayedMembers[activeIndex].person_id)
      setIsOpen(false)
    }
  }

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          setSearch("")
          setActiveIndex(0)
        }}
        className="flex w-full items-center justify-between border-b border-white/10 bg-transparent py-1.5 text-left text-[11px] font-medium text-white/55 transition-colors hover:border-white/25 hover:text-white/80 focus:border-cyan-500/50 focus:text-white focus:outline-none">
        <span className="truncate">Assign member…</span>
        <i
          className={`fa-solid fa-chevron-down text-[9px] text-white/40 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
          <AnimatePresence>
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.96, y: menuPos?.opensUp ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                top: menuPos ? `${menuPos.top}px` : "-9999px",
                left: menuPos ? `${menuPos.left}px` : "-9999px",
                width: menuPos ? `${menuPos.width}px` : "220px",
              }}
              className="fixed z-9999 flex max-h-[280px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0f1319] shadow-2xl backdrop-blur-md">
              {/* Search Bar */}
              <div className="relative shrink-0 border-b border-white/10 p-2">
                <i className="fa-solid fa-magnifying-glass absolute top-1/2 left-4 -translate-y-1/2 text-[10px] text-white/40" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setActiveIndex(0)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    availableMembers.length > 50 ?
                      `Search ${availableMembers.length.toLocaleString()} members...`
                    : "Search member..."
                  }
                  className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pr-3 pl-8 text-xs text-white placeholder-white/40 transition-colors focus:border-cyan-500/50 focus:bg-white/[0.08] focus:outline-none"
                />
              </div>

              {/* Members List */}
              <div className="custom-scroll flex-1 overflow-y-auto p-1">
                {displayedMembers.length === 0 ?
                  <div className="px-3 py-4 text-center">
                    {search.trim() ?
                      <p className="text-[11px] text-white/40">
                        No member matches &quot;{search}&quot;
                      </p>
                    : availableMembers.length === 0 ?
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-amber-400/90">
                          No eligible members
                        </p>
                        <p className="text-[10px] leading-relaxed text-white/40">
                          {totalMembersCount > 0 ?
                            "Biometric consent is required before enrolling face data."
                          : "No members in group."}
                        </p>
                      </div>
                    : <p className="text-[11px] text-white/40">No members available</p>}
                  </div>
                : <>
                    {displayedMembers.map((member, idx) => {
                      const displayName = displayNameMap.get(member.person_id) || member.name
                      return (
                        <button
                          key={member.person_id}
                          type="button"
                          onClick={() => {
                            onSelect(member.person_id)
                            setIsOpen(false)
                          }}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                            idx === activeIndex ?
                              "bg-cyan-500/15 text-cyan-300"
                            : "text-white/80 hover:bg-white/5 hover:text-white"
                          }`}>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{displayName}</div>
                            {member.role && (
                              <div className="truncate text-[10px] text-white/40">
                                {member.role}
                              </div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                    {filteredMembers.length > 50 && (
                      <div className="py-2 text-center text-[10px] text-white/30">
                        Type to refine {filteredMembers.length.toLocaleString()} matches
                      </div>
                    )}
                  </>
                }
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}

interface FaceAssignmentGridProps {
  detectedFaces: DetectedFace[]
  members: AttendanceMember[]
  availableMembers: AttendanceMember[]
  assignedCount: number
  onAssignMember: (faceId: string, personId: string) => void
  onUnassign: (faceId: string) => void
}

export function FaceAssignmentGrid({
  detectedFaces,
  members,
  availableMembers,
  assignedCount,
  onAssignMember,
  onUnassign,
}: FaceAssignmentGridProps) {
  const displayNameMap = useMemo(() => createDisplayNameMap(members), [members])

  return (
    <div className="flex flex-col gap-6">
      {/* Meta row — no pills, just inline text */}
      <div className="flex items-baseline gap-2 text-[11px]">
        <span className="font-semibold text-white">
          {assignedCount}
          <span className="text-white/30">/{detectedFaces.length}</span>
        </span>
        <span className="text-white/35">assigned</span>
        {availableMembers.length > 0 && (
          <>
            <span className="text-white/15">·</span>
            <span className="text-white/35">
              {availableMembers.length} {availableMembers.length === 1 ? "member" : "members"}{" "}
              remaining
            </span>
          </>
        )}
      </div>

      {/* Face grid — auto-fill, cards fill available width */}
      <div
        className="grid gap-x-5 gap-y-7"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
        {detectedFaces.map((face) => {
          const assignedMember =
            face.assignedPersonId ?
              members.find((m) => m.person_id === face.assignedPersonId)
            : null
          const assignedDisplayName =
            assignedMember ?
              displayNameMap.get(assignedMember.person_id) || assignedMember.name
            : null

          return (
            <div key={face.faceId} className="group flex flex-col gap-2">
              {/* Image — full bleed, rounded, no border */}
              <div className="relative aspect-square overflow-hidden rounded-xl">
                <img
                  src={face.previewUrl}
                  alt="Detected face"
                  className={`h-full w-full object-cover transition-all duration-300 ${
                    face.assignedPersonId ? "brightness-90" : "brightness-75"
                  }`}
                />

                {/* Quality warning — bottom overlay strip */}
                {!face.isAcceptable && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-amber-950/90 to-transparent px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-300">
                      <i className="fa-solid fa-triangle-exclamation text-[9px]" />
                      Low quality
                    </div>
                  </div>
                )}

                {/* Unassign on hover — subtle overlay button */}
                {face.assignedPersonId && (
                  <button
                    onClick={() => onUnassign(face.faceId)}
                    className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/40 group-hover:opacity-100">
                    <span className="text-[11px] font-semibold text-white/80">Change</span>
                  </button>
                )}
              </div>

              {/* Assignment label / dropdown — below image, no container */}
              {!face.assignedPersonId ?
                <MemberAssignCombobox
                  availableMembers={availableMembers}
                  displayNameMap={displayNameMap}
                  totalMembersCount={members.length}
                  onSelect={(personId) => onAssignMember(face.faceId, personId)}
                />
              : <div className="flex items-center justify-between px-0.5">
                  <span className="truncate text-[12px] font-semibold text-white">
                    {assignedDisplayName}
                  </span>
                </div>
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}
