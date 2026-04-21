import { Tooltip } from "@/components/shared"
import type { ReactNode } from "react"

interface StatsCardProps {
  type: "present" | "absent" | "late" | "active"
  value: number | string
  total?: number
  label?: string
  disabled?: boolean
  disabledTooltipText?: ReactNode
  tooltipText?: ReactNode
}

export function StatsCard({
  type,
  value,
  total,
  label,
  disabled,
  disabledTooltipText,
  tooltipText,
}: StatsCardProps) {
  const content = (
    <div
      className={`flex flex-col items-center gap-1.5 transition-opacity ${disabled ? "opacity-40 grayscale" : ""}`}>
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-bold tracking-wider text-white/50 uppercase">{label}</p>
        {disabled && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-tight text-white/40 uppercase">
            Disabled
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tracking-tight text-cyan-400">
          {disabled ? "-" : (value ?? 0)}
        </span>
        {!disabled && total !== undefined && (type === "present" || type === "absent") && (
          <span className="text-xl font-medium text-white/20">/ {total}</span>
        )}
      </div>
    </div>
  )

  const activeTooltip = disabled ? disabledTooltipText : tooltipText

  if (activeTooltip) {
    return (
      <Tooltip content={activeTooltip} position="top">
        <div className="cursor-help">{content}</div>
      </Tooltip>
    )
  }

  return content
}
