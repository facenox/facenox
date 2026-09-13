import { useMemo, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MemberTooltip } from "@/components/shared"
import { createDisplayNameMap } from "@/utils"
import type { DetectionResult, TrackedFace } from "@/components/main/types"
import type { AttendanceMember } from "@/types/recognition"
import type { ExtendedFaceRecognitionResponse } from "@/components/main/utils"
import { useAttendanceStore } from "@/components/main/stores"

interface DetectionPanelProps {
  currentDetections: DetectionResult | null
  currentRecognitionResults: Map<number, ExtendedFaceRecognitionResponse>
  recognitionEnabled: boolean
  trackedFaces: Map<string, TrackedFace>
  groupMembers: AttendanceMember[]
  isStreaming: boolean
  isVideoLoading: boolean
  persistentCooldowns: Map<string, { startTime: number }>
  currentGroupId?: string
}

const DetectionCard = memo(
  ({
    recognitionResult,
    isRecognized,
    displayName,
    member,
    trackedFace,
    isDone,
  }: {
    recognitionResult: ExtendedFaceRecognitionResponse | undefined
    isRecognized: boolean
    displayName: string
    member?: AttendanceMember | null
    trackedFace: TrackedFace | undefined
    isDone: boolean
  }) => {
    const hasConsent = recognitionResult?.has_consent !== false
    const isActive = trackedFace?.isLocked || isRecognized

    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={`group relative border-b border-l-2 border-white/5 py-2.5 pr-3 pl-4 transition-colors hover:bg-[rgba(22,28,36,0.52)] ${isActive ? "border-l-cyan-500/50" : "border-l-transparent"}`}
        style={
          isActive ?
            { background: "linear-gradient(to right, rgba(34, 211, 238, 0.06), transparent)" }
          : undefined
        }>
        <div className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <AnimatePresence mode="wait">
              {isRecognized ?
                hasConsent ?
                  <motion.div
                    key="recognized"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="min-w-0 flex-1">
                    <MemberTooltip member={member} position="right" role="Recognized">
                      <span className="block cursor-help truncate text-[13px] font-semibold text-white transition-colors hover:text-cyan-400">
                        {displayName}
                      </span>
                    </MemberTooltip>
                  </motion.div>
                : <motion.div
                    key="no-consent"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="flex items-center gap-1.5 opacity-80">
                    <i className="fa-solid fa-eye-slash text-xs text-indigo-400"></i>
                    <span className="text-[11px] font-bold tracking-tight text-indigo-400/90 uppercase">
                      No Consent
                    </span>
                  </motion.div>

              : <motion.span
                  key="searching"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex items-center gap-2 text-[13px] font-medium text-white/45">
                  <span className="inline-block h-2 w-[3px] shrink-0 animate-pulse rounded-[1px] bg-cyan-500/50" />
                  Searching...
                </motion.span>
              }
            </AnimatePresence>
          </div>

          <div className="flex min-h-5 shrink-0 items-center gap-2">
            <AnimatePresence>
              {isDone && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 18 }}
                  className="flex items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
                  <i className="fa-solid fa-check text-[10px]"></i>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    )
  },
)

DetectionCard.displayName = "DetectionCard"

export function DetectionPanel({
  currentDetections,
  currentRecognitionResults,
  recognitionEnabled,
  trackedFaces,
  groupMembers,
  isStreaming,
  isVideoLoading,
  persistentCooldowns,
  currentGroupId,
}: DetectionPanelProps) {
  const enableSpoofDetection = useAttendanceStore((state) => state.enableSpoofDetection)
  const displayNameMap = useMemo(() => {
    return createDisplayNameMap(groupMembers)
  }, [groupMembers])

  const trackedFacesArray = useMemo(() => Array.from(trackedFaces.values()), [trackedFaces])

  const memberMap = useMemo(() => {
    const map = new Map<string, AttendanceMember>()
    groupMembers.forEach((m) => map.set(m.person_id, m))
    return map
  }, [groupMembers])

  const filteredFaces = useMemo(() => {
    if (!currentDetections?.faces) return []

    const faces = currentDetections.faces

    // SILENT ANONYMOUS: Only include recognized faces in the sidebar
    return [...faces]
      .filter((f) => {
        const trackId = f.track_id!
        const rec = currentRecognitionResults.get(trackId)
        return (!enableSpoofDetection || f.liveness?.status === "real") && !!rec?.person_id
      })
      .sort((a, b) => {
        const aIsLive = a.liveness?.status === "real"
        const bIsLive = b.liveness?.status === "real"

        if (aIsLive && !bIsLive) return -1
        if (!aIsLive && bIsLive) return 1
        return 0
      })
  }, [currentDetections, currentRecognitionResults, enableSpoofDetection])

  const hasDetections = filteredFaces.length > 0

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {!hasDetections ?
        <motion.div
          key="scanner-placeholder"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="flex min-h-0 w-full flex-1 items-center justify-center pl-[10px]">
          <div className="relative flex flex-col items-center">
            <div className="relative h-20 w-20">
              <div
                className={`absolute inset-0 rounded-xl border transition-all duration-300 ${
                  isStreaming || isVideoLoading ?
                    "ai-pulse-ring border-cyan-500/30"
                  : "border-white/20"
                }`}
              />

              <div className="absolute inset-1 overflow-hidden rounded-lg">
                <AnimatePresence mode="wait">
                  {isVideoLoading ?
                    <motion.div
                      key="loading-spinner"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 flex items-center justify-center">
                      <div className="h-8 w-8 rounded-full border border-cyan-500/20">
                        <div className="h-full w-full animate-spin rounded-full border-t border-cyan-400/60"></div>
                      </div>
                    </motion.div>
                  : isStreaming ?
                    <motion.div
                      key="scan-active"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0">
                      <div className="ai-scan-line absolute right-0 left-0 h-0.5 bg-linear-to-r from-transparent via-cyan-400 to-transparent" />
                    </motion.div>
                  : <motion.svg
                      key="camera-idle"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                      className="h-full w-full animate-pulse p-4 text-white/55"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14m-10 4h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </motion.svg>
                  }
                </AnimatePresence>
              </div>

              <div
                className={`absolute top-0 left-0 h-3 w-3 rounded-tl-lg border-t-2 border-l-2 transition-all duration-300 ${
                  isStreaming || isVideoLoading ? "border-cyan-400/40" : "border-white/20"
                }`}
              />
              <div
                className={`absolute top-0 right-0 h-3 w-3 rounded-tr-lg border-t-2 border-r-2 transition-all duration-300 ${
                  isStreaming || isVideoLoading ? "border-cyan-400/40" : "border-white/20"
                }`}
              />
              <div
                className={`absolute bottom-0 left-0 h-3 w-3 rounded-bl-lg border-b-2 border-l-2 transition-all duration-300 ${
                  isStreaming || isVideoLoading ? "border-cyan-400/40" : "border-white/20"
                }`}
              />
              <div
                className={`absolute right-0 bottom-0 h-3 w-3 rounded-br-lg border-r-2 border-b-2 transition-all duration-300 ${
                  isStreaming || isVideoLoading ? "border-cyan-400/40" : "border-white/20"
                }`}
              />
            </div>
          </div>
        </motion.div>
      : <motion.div
          key="detections-list"
          role="region"
          aria-live="polite"
          aria-label="Real-time facial detection and recognition results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="w-full py-0">
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredFaces.map((face) => {
              const trackId = face.track_id!
              const recognitionResult = currentRecognitionResults.get(trackId)
              const isRecognized = recognitionEnabled && !!recognitionResult?.person_id
              const displayName =
                recognitionResult?.person_id ?
                  displayNameMap.get(recognitionResult.person_id) || "Unknown"
                : ""

              const trackedFace = trackedFacesArray.find(
                (track) =>
                  track.personId === recognitionResult?.person_id ||
                  (Math.abs(track.bbox.x - face.bbox.x) < 30 &&
                    Math.abs(track.bbox.y - face.bbox.y) < 30),
              )

              const cooldownKey =
                recognitionResult?.person_id && currentGroupId ?
                  `${recognitionResult.person_id}-${currentGroupId}`
                : null
              const isDone = !!(cooldownKey && persistentCooldowns.has(cooldownKey))

              return (
                <DetectionCard
                  key={trackId}
                  recognitionResult={recognitionResult}
                  isRecognized={isRecognized}
                  displayName={displayName}
                  member={
                    recognitionResult?.person_id ? memberMap.get(recognitionResult.person_id) : null
                  }
                  trackedFace={trackedFace}
                  isDone={isDone}
                />
              )
            })}
          </AnimatePresence>
        </motion.div>
      }
    </AnimatePresence>
  )
}
