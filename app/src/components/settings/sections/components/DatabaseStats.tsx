interface DatabaseStatsProps {
  groupsCount: number
  totalMembers: number | null
  totalPersons: number | null
}

export function DatabaseStats({ groupsCount, totalMembers, totalPersons }: DatabaseStatsProps) {
  const renderStatValue = (value: number | null) => {
    if (value !== null) {
      return <span className="text-3xl font-medium tracking-tight text-cyan-400">{value}</span>
    }

    return <div className="h-10 w-14 animate-pulse rounded-md bg-white/5" />
  }

  return (
    <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-[12px] font-medium tracking-wider text-white/50 uppercase">
          Total Groups
        </p>
        <div className="flex items-baseline">
          <span className="text-3xl font-medium tracking-tight text-cyan-400">{groupsCount}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-[12px] font-medium tracking-wider text-white/50 uppercase">
          Total Members
        </p>
        <div className="flex min-h-10 items-baseline">{renderStatValue(totalMembers)}</div>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-[12px] font-medium tracking-wider text-white/50 uppercase">
          Registered Faces
        </p>
        <div className="flex min-h-10 items-baseline">{renderStatValue(totalPersons)}</div>
      </div>
    </div>
  )
}
