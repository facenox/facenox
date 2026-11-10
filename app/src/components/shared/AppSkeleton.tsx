import { memo } from "react"
import { Video } from "lucide-react"
import { useUIStore } from "@/components/main/stores/uiStore"

export const AppSkeleton = memo(function AppSkeleton() {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const isCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const currentWidth = isCollapsed ? 48 : sidebarWidth || 300

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-primary)] text-white">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
            <div className="relative flex h-full min-h-65 w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[var(--bg-canvas)]">
              <div className="flex h-16 w-16 items-center justify-center">
                <Video className="h-16 w-16 animate-pulse text-white/55" strokeWidth={1.5} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex min-h-16 items-center justify-between gap-4 rounded-lg p-3 pt-0">
              <div className="h-9 w-48 rounded-lg border border-white/5 bg-white/5" />
              <div className="h-10 min-w-28 rounded-lg border border-white/10 bg-[#141518]" />
            </div>
          </div>
        </div>

        <div
          className="relative z-50 flex h-full flex-col overflow-hidden border-l border-white/10 bg-[#0f1011]"
          style={{
            width: `${currentWidth}px`,
            minWidth: `${currentWidth}px`,
            maxWidth: `${currentWidth}px`,
          }}>
          <div
            className={`border-b border-white/10 px-2 py-1 transition-opacity duration-200 ${isCollapsed ? "pointer-events-none opacity-0" : "opacity-100"}`}
            style={{ minWidth: currentWidth }}>
            <div className="flex items-center justify-between gap-2">
              <div className="h-8 w-8 rounded-lg bg-white/[0.04]" />
              <div className="h-8 w-8 rounded-lg bg-white/[0.04]" />
            </div>
          </div>

          {!isCollapsed && (
            <div
              className="sidebar relative flex min-h-0 flex-1 flex-col"
              style={{ minWidth: currentWidth }}>
              <div className="shrink-0 px-2 pt-2 pb-1">
                <div className="flex items-center gap-0">
                  <div className="h-9 flex-1 rounded-l-lg border border-r-0 border-white/10 bg-white/5" />
                  <div className="h-9 w-9 border border-r-0 border-white/10 bg-white/5" />
                  <div className="h-9 w-9 rounded-r-lg border border-white/10 bg-white/5" />
                </div>
              </div>

              <div className="hover-scrollbar flex min-h-0 flex-1 flex-col space-y-0.5 overflow-y-auto pt-1 pr-0 pl-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg px-2.5 py-1.5">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="h-3.5 flex-1 rounded bg-white/7" />
                      <div className="h-5 w-16 rounded-full border border-white/10 bg-white/5" />
                      <div className="h-3 w-12 rounded bg-white/7" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
