import { memo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { RefObject } from "react"
import { Spinner } from "@/components/common"
import { StartTimeChip } from "./StartTimeChip"
import { ActiveHeadTurnGuide } from "./ActiveHeadTurnGuide"
import { useDetectionStore } from "@/components/main/stores"
import type { QuickSettings } from "@/components/settings"
import type { AttendanceGroup } from "@/types/recognition"

interface VideoCanvasProps {
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>
  quickSettings: QuickSettings
  isVideoLoading: boolean
  isStreaming: boolean
  isShellReady: boolean
  hasSelectedGroup: boolean
  hasEnrolledFaces: boolean
  hasGroups?: boolean
  hasMembers?: boolean
  lateTrackingEnabled?: boolean
  classStartTime?: string | null
  onStartTimeChange?: (newTime: string) => void
  currentGroup?: AttendanceGroup | null
  enableSpoofDetection?: boolean
  attendanceCooldownSeconds?: number
  maxRecognitionFacesPerFrame?: number
}

export const VideoCanvas = memo(function VideoCanvas({
  videoRef,
  canvasRef,
  overlayCanvasRef,
  quickSettings,
  isVideoLoading,
  isStreaming,
  isShellReady,
  hasSelectedGroup,
  hasEnrolledFaces,
  hasGroups = false,
  hasMembers = false,
  lateTrackingEnabled,
  classStartTime = null,
  onStartTimeChange,
  currentGroup = null,
  enableSpoofDetection = false,
  attendanceCooldownSeconds = 30,
  maxRecognitionFacesPerFrame = 5,
}: VideoCanvasProps) {
  const [showSettings, setShowSettings] = useState(false)
  const currentDetections = useDetectionStore((s) => s.currentDetections)

  const isHeadTurnPromptActive = Boolean(
    isStreaming &&
    enableSpoofDetection &&
    currentDetections?.faces?.some(
      (f) =>
        !f.liveness?.is_real &&
        (f.overlayGuidance?.subLabel === "Slowly turn head" ||
          (f.liveness?.status === "candidate_real" &&
            f.liveness?.message?.toLowerCase().includes("turn"))),
    ),
  )

  const formatCooldown = (secs: number) => {
    if (secs < 60) return `${secs}s`
    return `${secs / 60}m`
  }

  const tooltipContent =
    currentGroup ?
      <div className="flex min-w-48 flex-col gap-1.5 p-1 text-[11px] text-white/60 select-none">
        <div className="mb-0.5 text-[10px] font-bold tracking-wider text-white/30 uppercase">
          Active Settings
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Entry & Exit</span>
          <span className="text-right font-medium text-white/80">
            {currentGroup.settings?.track_checkout ? "Track check-outs" : "Arrivals only"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Late Tracking</span>
          <span className="text-right font-medium text-white/80">
            {currentGroup.settings?.late_threshold_enabled ?
              `${currentGroup.settings?.late_threshold_minutes}m`
            : "Disabled"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Duplicate Prevention</span>
          <span className="text-right font-medium text-white/80">
            {formatCooldown(attendanceCooldownSeconds)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Recognition Limit</span>
          <span className="text-right font-medium text-white/80">
            {maxRecognitionFacesPerFrame > 0 ? maxRecognitionFacesPerFrame : "Unlimited"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Liveness Verification</span>
          <span className="text-right font-medium text-white/80">
            {enableSpoofDetection ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>
    : null

  const isTimeOutdated = (): boolean => {
    try {
      if (!lateTrackingEnabled || !classStartTime) return false
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

  const emptyStateText =
    !isShellReady ? "Loading groups and settings..."
    : hasSelectedGroup ?
      !hasMembers ? "Add and enroll at least one member to start scanning."
      : !hasEnrolledFaces ? "Enroll at least one member to start scanning."
      : null
    : hasGroups ? "Select a group to begin."
    : "Create a group to begin."

  return (
    <div
      role="region"
      aria-label="Live camera feed and face recognition canvas"
      className="relative h-full min-h-65 w-full overflow-hidden rounded-lg border border-white/10 bg-[var(--bg-canvas)]">
      <video
        ref={videoRef}
        aria-label="Real-time camera capture feed"
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
          isStreaming && !isVideoLoading ? "opacity-100" : "opacity-0"
        } ${quickSettings.cameraMirrored ? "scale-x-[-1]" : ""}`}
        playsInline
        muted
      />
      <canvas
        ref={overlayCanvasRef}
        role="img"
        aria-label="Face detection bounding box and liveness verification overlay"
        className="pointer-events-none absolute top-0 left-0 z-10 h-full w-full"
        style={{
          mixBlendMode: "normal",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-0 h-full w-full opacity-0"
      />

      {/* 3D Head Turn Guidance Animation for Active Liveness Challenge */}
      <ActiveHeadTurnGuide active={isHeadTurnPromptActive} />

      {isStreaming && lateTrackingEnabled && (
        <div
          className={`animate-in fade-in zoom-in-95 pointer-events-none absolute right-4 bottom-4 z-50 flex items-center gap-3.5 rounded-lg border bg-[rgba(10,13,18,0.72)] px-3.5 py-1.5 shadow-2xl shadow-black/40 transition-colors duration-500 ${outdated ? "border-amber-500/30" : "border-white/10"}`}>
          <div className="flex flex-col items-start">
            <span className="text-[9px] font-bold tracking-wider text-white/45 uppercase">
              Start Time
            </span>
            <span
              className={`font-mono text-xs font-bold ${outdated ? "text-amber-400/90" : "text-cyan-400/90"}`}>
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
            <div className="flex items-center border-l border-white/10 pl-3">
              <span className="animate-pulse text-[9px] font-bold text-amber-500/80 uppercase">
                Outdated
              </span>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {(!isStreaming || isVideoLoading) && (
          <motion.div
            key="placeholder-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-0 z-15 flex items-center justify-center bg-[var(--bg-canvas)]">
            <AnimatePresence mode="wait">
              {isVideoLoading ?
                <motion.div
                  key="canvas-loader"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col items-center justify-center">
                  <Spinner size="lg" color="cyan" />
                </motion.div>
              : <motion.div
                  key="canvas-idle-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="relative flex flex-col items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center">
                    <svg
                      className="h-16 w-16 animate-pulse text-white/55"
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
                  {(emptyStateText ||
                    (hasSelectedGroup &&
                      hasEnrolledFaces &&
                      onStartTimeChange &&
                      lateTrackingEnabled)) && (
                    <div className="absolute top-full left-1/2 mt-4 flex w-max max-w-xl -translate-x-1/2 flex-col items-center gap-3 px-6 text-center text-xs text-white/65">
                      {emptyStateText && <p className="text-white/65">{emptyStateText}</p>}

                      {hasSelectedGroup &&
                        hasEnrolledFaces &&
                        onStartTimeChange &&
                        lateTrackingEnabled && (
                          <div className="pointer-events-auto">
                            <StartTimeChip
                              startTime={classStartTime}
                              onTimeChange={onStartTimeChange}
                            />
                          </div>
                        )}
                    </div>
                  )}
                </motion.div>
              }
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isStreaming && currentGroup && tooltipContent && (
          <motion.div
            key="settings-info-btn"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-4 right-4 z-50 h-7 w-7"
            onMouseEnter={() => setShowSettings(true)}
            onMouseLeave={() => setShowSettings(false)}>
            <div
              className={`flex h-full w-full cursor-help items-center justify-center transition-all select-none ${showSettings ? "text-white/65" : "text-white/25 hover:text-white/65"}`}>
              <i className="fa-solid fa-sliders text-xs" />
            </div>

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
                  className="absolute top-full right-0 z-50 pt-1.5">
                  <div className="rounded-lg border border-white/10 bg-[rgba(15,19,25,0.98)] p-2.5 shadow-2xl backdrop-blur-md">
                    {tooltipContent}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
})
