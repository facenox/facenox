import { memo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { RefObject } from "react"
import { SlidersHorizontal, Video } from "lucide-react"
import { Spinner } from "@/components/common"
import { Tooltip } from "@/components/shared"
import { ActiveHeadTurnGuide } from "./ActiveHeadTurnGuide"
import { useDetectionStore, useUIStore } from "@/components/main/stores"
import { ALL_GROUPS_ID } from "@/components/main/hooks/useAttendanceGroups"
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
  currentGroup = null,
  enableSpoofDetection = false,
  maxRecognitionFacesPerFrame = 5,
}: VideoCanvasProps) {
  const [showSettings, setShowSettings] = useState(false)
  const currentDetections = useDetectionStore((s) => s.currentDetections)
  const requestOpenSettings = useUIStore((s) => s.requestOpenSettings)

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

  const format12hTime = (timeStr?: string | null) => {
    if (!timeStr) return "08:00 AM"
    try {
      const [hours, minutes] = timeStr.split(":").map(Number)
      const period = hours >= 12 ? "PM" : "AM"
      const displayHours = hours % 12 || 12
      return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`
    } catch {
      return timeStr
    }
  }

  const isAllGroups = currentGroup?.id === ALL_GROUPS_ID || currentGroup?.id === "all"
  const attendanceMode =
    currentGroup?.settings?.attendance_mode ??
    (currentGroup?.settings?.track_checkout ? "work_hours" : "attendance")
  const attendanceModeLabel =
    attendanceMode === "work_hours" ? "Time in & time out"
    : attendanceMode === "visits" ? "Visits"
    : "Attendance"

  const tooltipContent =
    currentGroup ?
      <div className="flex min-w-56 flex-col gap-1.5 p-1 text-[11px] text-white/60 select-none">
        <div className="mb-0.5 text-[10px] font-bold tracking-wider text-white/30 uppercase">
          Active settings
        </div>

        {/* 1. Late Tracking */}
        <div className="flex items-center justify-between gap-4">
          <span>Late tracking</span>
          <span className="text-right font-mono font-medium text-white/85">
            {isAllGroups ?
              <span className="font-sans text-white/70">Per-group</span>
            : currentGroup.settings?.late_threshold_enabled ?
              (currentGroup.settings?.late_threshold_minutes ?? 0) > 0 ?
                `${format12hTime(currentGroup.settings?.class_start_time)} (+${currentGroup.settings?.late_threshold_minutes}m)`
              : `${format12hTime(currentGroup.settings?.class_start_time)} (Exact)`
            : <span className="font-sans text-white/40">Disabled</span>}
          </span>
        </div>

        {/* 2. Attendance mode */}
        <div className="flex items-center justify-between gap-4">
          <span>Mode</span>
          <span className="text-right font-medium text-white/85">
            {isAllGroups ?
              <span className="font-sans text-white/70">Per-group</span>
            : attendanceModeLabel}
          </span>
        </div>

        {/* 3. Mode-specific timing */}
        <div className="flex items-center justify-between gap-4">
          <span>
            {isAllGroups ?
              "Time in & time out"
            : attendanceMode === "visits" ?
              "Minimum visit duration"
            : "Time in & time out"}
          </span>
          <span className="text-right font-mono font-medium text-white/85">
            {isAllGroups ?
              <span className="font-sans text-white/70">Per-group</span>
            : attendanceMode === "work_hours" ?
              currentGroup.settings?.class_end_time ?
                `Enabled (${format12hTime(currentGroup.settings.class_end_time)})`
              : "Enabled"
            : attendanceMode === "visits" ?
              `${currentGroup.settings?.min_checkout_delay_minutes ?? 15}m minimum`
            : <span className="font-sans text-white/40">Not used</span>}
          </span>
        </div>

        {attendanceMode === "work_hours" && !isAllGroups && (
          <div className="flex items-center justify-between gap-4">
            <span>Minimum time before Time out</span>
            <span className="text-right font-medium text-white/85">
              {currentGroup.settings?.min_checkout_delay_minutes ?? 15}m
            </span>
          </div>
        )}

        {/* 4. Recognition Limit */}
        <div className="flex items-center justify-between gap-4">
          <span>Face limit</span>
          <span className="text-right font-medium text-white/85">
            {maxRecognitionFacesPerFrame > 0 ? `${maxRecognitionFacesPerFrame} faces` : "Unlimited"}
          </span>
        </div>

        {/* 5. Anti-Spoofing */}
        <div className="flex items-center justify-between gap-4">
          <span>Anti-spoofing</span>
          <span className="text-right font-medium text-white/85">
            {enableSpoofDetection ? "Enabled" : <span className="text-white/40">Disabled</span>}
          </span>
        </div>
      </div>
    : null

  const emptyStateText =
    !isShellReady ? "Loading groups and settings…"
    : hasSelectedGroup ?
      !hasMembers ? "Add and enroll at least one member to start scanning."
      : !hasEnrolledFaces ? "Enroll at least one member to start scanning."
      : null
    : hasGroups ? "Select a group to start scanning."
    : "Create a group to start scanning."

  return (
    <div
      role="region"
      aria-label="Live camera feed and face recognition canvas"
      className="relative h-full min-h-65 w-full overflow-hidden rounded-lg border border-white/10 bg-[var(--bg-canvas)]">
      <video
        ref={videoRef}
        aria-label="Local camera capture feed"
        className={`absolute inset-0 h-full w-full bg-[var(--bg-canvas)] ${
          quickSettings.cameraFitCover ? "object-cover" : "object-contain"
        } transition-opacity duration-300 ${
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
        <Tooltip content="Adjust scheduled start time" position="top">
          <button
            type="button"
            onClick={() => requestOpenSettings("group", "settings")}
            className="animate-in fade-in zoom-in-95 group absolute right-4 bottom-4 z-50 flex cursor-pointer items-center gap-3.5 rounded-lg border border-white/10 bg-[#0f1011]/85 px-3.5 py-1.5 shadow-2xl shadow-black/40 backdrop-blur-md transition-all hover:border-white/20 hover:bg-[#141518]/95 active:scale-95">
            <div className="flex flex-col items-start text-left">
              <span className="text-[9px] font-bold tracking-wider text-white/45 uppercase transition-colors group-hover:text-white/65">
                Start time
              </span>
              <span
                className={`font-mono text-xs font-bold ${outdated ? "text-amber-400/90 group-hover:text-amber-300" : "text-cyan-400/90 group-hover:text-cyan-300"}`}>
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
              <div className="flex items-center">
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-amber-400 uppercase transition-colors group-hover:bg-amber-500/25">
                  Outdated
                </span>
              </div>
            )}
          </button>
        </Tooltip>
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
                    <Video className="h-16 w-16 animate-pulse text-white/55" strokeWidth={1.5} />
                  </div>
                  {emptyStateText && (
                    <div className="absolute top-full left-1/2 mt-4 flex w-max max-w-xl -translate-x-1/2 flex-col items-center gap-3 px-6 text-center text-xs text-white/65">
                      <p className="text-white/65">{emptyStateText}</p>
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
              <SlidersHorizontal className="size-3.5" />
            </div>

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.1, ease: "easeOut" }}
                  className="absolute top-full right-0 z-50 pt-1.5">
                  <div className="rounded-lg border border-white/10 bg-[#141518] p-2.5 shadow-2xl backdrop-blur-md">
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
