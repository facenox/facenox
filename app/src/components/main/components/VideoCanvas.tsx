import { memo } from "react"
import type { RefObject } from "react"
import { StartTimeChip } from "./StartTimeChip"
import type { QuickSettings } from "@/components/settings"

interface VideoCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>
  quickSettings: QuickSettings
  detectionFps: number
  isVideoLoading: boolean
  isStreaming: boolean
  hasSelectedGroup: boolean
  lateTrackingEnabled?: boolean
  classStartTime?: string
  onStartTimeChange?: (newTime: string) => void
}

export const VideoCanvas = memo(function VideoCanvas({
  videoRef,
  canvasRef,
  overlayCanvasRef,
  quickSettings,
  detectionFps,
  isVideoLoading,
  isStreaming,
  hasSelectedGroup,
  lateTrackingEnabled,
  classStartTime,
  onStartTimeChange,
}: VideoCanvasProps) {
  const isTimeOutdated = (): boolean => {
    try {
      if (!classStartTime) return false
      const [hours, minutes] = classStartTime.split(":").map(Number)
      const now = new Date()
      const setTime = new Date()
      setTime.setHours(hours, minutes, 0, 0)

      const diffMs = Math.abs(now.getTime() - setTime.getTime())
      const diffHours = diffMs / (1000 * 60 * 60)
      return diffHours > 6
    } catch {
      return false
    }
  }

  const outdated = isTimeOutdated()

  return (
    <div className="relative h-full min-h-65 w-full overflow-hidden rounded-lg border border-white/10 bg-black">
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-contain ${quickSettings.cameraMirrored ? "scale-x-[-1]" : ""}`}
        playsInline
        muted
      />
      <canvas
        ref={overlayCanvasRef}
        className="pointer-events-none absolute top-0 left-0 z-10 h-full w-full"
        style={{
          mixBlendMode: "normal",
        }}
      />
      {quickSettings.showFPS && detectionFps > 0 && (
        <div className="pointer-events-none absolute top-4 left-4 z-20 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
          <span className="text-sm font-medium text-white/80">{detectionFps.toFixed(1)} FPS</span>
        </div>
      )}

      {isStreaming && lateTrackingEnabled && (
        <div
          className={`animate-in fade-in zoom-in-95 pointer-events-none absolute right-4 bottom-4 z-50 flex items-center gap-4 rounded-full border bg-black/60 px-4 py-2 shadow-lg duration-500 ${outdated ? "border-amber-500/50" : "border-white/20"}`}>
          <div className="flex flex-col items-start">
            <span className="text-[9px] font-medium tracking-wider text-white/30 uppercase">
              Start Time
            </span>
            <span
              className={`font-mono text-xs font-bold ${outdated ? "text-amber-400" : "text-cyan-400"}`}>
              {classStartTime ?
                (() => {
                  const [hours, minutes] = classStartTime.split(":").map(Number)
                  const period = hours >= 12 ? "PM" : "AM"
                  const displayHours = hours % 12 || 12
                  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`
                })()
              : "08:00 AM"}
            </span>
          </div>
          {outdated && (
            <div className="flex items-center border-l border-white/10 pl-4">
              <span className="animate-pulse text-[9px] font-bold text-amber-500/80 uppercase">
                Outdated
              </span>
            </div>
          )}
        </div>
      )}

      {isVideoLoading && (
        <div className="pointer-events-none absolute inset-0 z-15 flex items-center justify-center bg-black/40">
          <div className="relative flex items-center justify-center">
            <div className="h-12 w-12 rounded-full border border-cyan-500/30">
              <div className="h-full w-full animate-spin rounded-full border-t-2 border-cyan-400"></div>
            </div>
          </div>
        </div>
      )}

      {!isStreaming && !isVideoLoading && (
        <div className="pointer-events-none absolute inset-0 z-15 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <div className="relative">
              <svg
                className="h-16 w-16 animate-pulse text-white/30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="relative flex max-w-sm flex-col items-center gap-4 text-xs text-white/60">
              <p>
                {hasSelectedGroup ?
                  "Select a camera, then press Start Tracking to begin attendance."
                : "Create a group or choose one to start tracking attendance."}
              </p>

              {hasSelectedGroup && onStartTimeChange && lateTrackingEnabled && (
                <div className="pointer-events-auto absolute top-full left-1/2 mt-4 -translate-x-1/2">
                  <StartTimeChip
                    startTime={classStartTime || "08:00"}
                    onTimeChange={onStartTimeChange}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
})
