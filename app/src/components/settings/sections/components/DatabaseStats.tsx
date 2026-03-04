interface DatabaseStatsProps {
  groupsCount: number;
  totalMembers: number;
  totalPersons: number;
}

export function DatabaseStats({
  groupsCount,
  totalMembers,
  totalPersons,
}: DatabaseStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 border border-white/5 bg-[#0a0a0b] rounded-lg overflow-hidden divide-x divide-white/5 flex-shrink-0">
      <div className="flex flex-col gap-3 py-6 px-10">
        <p className="text-[11px] font-bold text-white/40 uppercase tracking-tight">
          Total Groups
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold text-white tracking-tight">
            {groupsCount}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 py-6 px-10">
        <p className="text-[11px] font-bold text-white/40 uppercase tracking-tight">
          Total Members
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold text-white tracking-tight">
            {totalMembers}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 py-6 px-10">
        <p className="text-[11px] font-bold text-white/40 uppercase tracking-tight">
          Registered Faces
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold text-white tracking-tight">
            {totalPersons}
          </span>
        </div>
      </div>
    </div>
  );
}
