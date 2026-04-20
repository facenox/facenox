import { useMemo } from "react"

interface MemberAvatarProps {
  name: string
  id: string
}

const COLORS = [
  "bg-white/5 text-white/60 border-white/10",
  "bg-white/10 text-white/70 border-white/10",
  "bg-zinc-800 text-zinc-400 border-white/5",
  "bg-slate-800 text-slate-400 border-white/5",
]

export function MemberAvatar({ name, id }: MemberAvatarProps) {
  const initials = useMemo(() => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase()
  }, [name])

  const colorClass = useMemo(() => {
    // Simple hash to get a consistent color for the same ID
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash)
    }
    return COLORS[Math.abs(hash) % COLORS.length]
  }, [id])

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-black tracking-tighter ${colorClass}`}>
      {initials}
    </div>
  )
}
