import { useMemo } from "react"
import type { AttendanceMember } from "@/types/recognition"
import { generateDisplayNames } from "@/utils"

interface MemberSidebarProps {
  members: AttendanceMember[]
  selectedMemberId: string
  onSelectMember: (id: string) => void
  memberSearch: string
  setMemberSearch: (val: string) => void
  registrationFilter: "all" | "registered" | "non-registered"
  setRegistrationFilter: (val: "all" | "registered" | "non-registered") => void
  memberStatus: Map<string, boolean>
  onRemoveFaceData: (member: AttendanceMember & { displayName: string }) => void
}

export function MemberSidebar({
  members,
  selectedMemberId,
  onSelectMember,
  memberSearch,
  setMemberSearch,
  registrationFilter,
  setRegistrationFilter,
  memberStatus,
  onRemoveFaceData,
}: MemberSidebarProps) {
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
        const isRegistered = memberStatus.get(member.person_id) ?? false
        return registrationFilter === "registered" ? isRegistered : !isRegistered
      })
    }

    result = [...result].sort((a, b) => {
      const aRegistered = memberStatus.get(a.person_id) ?? false
      const bRegistered = memberStatus.get(b.person_id) ?? false

      if (aRegistered && !bRegistered) return -1
      if (!aRegistered && bRegistered) return 1
      return 0
    })

    return result
  }, [memberSearch, membersWithDisplayNames, registrationFilter, memberStatus])

  return (
    <div className="flex h-full min-h-0 flex-col space-y-3 overflow-hidden p-6">
      <div className="flex shrink-0 items-center gap-3">
        <div className="relative flex-1">
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
            className="w-full rounded-xl border border-white/10 bg-[rgba(22,28,36,0.68)] py-2.5 pr-3 pl-10 text-[11px] font-medium text-white transition-all duration-300 outline-none placeholder:text-white/30 focus:border-cyan-500/30 focus:bg-[rgba(28,35,44,0.82)] focus:ring-4 focus:ring-cyan-500/10"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2">
        {members.length > 0 && filteredMembers.length > 0 && (
          <div className="text-[11px] font-medium text-white/40">
            Showing {filteredMembers.length} of {members.length} member
            {members.length !== 1 ? "s" : ""}
            {registrationFilter !== "all" && (
              <span className="ml-1 text-white/30">
                ({registrationFilter === "registered" ? "registered" : "needs registration"})
              </span>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setRegistrationFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              registrationFilter === "all" ?
                "border border-white/20 bg-[rgba(28,35,44,0.82)] text-white"
              : "border border-white/10 bg-[rgba(22,28,36,0.68)] text-white/40 hover:bg-[rgba(28,35,44,0.82)] hover:text-white/80"
            }`}>
            All
          </button>
          <button
            onClick={() => setRegistrationFilter("non-registered")}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              registrationFilter === "non-registered" ?
                "border border-amber-500/30 bg-amber-500/20 text-amber-200"
              : "border border-white/10 bg-[rgba(22,28,36,0.68)] text-white/40 hover:bg-[rgba(28,35,44,0.82)] hover:text-white/80"
            }`}>
            Unregistered
          </button>
          <button
            onClick={() => setRegistrationFilter("registered")}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
              registrationFilter === "registered" ?
                "border border-cyan-500/30 bg-cyan-500/20 text-cyan-200"
              : "border border-white/10 bg-[rgba(22,28,36,0.68)] text-white/40 hover:bg-[rgba(28,35,44,0.82)] hover:text-white/80"
            }`}>
            Registered
          </button>
        </div>
      </div>

      <div className="custom-scroll min-h-0 flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto">
        {members.length === 0 && (
          <div className="w-full rounded-lg border border-dashed border-white/10 bg-[rgba(22,28,36,0.44)] px-3 py-12 text-center">
            <div className="text-xs text-white/40">No members yet</div>
          </div>
        )}

        {members.length > 0 && filteredMembers.length === 0 && (
          <div className="w-full rounded-lg border border-white/10 bg-[rgba(22,28,36,0.62)] px-3 py-6 text-center">
            <div className="mx-auto max-w-[200px] text-[11px] leading-relaxed font-medium text-white/40">
              {memberSearch.trim() ?
                `No results for "${memberSearch}"`
              : registrationFilter === "registered" ?
                "No registered members yet"
              : registrationFilter === "non-registered" ?
                "All members are already registered"
              : "No members found"}
            </div>
          </div>
        )}

        {filteredMembers.map((member) => {
          const isSelected = selectedMemberId === member.person_id
          const isRegistered = memberStatus.get(member.person_id) ?? false
          return (
            <div
              key={member.person_id}
              className={`group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-xl border px-4 py-4 transition-all duration-300 ${
                isSelected ?
                  "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                : "border-white/10 bg-[rgba(17,22,29,0.96)] hover:bg-[rgba(22,28,36,0.52)]"
              }`}>
              <div className="relative z-10 min-w-0 flex-1 text-left">
                <div
                  className={`mb-1 text-[15px] font-bold tracking-tight transition-colors ${
                    isSelected ? "text-cyan-100" : "text-white"
                  }`}>
                  {member.displayName}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {member.role ?
                    <div
                      className={`flex items-center gap-1.5 text-[11px] font-medium ${
                        isSelected ? "text-cyan-300/60" : "text-white/40"
                      }`}>
                      <i className="fa-solid fa-briefcase text-[10px]"></i>
                      {member.role}
                    </div>
                  : <div
                      className={`text-[11px] font-medium italic ${
                        isSelected ? "text-cyan-300/30" : "text-white/20"
                      }`}>
                      Member
                    </div>
                  }
                </div>
              </div>

              <div className="relative z-10 flex shrink-0 items-center gap-3">
                {!isRegistered ?
                  <button
                    onClick={() => onSelectMember(member.person_id)}
                    className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-400 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/20 active:scale-95">
                    Register
                  </button>
                : <button
                    onClick={() => onSelectMember(member.person_id)}
                    className="group/btn relative flex items-center gap-1.5 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-3 py-1.5 text-[11px] font-semibold text-white/40 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400">
                    <i className="fa-solid fa-check text-[10px] transition-all duration-300 group-hover/btn:absolute group-hover/btn:scale-75 group-hover/btn:opacity-0"></i>
                    <i className="fa-solid fa-rotate-right absolute scale-75 text-[11px] opacity-0 transition-all duration-300 group-hover/btn:relative group-hover/btn:scale-100 group-hover/btn:opacity-100"></i>
                    <span className="transition-all duration-300 group-hover/btn:hidden">
                      Registered
                    </span>
                    <span className="hidden transition-all duration-300 group-hover/btn:inline">
                      Re-register
                    </span>
                  </button>
                }
              </div>

              {isRegistered && isSelected && (
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveFaceData(member)
                  }}
                  className="absolute right-0 bottom-0 left-0 z-20 cursor-pointer bg-red-500/10 py-1.5 text-center text-[10px] font-bold text-red-300/80 transition-all hover:bg-red-500/20">
                  Remove Face Data
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
