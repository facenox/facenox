interface StatsCardProps {
  type: "present" | "absent" | "late" | "active"
  value: number | string
  total?: number
  label?: string
  disabled?: boolean
}

export function StatsCard({ type, value, total, label, disabled }: StatsCardProps) {
  return (
    <div className={`flex flex-col gap-3 py-6 ${disabled ? "opacity-40 grayscale" : ""}`}>
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-black tracking-wider text-white/38 uppercase">{label}</p>
        {disabled && (
          <span className="rounded bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-[9px] font-bold text-white/40 uppercase">
            Disabled
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tracking-tight text-white">
          {disabled ? "-" : (value ?? 0)}
        </span>
        {!disabled && total !== undefined && (type === "present" || type === "absent") && (
          <span className="text-xl font-bold text-white/40">/ {total}</span>
        )}
      </div>
    </div>
  )
}
