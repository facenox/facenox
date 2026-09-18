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
    <div className="flex items-center justify-between">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Groups</p>
        <div className="flex items-baseline justify-center">
          <span className="text-3xl font-medium tracking-tight text-cyan-400">{groupsCount}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Members</p>
        <div className="flex min-h-10 items-baseline justify-center">
          {renderStatValue(totalMembers)}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Enrolled</p>
        <div className="flex min-h-10 items-baseline justify-center">
          {renderStatValue(totalPersons)}
        </div>
      </div>
    </div>
  )
}
