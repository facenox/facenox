import { Camera } from "lucide-react"

export function AppSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#08090a]">
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="m-4 flex flex-1 items-center justify-center rounded-3xl border border-white/6 bg-[#0f1011]">
            <div className="flex flex-col items-center gap-4 text-white/20">
              <Camera className="size-10 text-white/20" />
            </div>
          </div>

          <div className="mx-4 mb-4 flex min-h-16 items-center justify-between gap-4">
            <div className="h-10 w-48 rounded-lg border border-white/10 bg-white/[0.04]" />

            <div className="h-10 w-40 rounded-lg border border-white/10 bg-white/5" />
          </div>
        </div>

        <div className="flex w-[360px] flex-col gap-4 border-l border-white/6 bg-[#0f1011] p-4">
          <div className="h-10 w-full rounded-lg bg-white/[0.04]" />
          <div className="h-32 w-full rounded-lg border border-white/6 bg-white/[0.02]" />
          <div className="w-full flex-1 rounded-lg border border-white/6 bg-white/[0.02] opacity-65" />
        </div>
      </div>
    </div>
  )
}
