import { useState, useEffect, useMemo, useCallback } from "react"
import { useGroupUIStore } from "@/components/group/stores"
import { Modal } from "@/components/common"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { useCamera } from "@/components/group/sections/registration/hooks/useCamera"
import { useFaceCapture } from "@/components/group/sections/registration/hooks/useFaceCapture"
import { useDialog } from "@/components/shared"
import { CaptureControls } from "@/components/group/sections/registration/components/CaptureControls"
import { CameraFeed } from "@/components/group/sections/registration/components/CameraFeed"
import { UploadArea } from "@/components/group/sections/registration/components/UploadArea"
import { MemberSidebar } from "@/components/group/sections/registration/components/MemberSidebar"
import { ResultView } from "@/components/group/sections/registration/components/ResultView"

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

  const [source, setSource] = useState<CaptureSource>(initialSource ?? "upload")
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [memberSearch, setMemberSearch] = useState("")
  const [registrationFilter, setRegistrationFilter] = useState<
    "all" | "registered" | "non-registered"
  >("all")

  const memberStatus = useMemo(() => {
    const status = new Map<string, boolean>()
    for (const member of members) {
      status.set(member.person_id, !!member.has_face_data)
    }
    return status
  }, [members])

  useEffect(() => {
    if (preSelectedId) {
      setTimeout(() => setSelectedMemberId(preSelectedId), 0)
    }
  }, [preSelectedId])

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
    isRegistering,
    successMessage,
    globalError,
    setSuccessMessage,
    setGlobalError,
    captureProcessedFrame,
    handleRegister,
    handleRemoveFaceData,
    resetFrames,
  } = useFaceCapture(group, members, onRefresh, dialog)

  const framesReady = frames.length > 0

  useEffect(() => {
    if (onSelectedMemberChange) {
      onSelectedMemberChange(!!selectedMemberId)
    }
  }, [selectedMemberId, onSelectedMemberChange])

  useEffect(() => {
    if (deselectMemberTrigger) {
      setTimeout(() => setSelectedMemberId(""), 0)
    }
  }, [deselectMemberTrigger])

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

  const handleWrapperRegister = useCallback(async () => {
    if (!selectedMemberId) return
    await handleRegister(selectedMemberId, async () => {}, memberStatus)
  }, [selectedMemberId, handleRegister, memberStatus])

  const handleWrapperRemoveData = useCallback(
    async (member: AttendanceMember) => {
      await handleRemoveFaceData(member, async () => {})
    },
    [handleRemoveFaceData],
  )

  const resetWorkflow = useCallback(() => {
    resetFrames()
    if (source === "live") {
      startCamera()
    }
  }, [resetFrames, source, startCamera])

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
          // No longer calling onClose() or setRegistrationState here to stay in the list
        }}
        title="Success"
        maxWidth="sm"
        hideCloseButton={true}>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20">
            <i className="fa-solid fa-check text-xl text-cyan-400"></i>
          </div>
          <p className="text-center text-sm font-medium text-cyan-200/60">{successMessage}</p>

          <div className="mt-2 flex w-full justify-end">
            <button
              onClick={() => {
                setSuccessMessage(null)
                setSelectedMemberId("")
                resetFrames()
              }}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/20 px-6 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/30">
              Done
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!globalError}
        onClose={() => setGlobalError(null)}
        title="Something went wrong"
        icon={<i className="fa-solid fa-triangle-exclamation text-red-400"></i>}
        maxWidth="sm">
        <div className="flex flex-col items-center gap-4 py-2">
          <p className="text-center text-sm font-medium text-red-200/60">{globalError}</p>

          <div className="mt-2 flex w-full justify-end">
            <button
              onClick={() => setGlobalError(null)}
              className="rounded-lg border border-white/10 bg-white/5 px-6 py-2 text-[11px] font-bold tracking-wider text-white/50 transition-all hover:bg-white/10 hover:text-white">
              Dismiss
            </button>
          </div>
        </div>
      </Modal>

      <div className="min-h-0 flex-1 overflow-hidden">
        {!selectedMemberId && (
          <MemberSidebar
            members={members}
            memberStatus={memberStatus}
            selectedMemberId={selectedMemberId}
            onSelectMember={setSelectedMemberId}
            memberSearch={memberSearch}
            setMemberSearch={setMemberSearch}
            registrationFilter={registrationFilter}
            setRegistrationFilter={setRegistrationFilter}
            onRemoveFaceData={handleWrapperRemoveData}
          />
        )}

        {selectedMemberId && (
          <div className="flex h-full flex-col space-y-6 overflow-hidden p-6">
            <div className="mx-auto flex w-full max-w-4xl flex-col space-y-6 overflow-hidden">
              <CaptureControls
                source={source}
                setSource={setSource}
                hasRequiredFrame={!!framesReady}
              />

              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/6 bg-black/40 shadow-2xl">
                {!framesReady ?
                  source === "live" ?
                    <CameraFeed
                      videoRef={videoRef}
                      isStreaming={isStreaming}
                      isVideoReady={isVideoReady}
                      cameraError={cameraError}
                      onCapture={handleCaptureFromCamera}
                      onStart={startCamera}
                      onStop={stopCamera}
                      source={source}
                      isCameraSelected={!!selectedCamera}
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
                    onRegister={handleWrapperRegister}
                    isRegistering={isRegistering}
                    framesReady={!!framesReady}
                  />
                }
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
