import { useState, useEffect, useMemo, useCallback } from "react"
import { useGroupUIStore } from "@/components/group/stores"
import { Modal } from "@/components/common"
import { motion, AnimatePresence } from "framer-motion"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { useCamera } from "@/components/group/sections/enrollment/hooks/useCamera"
import { useFaceCapture } from "@/components/group/sections/enrollment/hooks/useFaceCapture"
import { useDialog } from "@/components/shared"
import { CameraFeed } from "@/components/group/sections/enrollment/components/CameraFeed"
import { UploadArea } from "@/components/group/sections/enrollment/components/UploadArea"
import { ResultView } from "@/components/group/sections/enrollment/components/ResultView"
import { useUIStore } from "@/components/main/stores"
import { EnrollmentInfoModal } from "@/components/group/sections/enrollment/components/EnrollmentInfoModal"

interface FaceCaptureProps {
  group: AttendanceGroup
  members: AttendanceMember[]
  onRefresh: () => void
  initialSource?: "live" | "upload"
  deselectMemberTrigger?: number
  onHasSelectedMemberChange?: (hasSelectedMember: boolean) => void
}

type CaptureSource = "live" | "upload"

export function FaceCapture({
  group,
  members,
  onRefresh,
  initialSource,
  deselectMemberTrigger,
  onHasSelectedMemberChange: onSelectedMemberChange,
}: FaceCaptureProps) {
  const dialog = useDialog()

  const preSelectedId = useGroupUIStore((state) => state.preSelectedMemberId)
  const resetEnrollment = useGroupUIStore((state) => state.resetEnrollment)

  const [source, setSource] = useState<CaptureSource>(initialSource ?? "live")
  const [selectedMemberId, setSelectedMemberId] = useState(preSelectedId ?? "")

  const enrollmentInfoDismissed = useUIStore((state) => state.enrollmentInfoDismissed)
  const setEnrollmentInfoDismissed = useUIStore((state) => state.setEnrollmentInfoDismissed)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false)
  const [successCountdown, setSuccessCountdown] = useState<number | null>(null)

  const memberStatus = useMemo(() => {
    const status = new Map<string, boolean>()
    for (const member of members) {
      status.set(member.person_id, !!member.has_face_data)
    }
    return status
  }, [members])

  const {
    videoRef,
    isStreaming,
    isVideoReady,
    cameraError,
    cameraDevices,
    selectedCamera,
    setSelectedCamera,
    startCamera,
    stopCamera,
  } = useCamera()

  const {
    frames,
    isEnrolling,
    successMessage,
    globalError,
    setSuccessMessage,
    setGlobalError,
    captureProcessedFrame,
    handleEnroll,
    resetFrames,
  } = useFaceCapture(group, members, onRefresh, dialog)

  const framesReady = frames.some((f) => f.status === "ready" || f.status === "enrolled")
  const isProcessing = frames.some((f) => f.status === "processing")

  // Trigger modal on member select if not already dismissed
  useEffect(() => {
    if (selectedMemberId && !enrollmentInfoDismissed) {
      setShowInfoModal(true)
      setDontShowAgainChecked(false)
    } else {
      setShowInfoModal(false)
    }
  }, [selectedMemberId, enrollmentInfoDismissed])

  useEffect(() => {
    let active = true
    if (
      source === "live" &&
      selectedMemberId &&
      !showInfoModal &&
      !isStreaming &&
      !framesReady &&
      !successMessage
    ) {
      const timer = setTimeout(() => {
        if (active) startCamera()
      }, 100)
      return () => clearTimeout(timer)
    }
    return () => {
      active = false
    }
  }, [
    source,
    selectedMemberId,
    showInfoModal,
    isStreaming,
    framesReady,
    successMessage,
    startCamera,
  ])

  useEffect(() => {
    if (onSelectedMemberChange) {
      onSelectedMemberChange(!!selectedMemberId)
    }
  }, [selectedMemberId, onSelectedMemberChange])

  useEffect(() => {
    setGlobalError(null)
  }, [selectedMemberId, setGlobalError])

  useEffect(() => {
    if (deselectMemberTrigger) {
      setTimeout(() => setSelectedMemberId(""), 0)
    }
  }, [deselectMemberTrigger])

  // Start countdown when successMessage is set
  useEffect(() => {
    if (successMessage) {
      setSuccessCountdown(3)
    } else {
      setSuccessCountdown(null)
    }
  }, [successMessage])

  // Count down every second and auto-dismiss on 0
  useEffect(() => {
    if (successCountdown === null) return
    if (successCountdown <= 0) {
      setSuccessMessage(null)
      setSelectedMemberId("")
      resetFrames()
      resetEnrollment()
      return
    }
    const timer = setTimeout(() => {
      setSuccessCountdown((prev) => (prev !== null ? prev - 1 : null))
    }, 1000)
    return () => clearTimeout(timer)
  }, [successCountdown, setSuccessMessage, setSelectedMemberId, resetFrames, resetEnrollment])

  const handleCaptureFromCamera = useCallback(() => {
    if (!videoRef.current || !selectedMemberId) return
    const canvas = document.createElement("canvas")
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Flip the capture to match the mirrored video preview
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)

    ctx.drawImage(videoRef.current, 0, 0)
    const url = canvas.toDataURL("image/jpeg", 0.95)
    captureProcessedFrame("Front", url, canvas.width, canvas.height)
  }, [videoRef, selectedMemberId, captureProcessedFrame])

  const handleWrapperEnroll = useCallback(async () => {
    if (!selectedMemberId) return
    await handleEnroll(selectedMemberId, async () => {}, memberStatus)
  }, [selectedMemberId, handleEnroll, memberStatus])

  const resetWorkflow = useCallback(() => {
    resetFrames()
    if (source === "live" && !showInfoModal) {
      startCamera()
    }
  }, [resetFrames, source, startCamera, showInfoModal])

  const handleConfirmInfoModal = useCallback(() => {
    if (dontShowAgainChecked) {
      setEnrollmentInfoDismissed(true)
    }
    setShowInfoModal(false)
  }, [dontShowAgainChecked, setEnrollmentInfoDismissed])

  const handleCloseInfoModal = useCallback(() => {
    setShowInfoModal(false)
    setSelectedMemberId("")
    resetEnrollment()
  }, [resetEnrollment])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!selectedMemberId) return

      if (e.key === " " || e.key === "Space") {
        if (source === "live" && isStreaming && isVideoReady && !isProcessing) {
          e.preventDefault()
          handleCaptureFromCamera()
        }
      } else if (e.key === "r" || e.key === "R") {
        if (framesReady) {
          e.preventDefault()
          resetWorkflow()
        }
      } else if (e.key === "Enter") {
        if (framesReady && !isEnrolling) {
          e.preventDefault()
          void handleWrapperEnroll()
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSelectedMemberId("")
        resetEnrollment()
      }
    }

    window.addEventListener("keydown", handleKeyPress, true)
    return () => window.removeEventListener("keydown", handleKeyPress, true)
  }, [
    selectedMemberId,
    source,
    isStreaming,
    isVideoReady,
    isProcessing,
    framesReady,
    isEnrolling,
    handleCaptureFromCamera,
    resetWorkflow,
    handleWrapperEnroll,
    resetEnrollment,
  ])

  const selectedMemberName = useMemo(() => {
    const m = members.find((m) => m.person_id === selectedMemberId)
    return m ? m.name || "Member" : ""
  }, [members, selectedMemberId])

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Modal
        isOpen={!!successMessage}
        onClose={() => {
          setSuccessMessage(null)
          setSelectedMemberId("")
          resetFrames()
          // Close the overlay entirely — go back to the main members list
          resetEnrollment()
        }}
        title="Success"
        maxWidth="sm"
        hideCloseButton={true}>
        <div className="flex flex-col items-center gap-3 py-2">
          <i className="fa-solid fa-check text-2xl text-cyan-400" />
          <p className="text-center text-sm font-medium text-white/85">{successMessage}</p>

          <div className="mt-6 flex w-full items-center justify-between">
            {/* Subtle countdown text on the left */}
            <div className="flex items-center gap-1 text-[10px] font-medium text-white/30 select-none">
              <span>Closing in</span>
              <span className="font-bold text-white/50 tabular-nums">{successCountdown}s</span>
            </div>

            <button
              onClick={() => {
                setSuccessMessage(null)
                setSelectedMemberId("")
                resetFrames()
                // Close the overlay entirely — go back to the main members list
                resetEnrollment()
              }}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/20 px-5 py-1.5 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/30">
              Done
            </button>
          </div>
        </div>
      </Modal>

      <EnrollmentInfoModal
        isOpen={showInfoModal}
        dontShowAgain={dontShowAgainChecked}
        onClose={handleCloseInfoModal}
        onConfirm={handleConfirmInfoModal}
        onDontShowAgainChange={setDontShowAgainChecked}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {!selectedMemberId ?
            <motion.div
              key="select-member"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-xs font-medium text-white/55">
                Select a member to begin enrollment
              </div>
            </motion.div>
          : <motion.div
              key="camera-viewport"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-hidden p-6">
              <div className="relative aspect-video min-h-0 w-full max-w-4xl shrink overflow-hidden rounded-xl">
                {/* Floating Header Overlay */}
                <div className="pointer-events-none absolute top-0 right-0 left-0 z-20 flex flex-col items-start bg-gradient-to-b from-black/80 via-black/40 to-transparent px-8 pt-6 pb-12">
                  <span className="mb-0.5 text-[10px] font-bold tracking-[0.15em] text-cyan-400/80 uppercase">
                    Member
                  </span>
                  <h2 className="w-full max-w-[60%] truncate text-xl font-bold tracking-tight text-white sm:max-w-[70%] sm:text-2xl">
                    {selectedMemberName}
                  </h2>
                </div>

                {!framesReady ?
                  source === "live" ?
                    <CameraFeed
                      videoRef={videoRef}
                      isStreaming={isStreaming}
                      isVideoReady={isVideoReady}
                      cameraError={cameraError}
                      onStart={startCamera}
                      onStop={stopCamera}
                      source={source}
                      cameraDevices={cameraDevices}
                      selectedCamera={selectedCamera}
                      setSelectedCamera={setSelectedCamera}
                    />
                  : <UploadArea
                      onFileProcessed={(url: string, w: number, h: number) =>
                        captureProcessedFrame("Front", url, w, h)
                      }
                      onError={setGlobalError}
                    />

                : <ResultView
                    frames={frames}
                    selectedMemberName={selectedMemberName}
                    onRetake={resetWorkflow}
                    onEnroll={handleWrapperEnroll}
                    isEnrolling={isEnrolling}
                    framesReady={!!framesReady}
                  />
                }

                {/* Sleek, non-blocking glassmorphic warning toast inside single viewport */}
                <AnimatePresence>
                  {globalError && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex max-w-[85%] -translate-x-1/2 items-center gap-2 rounded-lg border border-red-500/30 bg-red-950/85 px-4 py-2.5 text-center text-[11px] font-medium text-red-200">
                      <i className="fa-solid fa-circle-exclamation shrink-0 text-sm text-red-400"></i>
                      <span>{globalError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Control Bar */}
              {!framesReady && (
                <div className="flex w-full max-w-4xl items-center justify-between px-4">
                  <div className="w-32">
                    <button
                      onClick={() => setSource(source === "live" ? "upload" : "live")}
                      className="group flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-medium text-white/65 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
                      title={source === "live" ? "Upload Photo Instead" : "Use Camera Instead"}>
                      <i
                        className={`fa-solid ${source === "live" ? "fa-file-image" : "fa-camera"} text-sm`}></i>
                      <span>{source === "live" ? "Upload" : "Camera"}</span>
                    </button>
                  </div>

                  <div className="flex flex-1 justify-center">
                    {source === "live" && isStreaming && (
                      <button
                        onClick={handleCaptureFromCamera}
                        disabled={!isVideoReady || !!cameraError || isProcessing}
                        className="group flex h-16 w-16 items-center justify-center rounded-full bg-white/10 p-1 transition-all hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Capture Face">
                        {isProcessing ?
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                        : <div className="h-full w-full rounded-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-transform group-active:scale-90" />
                        }
                      </button>
                    )}
                  </div>

                  {/* Empty div for right side balance */}
                  <div className="flex w-32 items-center justify-end">
                    <div className="flex flex-col items-end gap-1 text-[9px] leading-tight font-medium text-white/45">
                      <div className="flex items-center gap-1">
                        <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/65">Space</kbd>
                        <span>Capture</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <kbd className="rounded bg-white/10 px-1 py-0.5 text-white/65">R</kbd>
                        <span>Retake</span>
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
