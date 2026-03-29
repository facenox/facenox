import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { attendanceManager, backendService } from "@/services"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { useCamera } from "@/components/group/sections/registration/hooks/useCamera"
import { useGroupUIStore } from "@/components/group/stores/groupUIStore"
import { Dropdown } from "@/components/shared"
import { dataUrlToBlob } from "@/utils/dataUrl"

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
  onRefresh?: () => Promise<void> | void
  onClose?: () => void
}

export function CameraQueue({ group, members, onRefresh, onClose }: CameraQueueProps) {
  const setActiveSection = useGroupUIStore((state) => state.setActiveSection)
  const [memberQueue, setMemberQueue] = useState<QueuedMember[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [queueStarted, setQueueStarted] = useState(false)
  const autoAdvance = true
  const [memberSearch, setMemberSearch] = useState("")
  const [registrationFilter, setRegistrationFilter] = useState<
    "all" | "registered" | "non-registered"
  >("all")
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(true)

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

  const currentMember = memberQueue[currentIndex]
  const totalMembers = memberQueue.length
  const completedMembers = memberQueue.filter(
    (m) => m.status === "completed" || m.status === "skipped",
  ).length
  const memberOrderMap = useMemo(
    () => new Map(members.map((member, index) => [member.person_id, index])),
    [members],
  )
  const filteredMembers = useMemo(() => {
    let result = members
    if (memberSearch.trim()) {
      const query = memberSearch.toLowerCase()
      result = result.filter(
        (member) =>
          member.name.toLowerCase().includes(query) ||
          member.person_id.toLowerCase().includes(query),
      )
    }
    if (registrationFilter !== "all") {
      result = result.filter((member) => {
        const isRegistered = member.has_face_data ?? false
        return registrationFilter === "registered" ? isRegistered : !isRegistered
      })
    }
    return result
  }, [members, memberSearch, registrationFilter])

  const setupQueue = useCallback((selectedMembers: AttendanceMember[]) => {
    const queue: QueuedMember[] = selectedMembers.map((member) => ({
      personId: member.person_id,
      name: member.name,
      role: member.role,
      status: "pending" as CaptureStatus,
    }))
    setMemberQueue(queue)
    setCurrentIndex(0)
    setQueueStarted(false)
  }, [])

  useEffect(() => {
    if (totalMembers > 0 && completedMembers === totalMembers && !isProcessing) {
      setSuccessMessage(`All ${totalMembers} members registered successfully!`)
    }
  }, [completedMembers, totalMembers, isProcessing])

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

    // Check for member-level consent
    const memberRecord = members.find((m) => m.person_id === currentMember.personId)
    if (!memberRecord?.has_consent) {
      setError(`Cannot capture: ${currentMember.name} has not provided biometric consent.`)
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

      if (!detection.faces || detection.faces.length === 0) {
        throw new Error("No face detected. Please face the camera directly with good lighting.")
      }

      const bestFace = detection.faces.reduce(
        (best, current) => ((current.confidence ?? 0) > (best.confidence ?? 0) ? current : best),
        detection.faces[0],
      )

      if (!bestFace.bbox) {
        throw new Error("Face detected but bounding box missing.")
      }

      if (bestFace.landmarks_5?.length !== 5) {
        throw new Error(
          "Face detected but landmarks are missing. Please ensure the face is clearly visible and try again.",
        )
      }

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

      const result = await attendanceManager.registerFaceForGroupPerson(
        group.id,
        currentMember.personId,
        blob,
        bestFace.bbox,
        bestFace.landmarks_5,
        false, // liveness check is NOT needed during registration
      )

      if (!result.success) {
        throw new Error(result.error || "Registration failed")
      }

      setMemberQueue((prev) =>
        prev.map((m, idx) =>
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
        ),
      )

      if (autoAdvance) {
        if (currentIndex < memberQueue.length - 1) {
          // Next member
          setTimeout(() => setCurrentIndex((prev) => prev + 1), 1000)
        } else {
          // All done
          setSuccessMessage(`All ${totalMembers} members registered successfully!`)
          if (onRefresh) {
            await onRefresh()
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Capture failed"
      setMemberQueue((prev) =>
        prev.map((m, idx) =>
          idx === currentIndex ?
            {
              ...m,
              status: "error" as CaptureStatus,
              error: message,
            }
          : m,
        ),
      )
      setError(message)
    } finally {
      setIsProcessing(false)
    }
  }, [
    currentMember,
    currentIndex,
    memberQueue,
    group.id,
    autoAdvance,
    totalMembers,
    onRefresh,
    videoRef,
    members,
  ])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!queueStarted || !currentMember) return

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        if (!isProcessing && isVideoReady) {
          const mRecord = members.find((m) => m.person_id === currentMember.personId)
          if (mRecord?.has_consent) {
            void capturePhoto()
          } else {
            setError(`Consent required for ${currentMember.name}`)
          }
        }
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault()
        // Next member
        if (currentIndex < memberQueue.length - 1) {
          setCurrentIndex((prev) => prev + 1)
          setError(null)
        }
      } else if (e.key === "p" || e.key === "P") {
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
        setMemberQueue((prev) =>
          prev.map((m, idx) =>
            idx === currentIndex ? { ...m, status: "skipped" as CaptureStatus } : m,
          ),
        )
        if (currentIndex < memberQueue.length - 1) {
          setCurrentIndex((prev) => prev + 1)
        }
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [
    queueStarted,
    currentMember,
    isProcessing,
    isVideoReady,
    currentIndex,
    memberQueue.length,
    capturePhoto,
    members,
  ])

  useEffect(() => () => stopCamera(), [stopCamera])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0f0f0f] text-white">
      {/* Privacy Notice — DPA Sec.16(a) / GDPR Art.13: inform data subjects at point of collection */}
      {showPrivacyNotice && (
        <div className="mx-6 mt-4 flex shrink-0 items-start gap-3 rounded-lg border border-blue-500/25 bg-blue-500/8 px-4 py-3 text-xs text-blue-200/80">
          <i className="fa-solid fa-circle-info mt-0.5 shrink-0 text-blue-400" />
          <div className="flex-1 leading-relaxed">
            <span className="font-bold text-blue-200">Privacy Notice for Data Subjects:&nbsp;</span>
            Facial features are converted to a numeric signature and stored encrypted on this device
            only. No photos are kept. Data is used solely for attendance tracking and is not shared
            with third parties. Individuals may withdraw consent and request deletion at any time by
            contacting the administrator.
          </div>
          <button
            onClick={() => setShowPrivacyNotice(false)}
            title="Dismiss notice"
            className="shrink-0 border-none bg-transparent p-0 text-blue-200/40 transition hover:text-blue-100">
            <i className="fa fa-times text-xs"></i>
          </button>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 flex shrink-0 items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <div className="h-1 w-1 animate-pulse rounded-full bg-red-400" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="border-none bg-transparent p-0 text-red-200/50 shadow-none transition hover:text-red-100">
            <i className="fa fa-times text-xs"></i>
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mx-6 mt-4 flex shrink-0 items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
          <div className="h-1 w-1 animate-pulse rounded-full bg-cyan-400" />
          <span className="flex-1">{successMessage}</span>
        </div>
      )}

      <div className="custom-scroll flex-1 overflow-y-auto px-6 py-6">
        {!queueStarted ?
          <div className="space-y-6">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Select Members to Register</h3>
                <div className="flex items-center gap-3">
                  {memberQueue.length > 0 && (
                    <button
                      onClick={() => setupQueue([])}
                      className="text-xs text-white/40 transition hover:text-white/70">
                      Clear
                    </button>
                  )}
                  {memberQueue.length < members.length && (
                    <button
                      onClick={() => setupQueue(members)}
                      className="text-xs text-cyan-300 transition hover:text-cyan-200">
                      Select All
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-white/10 bg-[rgba(17,22,29,0.96)] p-3">
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-55 flex-1">
                    <svg
                      className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/30"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    <input
                      type="search"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search members..."
                      className="w-full rounded-xl border border-white/10 bg-[rgba(22,28,36,0.68)] py-2 pr-3 pl-10 text-[11px] font-medium text-white transition-all duration-300 outline-none placeholder:text-white/30 focus:border-cyan-500/32 focus:bg-[rgba(28,35,44,0.82)] focus:ring-1 focus:ring-cyan-500/5"
                    />
                  </div>
                  <Dropdown
                    options={[
                      { value: "all", label: "All members" },
                      { value: "non-registered", label: "Unregistered" },
                      { value: "registered", label: "Registered" },
                    ]}
                    value={registrationFilter}
                    onChange={(value) => {
                      if (value) {
                        setRegistrationFilter(value as "all" | "registered" | "non-registered")
                      }
                    }}
                    showPlaceholderOption={false}
                    allowClear={false}
                    className="min-w-42.5"
                  />
                </div>

                <div className="custom-scroll max-h-64 space-y-1.5 overflow-y-auto">
                  {members.length === 0 && (
                    <div className="rounded-lg border border-dashed border-white/10 bg-[rgba(22,28,36,0.44)] px-3 py-8 text-center">
                      <div className="text-xs text-white/40">No members yet</div>
                    </div>
                  )}

                  {members.length > 0 && filteredMembers.length === 0 && (
                    <div className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.62)] px-3 py-6 text-center">
                      <div className="text-xs text-white/40">
                        {memberSearch.trim() ?
                          `No results for "${memberSearch}"`
                        : registrationFilter === "registered" ?
                          "No registered members"
                        : registrationFilter === "non-registered" ?
                          "All members are registered"
                        : "No members found"}
                      </div>
                    </div>
                  )}

                  {filteredMembers.map((member) => {
                    const isInQueue = memberQueue.some((m) => m.personId === member.person_id)
                    const isRegistered = member.has_face_data ?? false
                    return (
                      <button
                        key={member.person_id}
                        type="button"
                        onClick={() => {
                          if (isInQueue) {
                            const memberIndex = memberQueue.findIndex(
                              (m) => m.personId === member.person_id,
                            )
                            setMemberQueue((prev) =>
                              prev.filter((m) => m.personId !== member.person_id),
                            )
                            if (memberIndex !== -1 && memberIndex < currentIndex) {
                              setCurrentIndex((prev) => Math.max(0, prev - 1))
                            }
                            return
                          }
                          const newMember: QueuedMember = {
                            personId: member.person_id,
                            name: member.name,
                            role: member.role,
                            status: "pending",
                          }
                          setMemberQueue((prev) => {
                            const next = [...prev, newMember]
                            return next.sort(
                              (a, b) =>
                                (memberOrderMap.get(a.personId) ?? 0) -
                                (memberOrderMap.get(b.personId) ?? 0),
                            )
                          })
                        }}
                        className={`group w-full rounded-lg border px-3 py-2 text-left transition-all ${
                          isInQueue ?
                            "border-cyan-400/50 bg-linear-to-br from-cyan-500/10 to-cyan-500/5"
                          : "border-white/10 bg-[rgba(17,22,29,0.96)] hover:border-white/10 hover:bg-[rgba(22,28,36,0.52)]"
                        }`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">
                              {member.name}
                            </div>
                            {member.role && (
                              <div className="truncate text-xs text-white/40">{member.role}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isRegistered && (
                              <span className="text-[11px] font-black tracking-wider text-cyan-400/80 uppercase">
                                Registered
                              </span>
                            )}
                            {isInQueue && <span className="text-xs text-cyan-300">Queued</span>}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {memberQueue.length === 0 && (
              <div className="text-xs text-white/40">Select at least one member to start.</div>
            )}

            {/* Start Button */}
            {memberQueue.length > 0 && (
              <button
                onClick={() => setQueueStarted(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95">
                Start Queue ({memberQueue.length})
              </button>
            )}
          </div>
        : <div className="flex h-full gap-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative flex-1 overflow-hidden rounded-lg border border-white/20 bg-black">
                <video
                  ref={videoRef}
                  className="h-full w-full scale-x-[-1] object-contain"
                  playsInline
                  muted
                />

                {!isStreaming && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/95">
                    <div className="max-w-xs space-y-4 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[rgba(22,28,36,0.62)]">
                        <i className="fa-solid fa-video text-2xl text-white/30"></i>
                      </div>
                      <div className="text-sm text-white/60">Select a camera to start</div>

                      {cameraDevices.length > 0 && (
                        <Dropdown
                          options={cameraDevices.map((device, index) => ({
                            value: device.deviceId,
                            label: device.label || `Camera ${index + 1}`,
                          }))}
                          value={selectedCamera || null}
                          onChange={(value: string | number | null) => {
                            if (value) {
                              setSelectedCamera(value as string)
                            }
                          }}
                          placeholder="Select camera..."
                          emptyMessage="No cameras available"
                          showPlaceholderOption={false}
                          allowClear={false}
                          buttonClassName="bg-white/10 border-white/20"
                        />
                      )}
                      {cameraDevices.length === 0 && (
                        <div className="text-xs text-white/40">No cameras detected</div>
                      )}

                      <button
                        onClick={() => void startCamera()}
                        disabled={!selectedCamera && cameraDevices.length > 0}
                        className="w-full rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-2.5 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
                        <i className="fa-solid fa-play mr-2"></i>
                        Start Camera
                      </button>
                    </div>
                  </div>
                )}

                {isStreaming && !isVideoReady && !cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/90">
                    <div className="space-y-3 text-center">
                      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-cyan-400" />
                      <div className="text-xs text-white/50">Starting camera...</div>
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4 text-center">
                    <div className="space-y-3">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
                        <i className="fa-solid fa-exclamation-triangle text-lg text-red-400"></i>
                      </div>
                      <div className="max-w-xs text-xs text-red-300">{cameraError}</div>
                      <button
                        onClick={() => void startCamera()}
                        className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-2 text-[11px] font-bold tracking-wider text-white/50 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
                        Try Again
                      </button>
                    </div>
                  </div>
                )}

                {/* Privacy Shield Overlay */}
                {(() => {
                  const mRec = members.find((m) => m.person_id === currentMember?.personId)
                  if (currentMember && !mRec?.has_consent && isStreaming) {
                    return (
                      <div className="animate-in fade-in absolute inset-0 z-5 flex items-center justify-center bg-black/60 duration-700">
                        <div className="flex flex-col items-center gap-4 text-white/20">
                          <div className="relative">
                            <i className="fa-solid fa-shield-halved text-7xl opacity-10"></i>
                            <div className="absolute inset-0 flex translate-y-2 items-center justify-center">
                              <i className="fa-solid fa-lock text-xl text-white opacity-30"></i>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <div className="text-[10px] font-medium opacity-20">Privacy Shield</div>
                            <div className="text-[9px] font-medium tracking-tight text-white/20">
                              Biometric Authorization Required
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  return null
                })()}

                {currentMember && (
                  <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                    <div className="text-md truncate font-medium text-white/80">
                      {currentMember.name}
                    </div>
                    {currentMember.role && (
                      <div className="text-xs text-white/40">{currentMember.role}</div>
                    )}
                    {(() => {
                      const mRec = members.find((m) => m.person_id === currentMember.personId)
                      if (!mRec?.has_consent) {
                        return (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[10px] font-medium text-amber-200/60 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
                              <i className="fa-solid fa-shield-slash text-[9px]"></i>
                              Biometric Consent Missing
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveSection("members")
                              }}
                              className="flex w-fit items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-medium text-cyan-400 transition-all hover:bg-cyan-500/20 active:scale-95">
                              <i className="fa-solid fa-key text-[9px]"></i>
                              Review Consent
                            </button>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                )}

                <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                  <span className="text-xs text-white/50">
                    {currentIndex + 1}/{totalMembers}
                  </span>
                  {isStreaming && (
                    <button
                      onClick={() => stopCamera()}
                      className="rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-500 transition-all hover:bg-red-500/20">
                      <i className="fa-solid fa-stop mr-1"></i>
                      Stop
                    </button>
                  )}
                  <button
                    onClick={() => setQueueStarted(false)}
                    className="rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-2 py-1 text-xs font-medium text-white/30 transition-all hover:bg-[rgba(28,35,44,0.82)] hover:text-white">
                    <i className="fa-solid fa-list-ul mr-1"></i>
                    Queue
                  </button>
                </div>

                <div className="absolute inset-y-0 left-2 z-10 flex items-center">
                  <button
                    onClick={() => {
                      if (currentIndex > 0) {
                        setCurrentIndex((prev) => prev - 1)
                        setError(null)
                      }
                    }}
                    disabled={currentIndex === 0}
                    className="rounded-full border border-white/10 bg-[rgba(10,13,18,0.78)] p-2 text-white/60 transition-all hover:bg-[rgba(15,19,25,0.9)] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
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
                    className="rounded-full border border-white/10 bg-[rgba(10,13,18,0.78)] p-2 text-white/60 transition-all hover:bg-[rgba(15,19,25,0.9)] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
                    <i className="fa-solid fa-chevron-right text-sm"></i>
                  </button>
                </div>

                <div className="absolute right-2 bottom-2 left-2 z-10 flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (currentMember) {
                        setMemberQueue((prev) =>
                          prev.map((m, idx) =>
                            idx === currentIndex ? { ...m, status: "skipped" as CaptureStatus } : m,
                          ),
                        )
                        if (currentIndex < memberQueue.length - 1) {
                          setCurrentIndex((prev) => prev + 1)
                        }
                      }
                    }}
                    disabled={!currentMember}
                    className="rounded-lg border border-white/10 bg-[rgba(10,13,18,0.78)] px-3 py-2 text-[11px] font-medium text-white/50 transition-all hover:bg-[rgba(15,19,25,0.9)] hover:text-white disabled:opacity-40">
                    Skip
                  </button>

                  <button
                    onClick={() => void capturePhoto()}
                    disabled={
                      !isVideoReady ||
                      isProcessing ||
                      !currentMember ||
                      !!cameraError ||
                      !members.find((m) => m.person_id === currentMember?.personId)?.has_consent
                    }
                    className={`flex-1 rounded-lg border px-4 py-2 transition-all disabled:cursor-not-allowed ${(() => {
                      const mRec = members.find((m) => m.person_id === currentMember?.personId)
                      if (currentMember && !mRec?.has_consent) {
                        return "cursor-not-allowed border-white/10 bg-[rgba(22,28,36,0.44)] text-white/20"
                      }
                      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 disabled:border-white/10 disabled:bg-[rgba(10,13,18,0.78)] disabled:text-white/30"
                    })()}`}>
                    {isProcessing ?
                      <span className="flex items-center justify-center gap-2 text-xs font-medium">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                        Processing...
                      </span>
                    : (() => {
                        const mRec = members.find((m) => m.person_id === currentMember?.personId)
                        if (currentMember && !mRec?.has_consent) {
                          return (
                            <span className="flex items-center justify-center gap-2 text-xs font-bold tracking-widest uppercase">
                              <i className="fa-solid fa-lock text-[10px]"></i>
                              Locked
                            </span>
                          )
                        }
                        return (
                          <span className="text-[11px] font-bold tracking-wider uppercase">
                            Capture
                          </span>
                        )
                      })()
                    }
                  </button>

                  {currentMember?.status === "error" && (
                    <button
                      onClick={() => {
                        if (currentMember) {
                          setMemberQueue((prev) =>
                            prev.map((m, idx) =>
                              idx === currentIndex ?
                                {
                                  ...m,
                                  status: "pending" as CaptureStatus,
                                  error: undefined,
                                  qualityWarning: undefined,
                                }
                              : m,
                            ),
                          )
                          setError(null)
                        }
                      }}
                      className="rounded-lg border border-amber-400/50 bg-amber-500/40 px-3 py-2 text-[11px] font-bold tracking-wider text-amber-100 transition-all hover:bg-amber-500/50">
                      Retry
                    </button>
                  )}
                </div>

                {currentMember &&
                  currentMember.status !== "pending" &&
                  currentMember.status !== "capturing" && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
                      <div
                        className={`rounded-xl border px-6 py-4 ${
                          currentMember.status === "completed" ? "border-cyan-500/30 bg-cyan-500/20"
                          : currentMember.status === "skipped" ? "border-white/20 bg-white/10"
                          : "border-red-500/30 bg-red-500/20"
                        }`}>
                        <div className="text-center">
                          <div
                            className={`mb-1 text-2xl ${
                              currentMember.status === "completed" ? "text-cyan-400"
                              : currentMember.status === "skipped" ? "text-white/60"
                              : "text-red-400"
                            }`}>
                            {currentMember.status === "completed" && (
                              <i className="fa-solid fa-check-circle"></i>
                            )}
                            {currentMember.status === "skipped" && (
                              <i className="fa-solid fa-forward"></i>
                            )}
                            {currentMember.status === "error" && (
                              <i className="fa-solid fa-exclamation-circle"></i>
                            )}
                          </div>
                          <div className="text-sm font-medium text-white">
                            {currentMember.status === "completed" && "Registered"}
                            {currentMember.status === "skipped" && "Skipped"}
                            {currentMember.status === "error" && "Error"}
                          </div>
                          {currentMember.error && (
                            <div className="mt-1 max-w-50 text-xs text-red-300">
                              {currentMember.error}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              {/* Keyboard shortcuts - Compact */}
              <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-white/40">
                <span>
                  <kbd className="mr-1 rounded bg-white/10 px-1.5 py-0.5 text-white/60">Space</kbd>
                  Capture
                </span>
                <span>
                  <kbd className="mr-1 rounded bg-white/10 px-1.5 py-0.5 text-white/60">←</kbd>
                  <kbd className="mr-1 rounded bg-white/10 px-1.5 py-0.5 text-white/60">→</kbd>
                  Navigate
                </span>
                <span>
                  <kbd className="mr-1 rounded bg-white/10 px-1.5 py-0.5 text-white/60">S</kbd>
                  Skip
                </span>
                <span>
                  <kbd className="mr-1 rounded bg-white/10 px-1.5 py-0.5 text-white/60">R</kbd>
                  Retry
                </span>
              </div>
            </div>

            {/* Queue Sidebar - Compact */}
            <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[rgba(17,22,29,0.96)]">
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <span className="text-xs font-semibold text-white/70">Queue</span>
                <span className="text-xs text-white/40">
                  {completedMembers}/{totalMembers}
                </span>
              </div>
              <div className="custom-scroll flex-1 space-y-1 overflow-y-auto p-2">
                {memberQueue.map((member, idx) => {
                  const isCurrent = idx === currentIndex
                  const statusIcon =
                    member.status === "completed" ? "fa-check"
                    : member.status === "skipped" ? "fa-forward"
                    : member.status === "error" ? "fa-exclamation"
                    : member.status === "processing" ? "fa-spinner fa-spin"
                    : ""

                  return (
                    <button
                      key={member.personId}
                      onClick={() => {
                        setCurrentIndex(idx)
                        setError(null)
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all ${
                        isCurrent ?
                          "border border-white/20 bg-white/10"
                        : "border border-transparent hover:bg-[rgba(22,28,36,0.52)]"
                      }`}>
                      {/* Status Icon */}
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                          member.status === "completed" ? "bg-cyan-500/20 text-cyan-400"
                          : member.status === "skipped" ? "bg-white/10 text-white/40"
                          : member.status === "error" ? "bg-red-500/20 text-red-400"
                          : member.status === "processing" ? "bg-amber-500/20 text-amber-400"
                          : isCurrent ? "bg-[rgba(28,35,44,0.82)] text-white/60"
                          : "bg-[rgba(22,28,36,0.62)] text-white/30"
                        }`}>
                        {statusIcon ?
                          <i className={`fa-solid ${statusIcon}`}></i>
                        : <span className="text-[8px]">{idx + 1}</span>}
                      </div>
                      {/* Name */}
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-xs font-medium ${
                            isCurrent ? "text-white" : "text-white/70"
                          }`}>
                          {member.name}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              {/* Finish Button */}
              {completedMembers === totalMembers && totalMembers > 0 && (
                <div className="border-t border-white/10 p-2">
                  <button
                    onClick={async () => {
                      if (onRefresh) {
                        await onRefresh()
                      }
                      if (onClose) {
                        onClose()
                      }
                    }}
                    className="w-full rounded-lg border border-cyan-500/30 bg-cyan-500/20 px-3 py-2 text-[11px] font-bold tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/30">
                    <i className="fa-solid fa-check mr-1.5"></i>
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      </div>
    </div>
  )
}
