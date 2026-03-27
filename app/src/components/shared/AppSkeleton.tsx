export function AppSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-primary)]">
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="m-4 flex flex-1 items-center justify-center rounded-3xl border border-white/6 bg-[rgba(18,22,29,0.9)]">
            <div className="flex flex-col items-center gap-4 text-white/20">
              <i className="fa-solid fa-camera text-4xl" />
            </div>
          </div>

          <div className="mx-4 mb-4 flex min-h-16 items-center justify-between gap-4">
            <div className="h-10 w-48 rounded-lg border border-white/10 bg-[rgba(22,28,36,0.7)]" />

            <div className="h-10 w-40 rounded-lg border border-cyan-500/20 bg-cyan-500/10" />
          </div>
        </div>

        <div className="flex w-[360px] flex-col gap-4 border-l border-white/6 bg-[rgba(15,19,25,0.92)] p-4">
          <div className="h-10 w-full rounded-lg bg-[rgba(22,28,36,0.72)]" />
          <div className="h-32 w-full rounded-lg border border-white/6 bg-[rgba(18,22,29,0.9)]" />
          <div className="w-full flex-1 rounded-lg border border-white/6 bg-[rgba(18,22,29,0.9)] opacity-65" />
        </div>
      </div>
    </div>
  )
}
