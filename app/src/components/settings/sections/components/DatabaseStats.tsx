interface DatabaseStatsProps {
  groupsCount: number
  totalMembers: number
  totalPersons: number
}

export function DatabaseStats({ groupsCount, totalMembers, totalPersons }: DatabaseStatsProps) {
  return (
    <div className="grid shrink-0 grid-cols-1 divide-x divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-[rgba(12,16,22,0.96)] sm:grid-cols-3">
      <div className="flex flex-col gap-3 px-10 py-6">
        <p className="text-[11px] font-bold tracking-wider text-white/35 uppercase">Total Groups</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight text-white">{groupsCount}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-10 py-6">
        <p className="text-[11px] font-bold tracking-wider text-white/35 uppercase">
          Total Members
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight text-white">{totalMembers}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-10 py-6">
        <p className="text-[11px] font-bold tracking-wider text-white/35 uppercase">
          Registered Faces
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight text-white">{totalPersons}</span>
        </div>
      </div>
    </div>
  )
}
