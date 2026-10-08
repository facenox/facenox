import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { attendanceManager, backendService } from "@/services"
import { generateDisplayNames } from "@/utils"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { useCamera } from "@/components/group/sections/enrollment/hooks/useCamera"
import { dataUrlToBlob } from "@/utils/dataUrl"
import { validateAndGetBestFace } from "@/utils/faceValidation"
import { CameraFeed } from "@/components/group/sections/enrollment/components/CameraFeed"

type CaptureStatus = "pending" | "capturing" | "processing" | "completed" | "skipped" | "error"

interface QueuedMember {
  personId: string
  name: string
  role?: string
  status: CaptureStatus
  error?: string
  qualityWarning?: string
  previewUrl?: string
}

interface CameraQueueProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  preselectedIds?: string[]
  onRefresh?: () => Promise<void> | void
  onClose?: () => void
}

export function CameraQueue({
  group,
  members,
  preselectedIds,
  onRefresh,
  onClose,
}: CameraQueueProps) {
  const [memberQueue, setMemberQueue] = useState<QueuedMember[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCompletion, setShowCompletion] = useState(false)
  const [lastBbox, setLastBbox] = useState<{
    bbox: [number, number, number, number]
    width: number
    height: number
    capturedAt: number
  } | null>(null)
  const [bboxStyle, setBboxStyle] = useState<{
    left: string
    top: string
    width: string
    height: string
  } | null>(null)

  const {
    videoRef,
    cameraDevices,
    selectedCamera,
    setSelectedCamera,
    isStreaming,
    isVideoReady,
    cameraError,
    startCamera,
    stopCamera,
  } = useCamera()

  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const cameraContainerRef = useRef<HTMLDivElement | null>(null)

  const currentMember = memberQueue[currentIndex]
  const totalMembers = memberQueue.length
  const isQueueFinished = useMemo(() => {
    return (
      memberQueue.length > 0 &&
      memberQueue.every(
        (m) => m.status === "completed" || m.status === "skipped" || m.status === "error",
      )
    )
  }, [memberQueue])

  const findNextPendingIndex = useCallback((queue: QueuedMember[], startFrom: number): number => {
    // 1. Search after startFrom
    for (let i = startFrom + 1; i < queue.length; i++) {
      if (queue[i].status === "pending") {
        return i
      }
    }
    // 2. Search from the beginning up to startFrom
    for (let i = 0; i < startFrom; i++) {
      if (queue[i].status === "pending") {
        return i
      }
    }
    // 3. If no pending members, return -1 (meaning queue is finished)
    return -1
  }, [])

  useEffect(() => {
    if (showCompletion) {
      stopCamera()
    }
  }, [showCompletion, stopCamera])

  // Prepare the queue from preselectedIds or provide an empty queue if none
  useEffect(() => {
    if (memberQueue.length === 0) {
      const targetIds = preselectedIds || []
      const membersWithDisplayNames = generateDisplayNames(members)
      const initialQueue: QueuedMember[] = membersWithDisplayNames
        .filter((m) => targetIds.includes(m.person_id))
        .map((member) => ({
          personId: member.person_id,
          name: member.displayName,
          role: member.role,
          status: "pending" as CaptureStatus,
        }))
      setMemberQueue(initialQueue)
    }
  }, [preselectedIds, members, memberQueue.length])

  useEffect(() => {
    if (!isQueueFinished) {
      setShowCompletion(false)
      return
    }

    const timer = setTimeout(() => {
      setShowCompletion(true)
      if (onRefresh) {
        void onRefresh()
      }
    }, 850)

    return () => clearTimeout(timer)
  }, [isQueueFinished, onRefresh])

  useEffect(() => {
    setLastBbox(null)
    setBboxStyle(null)
  }, [currentMember?.personId])

  // Automatically clear errors after a few seconds so they don't linger on the UI
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [error])

  const updateBboxStyle = useCallback(() => {
    if (!lastBbox || !cameraContainerRef.current) {
      return
    }

    const container = cameraContainerRef.current
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight

    if (containerWidth === 0 || containerHeight === 0) {
      return
    }

    const imageAspectRatio = lastBbox.width / lastBbox.height
    const containerAspectRatio = containerWidth / containerHeight

    let displayedWidth: number
    let displayedHeight: number
    let offsetX = 0
    let offsetY = 0

    if (imageAspectRatio > containerAspectRatio) {
      displayedWidth = containerWidth
      displayedHeight = containerWidth / imageAspectRatio
      offsetY = (containerHeight - displayedHeight) / 2
    } else {
      displayedHeight = containerHeight
      displayedWidth = containerHeight * imageAspectRatio
      offsetX = (containerWidth - displayedWidth) / 2
    }

    const [bboxX, bboxY, bboxW, bboxH] = lastBbox.bbox
    const scaleX = displayedWidth / lastBbox.width
    const scaleY = displayedHeight / lastBbox.height

    const bboxLeft = bboxX * scaleX + offsetX
    const bboxTop = bboxY * scaleY + offsetY
    const bboxWidth = bboxW * scaleX
    const bboxHeight = bboxH * scaleY

    setBboxStyle({
      left: `${bboxLeft}px`,
      top: `${bboxTop}px`,
      width: `${bboxWidth}px`,
      height: `${bboxHeight}px`,
    })
  }, [lastBbox])

  useEffect(() => {
    if (!lastBbox) {
      setBboxStyle(null)
      return
    }

    updateBboxStyle()
    const clearTimer = setTimeout(() => {
      setBboxStyle(null)
    }, 900)

    const container = cameraContainerRef.current
    const resizeObserver = new ResizeObserver(() => updateBboxStyle())
    if (container) {
      resizeObserver.observe(container)
    }

    return () => {
      clearTimeout(clearTimer)
      resizeObserver.disconnect()
    }
  }, [lastBbox, updateBboxStyle])

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !currentMember) {
      return
    }

    if (!captureCanvasRef.current) {
      captureCanvasRef.current = document.createElement("canvas")
    }

    const video = videoRef.current
    const canvas = captureCanvasRef.current
    const width = video.videoWidth
    const height = video.videoHeight

    if (!width || !height) {
      return
    }

    // Update status
    setMemberQueue((prev) =>
      prev.map((m, idx) =>
        idx === currentIndex ? { ...m, status: "capturing" as CaptureStatus } : m,
      ),
    )

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      setError("Unable to capture from camera context.")
      return
    }

    // Mirror the capture to match preview
    ctx.scale(-1, 1)
    ctx.drawImage(video, -width, 0, width, height)

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92)

    setIsProcessing(true)
    setError(null)

    try {
      const blob = dataUrlToBlob(dataUrl)

      const detection = await backendService.detectFaces(blob, {
        model_type: "face_detector",
      })

      const bestFace = validateAndGetBestFace(detection)

      setLastBbox({
        bbox: bestFace.bbox,
        width,
        height,
        capturedAt: Date.now(),
      })

      setMemberQueue((prev) =>
        prev.map((m, idx) =>
          idx === currentIndex ?
            {
              ...m,
              status: "processing" as CaptureStatus,
              previewUrl: dataUrl,
            }
          : m,
        ),
      )

      const result = await attendanceManager.enrollFaceForGroupPerson(
        group.id,
        currentMember.personId,
        blob,
        bestFace.bbox,
        bestFace.landmarks_5,
      )

      if (!result.success) {
        throw new Error(result.error || "Enrollment failed")
      }

      const updatedQueue = memberQueue.map((m, idx) =>
        idx === currentIndex ?
          {
            ...m,
            status: "completed" as CaptureStatus,
            qualityWarning:
              bestFace.confidence && bestFace.confidence < 0.8 ?
                "Low confidence - consider retaking"
              : undefined,
          }
        : m,
      )
      setMemberQueue(updatedQueue)

      const nextPending = findNextPendingIndex(updatedQueue, currentIndex)
      if (nextPending !== -1) {
        setTimeout(() => setCurrentIndex(nextPending), 1000)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Capture failed"
      setMemberQueue((prev) =>
        prev.map((m, idx) =>
          idx === currentIndex ?
            {
              ...m,
              status: "pending" as CaptureStatus,
              error: message,
            }
          : m,
        ),
      )
      setError(message)
    } finally {
      setIsProcessing(false)
    }
  }, [currentMember, currentIndex, memberQueue, group.id, videoRef, findNextPendingIndex])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!currentMember || isQueueFinished) return

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        if (!isProcessing && isVideoReady) {
          void capturePhoto()
        }
      } else if (e.key === "n" || e.key === "N" || e.key === "ArrowRight") {
        e.preventDefault()
        // Next member
        if (currentIndex < memberQueue.length - 1) {
          setCurrentIndex((prev) => prev + 1)
          setError(null)
        }
      } else if (e.key === "p" || e.key === "P" || e.key === "ArrowLeft") {
        e.preventDefault()
        // Previous member
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1)
          setError(null)
        }
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault()
        // Retry current
        setMemberQueue((prev) =>
          prev.map((m, idx) =>
            idx === currentIndex ?
              { ...m, status: "pending" as CaptureStatus, error: undefined }
            : m,
          ),
        )
        setError(null)
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault()
        // Skip current member
        const updatedQueue = memberQueue.map((m, idx) =>
          idx === currentIndex ? { ...m, status: "skipped" as CaptureStatus } : m,
        )
        setMemberQueue(updatedQueue)
        const nextPending = findNextPendingIndex(updatedQueue, currentIndex)
        if (nextPending !== -1) {
          setCurrentIndex(nextPending)
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopImmediatePropagation()
        onClose?.()
      }
    }

    window.addEventListener("keydown", handleKeyPress, true)
    return () => window.removeEventListener("keydown", handleKeyPress, true)
  }, [
    currentMember,
    isProcessing,
    isVideoReady,
    currentIndex,
    memberQueue,
    capturePhoto,
    members,
    isQueueFinished,
    findNextPendingIndex,
    onClose,
  ])

  // Automatically start camera in queue mode if queue is started and not already streaming
  useEffect(() => {
    let active = true
    if (currentMember && !isStreaming && !showCompletion && !isQueueFinished) {
      const timer = setTimeout(() => {
        if (active) {
          startCamera()
        }
      }, 100)
      return () => clearTimeout(timer)
    }
    return () => {
      active = false
    }
  }, [currentMember, isStreaming, showCompletion, startCamera, isQueueFinished])

  useEffect(() => () => stopCamera(), [stopCamera])

  return (
    <div className="flex h-full flex-col overflow-hidden text-white">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {memberQueue.length === 0 ?
            <motion.div
              key="no-members"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center p-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
                <i className="fa-solid fa-users-slash text-2xl text-white/20"></i>
              </div>
              <h3 className="mb-1 text-sm font-semibold text-white">No members selected</h3>
              <p className="max-w-[200px] text-[11px] leading-relaxed text-white/45">
                Select group members from the list before starting the webcam enrollment.
              </p>
              <button
                onClick={onClose}
                className="mt-6 rounded-lg border border-white/10 bg-white/5 px-6 py-2 text-[11px] font-bold text-white/70 transition-all hover:bg-white/10 hover:text-white">
                Back to list
              </button>
            </motion.div>
          : <motion.div
              key="queue-active"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-hidden p-6">
              <div
                ref={cameraContainerRef}
                className="relative aspect-video min-h-0 w-full max-w-4xl shrink overflow-hidden rounded-xl">
                {showCompletion ?
                  <div className="animate-in fade-in absolute inset-0 z-30 flex flex-col items-center justify-center p-8 duration-300">
                    <h3 className="mb-1 text-xl font-bold text-white">Queue Completed</h3>
                    <p className="mb-6 max-w-xs text-center text-[11px] text-white/55">
                      All selected members have been processed.
                    </p>

                    {/* Summary counts - Calm design borderless typography */}
                    <div className="mb-8 flex items-center gap-10">
                      <div className="text-center">
                        <div className="text-2xl font-black text-cyan-400">
                          {memberQueue.filter((m) => m.status === "completed").length}
                        </div>
                        <div className="mt-0.5 text-[9px] font-bold tracking-wider text-white/40 uppercase">
                          Enrolled
                        </div>
                      </div>
                      <div className="h-8 w-px bg-white/10" />
                      <div className="text-center">
                        <div className="text-2xl font-black text-white/60">
                          {memberQueue.filter((m) => m.status === "skipped").length}
                        </div>
                        <div className="mt-0.5 text-[9px] font-bold tracking-wider text-white/40 uppercase">
                          Skipped
                        </div>
                      </div>
                    </div>
                  </div>
                : <>
                    <CameraFeed
                      videoRef={videoRef}
                      isStreaming={isStreaming}
                      isVideoReady={isVideoReady}
                      onStart={startCamera}
                      onStop={stopCamera}
                      source="live"
                      cameraDevices={cameraDevices}
                      selectedCamera={selectedCamera}
                      setSelectedCamera={setSelectedCamera}
                    />

                    {bboxStyle && (
                      <div className="pointer-events-none absolute inset-0 z-10">
                        <div
                          className="absolute border-2 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.45)]"
                          style={bboxStyle}
                        />
                      </div>
                    )}

                    <AnimatePresence mode="wait">
                      {currentMember && (
                        <motion.div
                          key={currentMember.personId || "current-member"}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className="pointer-events-none absolute top-0 right-0 left-0 z-20 flex flex-col items-start bg-gradient-to-b from-black/80 via-black/40 to-transparent px-8 pt-6 pb-12">
                          <span className="mb-0.5 text-[10px] font-bold tracking-[0.15em] text-cyan-400/80 uppercase">
                            Queue ({currentIndex + 1} of {totalMembers})
                          </span>
                          <h2 className="w-full max-w-[60%] truncate text-xl font-bold tracking-tight text-white sm:max-w-[70%] sm:text-2xl">
                            {currentMember.name}
                          </h2>
                          {currentMember.role && (
                            <div className="text-[11px] font-medium text-white/55">
                              {currentMember.role}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="absolute inset-y-0 left-2 z-10 flex items-center">
                      <button
                        onClick={() => {
                          if (currentIndex > 0) {
                            setCurrentIndex((prev) => prev - 1)
                            setError(null)
                          }
                        }}
                        disabled={currentIndex === 0}
                        className="rounded-full border border-white/5 bg-white/5 p-2 text-white/65 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
                        <i className="fa-solid fa-chevron-left text-sm"></i>
                      </button>
                    </div>
                    <div className="absolute inset-y-0 right-2 z-10 flex items-center">
                      <button
                        onClick={() => {
                          if (currentIndex < memberQueue.length - 1) {
                            setCurrentIndex((prev) => prev + 1)
                            setError(null)
                          }
                        }}
                        disabled={currentIndex >= memberQueue.length - 1}
                        className="rounded-full border border-white/5 bg-white/5 p-2 text-white/65 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
                        <i className="fa-solid fa-chevron-right text-sm"></i>
                      </button>
                    </div>

                    <AnimatePresence>
                      {currentMember &&
                        currentMember.status !== "pending" &&
                        currentMember.status !== "capturing" && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="flex flex-col items-center text-center drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)] select-none">
                              <div
                                className={`mb-3 text-5xl ${
                                  currentMember.status === "completed" ?
                                    "text-cyan-400"
                                  : "text-white/75"
                                }`}>
                                {currentMember.status === "completed" && (
                                  <i className="fa-solid fa-circle-check animate-pulse"></i>
                                )}
                                {currentMember.status === "skipped" && (
                                  <i className="fa-solid fa-forward"></i>
                                )}
                              </div>
                              <div className="text-xs font-black tracking-[0.2em] text-white uppercase">
                                {currentMember.status === "completed" && "Enrolled"}
                                {currentMember.status === "skipped" && "Skipped"}
                              </div>
                              <div className="mt-3 text-[9px] font-semibold tracking-[0.2em] text-white/40 uppercase">
                                Retake: Press R
                              </div>
                            </motion.div>
                          </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Sleek, non-blocking glassmorphic warning toast at the bottom center of viewport */}
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.22, ease: "easeOut" }}
                          className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex max-w-[85%] -translate-x-1/2 items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/85 px-4 py-2.5 text-center text-[11px] font-medium text-red-200">
                          <i className="fa-solid fa-circle-exclamation shrink-0 text-sm text-red-400"></i>
                          <span>{error}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                }
              </div>

              {/* Bottom Control Bar */}
              {!isQueueFinished && (
                <div className="flex w-full max-w-4xl items-center justify-between px-4">
                  {/* Left: Skip Button */}
                  <div className="w-40">
                    <button
                      onClick={() => {
                        if (currentMember) {
                          const updatedQueue = memberQueue.map((m, idx) =>
                            idx === currentIndex ? { ...m, status: "skipped" as CaptureStatus } : m,
                          )
                          setMemberQueue(updatedQueue)
                          const nextPending = findNextPendingIndex(updatedQueue, currentIndex)
                          if (nextPending !== -1) {
                            setCurrentIndex(nextPending)
                          }
                        }
                      }}
                      disabled={!currentMember || isProcessing}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold tracking-wider text-white/65 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-40">
                      Skip
                    </button>
                  </div>

                  {/* Center: Circular Trigger */}
                  <div className="flex flex-1 justify-center">
                    <button
                      onClick={() => void capturePhoto()}
                      disabled={!isVideoReady || isProcessing || !currentMember || !!cameraError}
                      className="group flex h-16 w-16 items-center justify-center rounded-full bg-white/10 p-1 transition-all hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Capture Face">
                      {isProcessing ?
                        <div className="flex h-full w-full items-center justify-center rounded-full bg-white/10">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                        </div>
                      : <div className="h-full w-full rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-transform group-active:scale-90" />
                      }
                    </button>
                  </div>

                  {/* Right: Controls & Shortcuts Cluster */}
                  <div className="flex w-40 items-center justify-end gap-3">
                    <div className="flex flex-col items-end gap-1">
                      {currentMember &&
                        currentMember.status !== "pending" &&
                        currentMember.status !== "capturing" && (
                          <button
                            onClick={() => {
                              setMemberQueue((prev) =>
                                prev.map((m, idx) =>
                                  idx === currentIndex ?
                                    { ...m, status: "pending" as CaptureStatus }
                                  : m,
                                ),
                              )
                              setError(null)
                            }}
                            className="text-[9px] font-semibold tracking-[0.2em] text-white/55 uppercase transition-colors hover:text-white">
                            Retake
                          </button>
                        )}
                      {/* Keyboard shortcuts - Compact guide on the right side */}
                      <div className="flex shrink-0 flex-col items-end gap-1 text-[9px] leading-tight font-medium text-white/45">
                        <div className="flex items-center gap-1">
                          <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/65">Space</kbd>
                          <span>Capture</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/65">←</kbd>
                          <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/65">→</kbd>
                          <span>Navigate</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/65">S</kbd>
                          <span>Skip</span>
                          <kbd className="ml-1 rounded bg-white/10 px-1 py-0.5 text-white/65">
                            R
                          </kbd>
                          <span>Reset</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          }
        </AnimatePresence>
      </div>
    </div>
  )
}
