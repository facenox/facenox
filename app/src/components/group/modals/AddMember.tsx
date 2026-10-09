import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { flushSync } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { attendanceManager, backendService } from "@/services"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import { ErrorMessage, FormInput, Modal, Spinner } from "@/components/common"
import { useGroupUIStore, useGroupStore } from "@/components/group/stores"
import { useAttendanceStore } from "@/components/main/stores"
import { useCamera } from "@/components/group/sections/enrollment/hooks/useCamera"
import { Tooltip } from "@/components/shared"
import { validateAndGetBestFace } from "@/utils/faceValidation"
import { dataUrlToBlob } from "@/utils/dataUrl"

/**
 * Properties for the AddMember component.
 */
interface AddMemberProps {
  /** Indicates whether the add member modal is open */
  isOpen: boolean
  /** The attendance group to add the member to */
  group: AttendanceGroup
  /** Array of existing group members to prevent duplicate enrollments */
  existingMembers?: AttendanceMember[]
  /** Callback function when the modal is closed */
  onClose: () => void
  /** Callback function when a member is successfully added */
  onSuccess: () => void
}

interface CapturedFaceData {
  dataUrl: string
  bbox: number[]
  landmarks_5: number[][]
  confidence: number
}

const waitForNextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

const formatValidationError = (
  e: { type?: string; msg?: string; ctx?: { max_length?: number } },
  multiple?: boolean,
): string => {
  if (e.type === "string_too_long") {
    const prefix = multiple ? "Some names exceed" : "Name exceeds"
    return `${prefix} ${e.ctx?.max_length ?? 100} characters`
  }
  return e.msg ?? "Invalid value"
}

/**
 * A modal dialog that allows enrollment of a single new member
 * or multiple new members in bulk via a comma-separated list or file import.
 * Includes duplicate warnings.
 */
export function AddMember({
  isOpen,
  group,
  existingMembers = [],
  onClose,
  onSuccess,
}: AddMemberProps) {
  const initialMode = useGroupUIStore((state) => state.addMemberInitialMode)
  const [isBulkMode, setIsBulkMode] = useState(initialMode === "bulk")

  useEffect(() => {
    if (isOpen) {
      setIsBulkMode(initialMode === "bulk")
    }
  }, [isOpen, initialMode])
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberRole, setNewMemberRole] = useState("")
  const [bulkMembersText, setBulkMembersText] = useState("")
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [bulkResults, setBulkResults] = useState<{
    success: number
    failed: number
    errors: string[]
  } | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{
    current: number
    total: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  // Inline Face Enrollment states
  const [isFaceSectionOpen, setIsFaceSectionOpen] = useState(false)
  const [capturedFace, setCapturedFace] = useState<CapturedFaceData | null>(null)
  const [faceInputMode, setFaceInputMode] = useState<"camera" | "upload">("camera")
  const [isProcessingFace, setIsProcessingFace] = useState(false)
  const [faceError, setFaceError] = useState<string | null>(null)
  const [lastAddedSuccess, setLastAddedSuccess] = useState<string | null>(null)
  const lastAddedTimerRef = useRef<NodeJS.Timeout | null>(null)

  const { videoRef, isStreaming, isVideoReady, cameraError, startCamera, stopCamera } = useCamera()

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
    }
  }, [isOpen, stopCamera])

  // Auto-start camera when face section is opened in camera mode
  useEffect(() => {
    let active = true
    if (isOpen && isFaceSectionOpen && faceInputMode === "camera" && !isStreaming) {
      const timer = setTimeout(() => {
        if (active) {
          startCamera().catch(console.error)
        }
      }, 50)
      return () => clearTimeout(timer)
    }
    return () => {
      active = false
    }
  }, [isOpen, isFaceSectionOpen, faceInputMode, isStreaming, startCamera])

  const nameInputRef = useRef<HTMLInputElement>(null)
  const singleSubmitInFlightRef = useRef(false)
  const bulkSubmitInFlightRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (lastAddedTimerRef.current) {
        clearTimeout(lastAddedTimerRef.current)
      }
      stopCamera()
    }
  }, [stopCamera])

  const resetForm = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (lastAddedTimerRef.current) {
      clearTimeout(lastAddedTimerRef.current)
      lastAddedTimerRef.current = null
    }
    stopCamera()
    setNewMemberName("")
    setNewMemberRole("")
    setBulkMembersText("")
    setBulkResults(null)
    setBulkProgress(null)
    setIsBulkMode(false)
    setConfirmDuplicate(false)
    setError(null)
    setCapturedFace(null)
    setFaceError(null)
    setIsFaceSectionOpen(false)
    setLastAddedSuccess(null)
  }

  const handleSnapPhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setFaceError("Camera is not ready yet.")
      return
    }

    try {
      setIsProcessingFace(true)
      setFaceError(null)

      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Could not initialize image canvas.")

      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95)
      const blob = dataUrlToBlob(dataUrl)

      const detection = await backendService.detectFaces(blob, {
        model_type: "face_detector",
        enableLiveness: false,
      })

      const bestFace = validateAndGetBestFace(detection)

      setCapturedFace({
        dataUrl,
        bbox: bestFace.bbox,
        landmarks_5: bestFace.landmarks_5,
        confidence: bestFace.confidence,
      })
      stopCamera()
    } catch (err) {
      const msg =
        err instanceof Error ?
          err.message
        : "Face detection failed. Ensure face is clearly visible."
      setFaceError(msg)
    } finally {
      setIsProcessingFace(false)
    }
  }, [videoRef, stopCamera])

  const handleProcessUploadedFile = useCallback(async (file: File) => {
    try {
      setIsProcessingFace(true)
      setFaceError(null)

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.onerror = () => reject(new Error("Failed to read image file."))
        reader.readAsDataURL(file)
      })

      const blob = dataUrlToBlob(dataUrl)
      const detection = await backendService.detectFaces(blob, {
        model_type: "face_detector",
        enableLiveness: false,
      })

      const bestFace = validateAndGetBestFace(detection)

      setCapturedFace({
        dataUrl,
        bbox: bestFace.bbox,
        landmarks_5: bestFace.landmarks_5,
        confidence: bestFace.confidence,
      })
    } catch (err) {
      const msg =
        err instanceof Error ?
          err.message
        : "Face detection failed. Ensure face is clearly visible."
      setFaceError(msg)
    } finally {
      setIsProcessingFace(false)
    }
  }, [])

  useEffect(() => {
    if (!isBulkMode && nameInputRef.current) {
      const focusInput = () => {
        if (nameInputRef.current) {
          nameInputRef.current.focus()
          nameInputRef.current.select()
          nameInputRef.current.click()
        }
      }

      requestAnimationFrame(() => {
        focusInput()
        setTimeout(focusInput, 50)
        setTimeout(focusInput, 150)
      })
    }
  }, [isBulkMode])

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text()
      setBulkMembersText(text)
      setBulkResults(null)
    } catch {
      setError("Unable to read file. Select a valid TXT or CSV file.")
    }
  }

  const isDuplicate = useMemo(() => {
    if (!newMemberName.trim()) return false
    const normalizedName = newMemberName.trim().toLowerCase()
    return existingMembers.some((m) => m.name.toLowerCase() === normalizedName)
  }, [newMemberName, existingMembers])

  const typedCount = useMemo(() => {
    return bulkMembersText.split("\n").filter((line) => line.trim()).length
  }, [bulkMembersText])

  const modalSubtitle = isBulkMode ? "Add multiple members to" : "Add member to"

  // Reset confirmation when name changes
  useEffect(() => {
    setConfirmDuplicate(false)
  }, [newMemberName])

  const handleAddMember = async (addAnother = false) => {
    if (singleSubmitInFlightRef.current) {
      return
    }

    if (!newMemberName.trim()) {
      return
    }

    if (isDuplicate && !confirmDuplicate) {
      setConfirmDuplicate(true)
      return
    }

    singleSubmitInFlightRef.current = true
    flushSync(() => {
      setLoading(true)
    })

    try {
      await waitForNextPaint()
      const newMember = await attendanceManager.addMember(group.id, newMemberName.trim(), {
        role: newMemberRole.trim() || undefined,
      })

      let faceEnrolled = false
      if (capturedFace) {
        try {
          const res = await attendanceManager.enrollFaceForGroupPerson(
            group.id,
            newMember.person_id,
            capturedFace.dataUrl,
            capturedFace.bbox,
            capturedFace.landmarks_5,
          )
          if (res.success) {
            faceEnrolled = true
            newMember.has_face_data = true
          }
        } catch (faceErr) {
          console.warn("Face enrollment failed during member add:", faceErr)
        }
      }

      useGroupStore.setState({
        members: [...useGroupStore.getState().members, newMember],
      })
      useAttendanceStore.setState({
        groupMembers: [...useAttendanceStore.getState().groupMembers, newMember],
      })

      onSuccess()

      if (addAnother) {
        setNewMemberName("")
        setNewMemberRole("")
        setCapturedFace(null)
        setFaceError(null)
        setConfirmDuplicate(false)
        setError(null)
        setLastAddedSuccess(`${newMember.name} added${faceEnrolled ? " (face enrolled)" : ""}`)
        if (lastAddedTimerRef.current) clearTimeout(lastAddedTimerRef.current)
        lastAddedTimerRef.current = setTimeout(() => setLastAddedSuccess(null), 3500)
        requestAnimationFrame(() => {
          nameInputRef.current?.focus()
        })
      } else {
        resetForm()
        onClose()
      }
    } catch (err) {
      console.error("Error adding member:", err)
      const rawMessage = err instanceof Error ? err.message : ""
      try {
        const parsed = JSON.parse(rawMessage)
        if (Array.isArray(parsed)) {
          const msgs = [...new Set(parsed.map((e) => formatValidationError(e)))]
          setError(msgs.join(". "))
        } else {
          setError(rawMessage || "Failed to add member")
        }
      } catch {
        setError(rawMessage || "Failed to add member")
      }
    } finally {
      singleSubmitInFlightRef.current = false
      setLoading(false)
    }
  }

  const handleBulkAddMembers = async () => {
    if (bulkSubmitInFlightRef.current) {
      return
    }

    if (!bulkMembersText.trim()) {
      return
    }

    bulkSubmitInFlightRef.current = true
    flushSync(() => {
      setIsProcessingBulk(true)
    })
    setBulkResults(null)

    try {
      await waitForNextPaint()
      const lines = bulkMembersText.split("\n").filter((line: string) => line.trim())
      const total = lines.length
      setBulkProgress({ current: 0, total })

      const membersToCreate: Array<{
        name: string
        role?: string
        email?: string
      }> = []
      const errors: string[] = []
      let failedPrecheck = 0

      for (const line of lines) {
        const parts = line.split(",").map((p: string) => p.trim())
        const name = parts[0]
        const role = parts[1] || ""

        if (!name) {
          failedPrecheck++
          errors.push(`Empty name in line: "${line}"`)
          continue
        }

        membersToCreate.push({
          name,
          role: role || undefined,
        })
      }

      let success = 0
      let failed = failedPrecheck

      if (membersToCreate.length > 0) {
        const chunkSize = 500
        const totalItems = membersToCreate.length
        setBulkProgress({ current: 0, total: totalItems })

        for (let i = 0; i < totalItems; i += chunkSize) {
          const chunk = membersToCreate.slice(i, i + chunkSize)

          setBulkProgress({ current: i, total: totalItems })
          const res = await attendanceManager.addMembersBulk(chunk, group.id)

          success += res.success_count
          failed += res.error_count
          if (res.errors && res.errors.length > 0) {
            res.errors.forEach((err) => {
              errors.push(`Failed: ${err.error}`)
            })
          }
          if (res.members && res.members.length > 0) {
            useGroupStore.setState({
              members: [...useGroupStore.getState().members, ...res.members],
            })
            useAttendanceStore.setState({
              groupMembers: [...useAttendanceStore.getState().groupMembers, ...res.members],
            })
          }
        }

        setBulkProgress({ current: totalItems, total: totalItems })
      }

      onSuccess()

      if (failed === 0) {
        resetForm()
        onClose()
      } else {
        setBulkResults({ success, failed, errors })
      }
    } catch (err) {
      console.warn("Validation error on bulk add:", err)
      const rawMessage = err instanceof Error ? err.message : ""
      try {
        const parsed = JSON.parse(rawMessage)
        if (Array.isArray(parsed)) {
          const msgs = [...new Set(parsed.map((e) => formatValidationError(e, parsed.length > 1)))]
          setError(msgs.join(". "))
        } else {
          setError(rawMessage || "Failed to bulk add members")
        }
      } catch {
        setError(rawMessage || "Failed to bulk add members")
      }
    } finally {
      bulkSubmitInFlightRef.current = false
      setIsProcessingBulk(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetForm()
        onClose()
      }}
      title={
        <div className="min-w-0">
          <h3 className="mb-1 truncate text-xl font-semibold tracking-tight">Add Members</h3>
          <p className="flex items-center gap-1.5 text-xs font-normal text-white/65">
            <span className="shrink-0">{modalSubtitle}</span>
            <Tooltip content={group.name} position="bottom">
              <span className="inline-block max-w-[260px] truncate align-bottom font-medium text-cyan-400/80 sm:max-w-[340px]">
                {group.name}
              </span>
            </Tooltip>
          </p>
        </div>
      }
      maxWidth="lg">
      <div className="custom-scroll -m-5 mt-2 max-h-[90vh] overflow-x-hidden overflow-y-auto p-5">
        {/* Mode selector Tabs */}
        <div className="mb-4 flex items-end justify-between border-b border-white/5">
          <div className="flex gap-6">
            <button
              onClick={() => {
                setIsBulkMode(false)
                setBulkMembersText("")
                setConfirmDuplicate(false)
              }}
              className={`relative rounded border-none bg-transparent pb-3 text-[12px] font-medium transition-colors outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none ${
                !isBulkMode ? "text-cyan-400" : "text-white/55 hover:text-white/80"
              }`}>
              Single
              {!isBulkMode && (
                <motion.div
                  layoutId="addMemberTabIndicator"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-0 left-0 h-[2px] w-full rounded-t-full bg-cyan-400"
                />
              )}
            </button>
            <button
              onClick={() => {
                setIsBulkMode(true)
                setNewMemberName("")
                setNewMemberRole("")
                setConfirmDuplicate(false)
              }}
              className={`relative rounded border-none bg-transparent pb-3 text-[12px] font-medium transition-colors outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none ${
                isBulkMode ? "text-cyan-400" : "text-white/55 hover:text-white/80"
              }`}>
              Multiple
              {isBulkMode && (
                <motion.div
                  layoutId="addMemberTabIndicator"
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-0 left-0 h-[2px] w-full rounded-t-full bg-cyan-400"
                />
              )}
            </button>
          </div>

          <AnimatePresence>
            {isBulkMode && typedCount > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="pb-3 text-[11px] font-medium text-cyan-400/80">
                {typedCount} {typedCount === 1 ? "member" : "members"}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {lastAddedSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mb-4 flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] font-medium text-cyan-300">
            <i className="fa-solid fa-circle-check text-[10px]" />
            {lastAddedSuccess}
          </motion.div>
        )}

        {error && <ErrorMessage message={error} className="mb-4" />}

        <div className="relative">
          <AnimatePresence mode="wait" initial={false}>
            {!isBulkMode ?
              <motion.div
                key="single"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="grid gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="flex flex-col sm:col-span-8">
                    <FormInput
                      ref={nameInputRef}
                      value={newMemberName}
                      onChange={(event) => setNewMemberName(event.target.value)}
                      placeholder="Name"
                      aria-label="Name"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddMember(false)
                      }}
                      focusColor={
                        isDuplicate && !confirmDuplicate ? "border-amber-400" : "border-white/20"
                      }
                      className={`${isDuplicate && !confirmDuplicate ? "border-amber-500/50" : ""}`}
                    />
                    {isDuplicate && !confirmDuplicate && (
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-400/80">
                        <i className="fa-solid fa-triangle-exclamation text-[10px]"></i> A member
                        with this name already exists.
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:col-span-4">
                    <FormInput
                      value={newMemberRole}
                      onChange={(event) => setNewMemberRole(event.target.value)}
                      placeholder="Role (optional)"
                      aria-label="Role (optional)"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddMember(false)
                      }}
                      focusColor="border-white/20"
                    />
                  </div>
                </div>

                {/* Inline Face Enrollment Section */}
                <div className="overflow-hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    {capturedFace ?
                      <motion.div
                        key="captured"
                        initial={{ opacity: 0, y: -6, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -6, height: 0 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2.5">
                        <img
                          src={capturedFace.dataUrl}
                          alt="Captured face preview"
                          className="h-9 w-9 rounded-full border border-cyan-500/30 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-cyan-300">Face enrolled</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCapturedFace(null)
                              setFaceError(null)
                              setIsFaceSectionOpen(true)
                              setFaceInputMode("camera")
                              startCamera().catch(console.error)
                            }}
                            className="rounded px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                            Retake
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCapturedFace(null)
                              setFaceError(null)
                              setIsFaceSectionOpen(false)
                            }}
                            className="rounded px-2.5 py-1 text-[11px] font-medium text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-300">
                            Remove
                          </button>
                        </div>
                      </motion.div>
                    : !isFaceSectionOpen ?
                      <motion.div
                        key="collapsed"
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -3 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="flex items-center justify-between py-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-white/80">
                            Face Enrollment
                          </span>
                          <span className="text-[10px] text-white/35">can be added later</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsFaceSectionOpen(true)
                            setFaceInputMode("camera")
                            startCamera().catch(console.error)
                          }}
                          className="text-[11px] font-medium text-cyan-400 transition-colors hover:text-cyan-300">
                          + Enroll now
                        </button>
                      </motion.div>
                    : <motion.div
                        key="expanded"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-2">
                        <div className="flex items-center justify-between px-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-white/80">
                              Face Enrollment
                            </span>
                            <span className="text-[10px] text-white/35">can be added later</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsFaceSectionOpen(false)
                              stopCamera()
                            }}
                            className="text-[10px] font-medium text-white/40 transition-colors hover:text-white/70">
                            Hide
                          </button>
                        </div>

                        <div>
                          <AnimatePresence mode="wait">
                            {faceInputMode === "camera" ?
                              <motion.div
                                key="face-camera-mode"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="relative flex h-60 w-full flex-col items-center justify-between overflow-hidden rounded-xl border border-white/10 bg-black/60 p-2.5">
                                <video
                                  ref={videoRef}
                                  className={`absolute inset-0 h-full w-full scale-x-[-1] object-cover transition-opacity duration-300 ${
                                    isStreaming && isVideoReady ? "opacity-100" : (
                                      "pointer-events-none opacity-0"
                                    )
                                  }`}
                                  playsInline
                                  muted
                                />

                                {/* Top spacer */}
                                <div className="z-10 h-1 w-full" />

                                <AnimatePresence>
                                  {(!isStreaming || !isVideoReady) && (
                                    <motion.div
                                      initial={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="z-10 flex flex-col items-center justify-center gap-2 p-4 text-center">
                                      {cameraError ?
                                        <div className="flex flex-col items-center gap-2">
                                          <i className="fa-solid fa-circle-exclamation text-base text-red-400" />
                                          <span className="max-w-[240px] text-[11px] font-medium text-red-200/80">
                                            {cameraError}
                                          </span>
                                        </div>
                                      : <div className="flex flex-col items-center gap-2.5">
                                          <Spinner size="md" color="cyan" />
                                          <span className="text-xs font-medium text-white/60">
                                            Connecting camera...
                                          </span>
                                        </div>
                                      }
                                    </motion.div>
                                  )}
                                </AnimatePresence>

                                {/* Bottom Control Bar — Matching Normal Enrollment UI */}
                                <div className="relative z-10 flex w-full items-center justify-between px-1">
                                  {/* Left: Upload Button */}
                                  <div className="w-20">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFaceInputMode("upload")
                                        stopCamera()
                                      }}
                                      className="group flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-[10px] font-medium text-white/70 backdrop-blur-md transition-all hover:border-white/25 hover:bg-black/70 hover:text-white"
                                      title="Upload Photo Instead">
                                      <i className="fa-solid fa-file-image text-[10px] text-white/50 group-hover:text-white/80" />
                                      <span>Upload</span>
                                    </button>
                                  </div>

                                  {/* Center: Circular Shutter Trigger */}
                                  <div className="flex flex-1 justify-center">
                                    {isStreaming && isVideoReady && (
                                      <button
                                        type="button"
                                        onClick={handleSnapPhoto}
                                        disabled={isProcessingFace}
                                        className="group flex h-11 w-11 items-center justify-center rounded-full bg-white/10 p-1 backdrop-blur-md transition-all hover:bg-white/20 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Capture Face"
                                        title="Capture Face">
                                        {isProcessingFace ?
                                          <div className="flex h-full w-full items-center justify-center rounded-full bg-white/10">
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                                          </div>
                                        : <div className="h-full w-full rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.35)] transition-transform group-active:scale-90" />
                                        }
                                      </button>
                                    )}
                                  </div>

                                  {/* Right spacer for balance */}
                                  <div className="w-20" />
                                </div>
                              </motion.div>
                            : <motion.div
                                key="face-upload-mode"
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="space-y-2">
                                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-4 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/[0.02]">
                                  <i className="fa-solid fa-image mb-1 text-lg text-white/30" />
                                  <span className="text-[11px] font-medium text-white/70">
                                    {isProcessingFace ?
                                      "Analyzing face..."
                                    : "Click or drop portrait photo"}
                                  </span>
                                  <span className="mt-0.5 text-[10px] text-white/40">
                                    JPG, PNG up to 10MB
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) void handleProcessUploadedFile(file)
                                      e.target.value = ""
                                    }}
                                  />
                                </label>
                                <div className="flex justify-start">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFaceInputMode("camera")
                                      if (!isStreaming) {
                                        startCamera().catch(console.error)
                                      }
                                    }}
                                    className="group flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-medium text-white/70 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white">
                                    <i className="fa-solid fa-camera text-[10px] text-cyan-400" />
                                    <span>Use Camera</span>
                                  </button>
                                </div>
                              </motion.div>
                            }
                          </AnimatePresence>

                          {faceError && (
                            <div className="flex items-center gap-1.5 pl-1 text-[11px] text-red-400/90">
                              <i className="fa-solid fa-circle-exclamation text-[10px]" />
                              {faceError}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    }
                  </AnimatePresence>
                </div>
              </motion.div>
            : <motion.div
                key="bulk"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="space-y-4">
                <div>
                  <textarea
                    value={bulkMembersText}
                    onChange={(event) => {
                      setBulkMembersText(event.target.value)
                      if (bulkResults) {
                        setBulkResults(null)
                      }
                    }}
                    className="custom-scroll min-h-[132px] w-full resize-none rounded-lg border border-white/10 bg-[rgba(22,28,36,0.68)] px-4 py-3 font-mono text-sm transition-all duration-300 outline-none placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-white/35 focus:border-white/20 focus:bg-[rgba(28,35,44,0.82)]"
                    placeholder="Enter one member per line"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-[11px] text-white/55">
                      Format: <span className="font-mono text-white/65">Name, Role</span>
                    </div>
                    <label className="group flex cursor-pointer items-center gap-1.5 text-xs font-medium text-cyan-400/80 transition-colors hover:text-cyan-400">
                      <i className="fa-solid fa-file-arrow-up transition-transform group-hover:-translate-y-0.5"></i>
                      Import .CSV or .TXT
                      <input
                        type="file"
                        accept=".txt,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) void handleFileUpload(file)
                          e.target.value = ""
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Bulk Results */}
                {bulkResults && (
                  <div className="py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {bulkResults.failed === 0 ?
                          <>
                            <i className="fa-solid fa-circle-check text-[13px] text-cyan-400" />
                            <span className="text-[13px] font-semibold text-cyan-400">
                              Import complete
                            </span>
                          </>
                        : <>
                            <i className="fa-solid fa-triangle-exclamation text-[13px] text-amber-400" />
                            <span className="text-[13px] font-semibold text-amber-400">
                              Import complete with warnings
                            </span>
                          </>
                        }
                      </div>
                      <span className="text-[11px] font-medium text-white/55">
                        {bulkResults.success} added, {bulkResults.failed} failed
                      </span>
                    </div>
                    {bulkResults.errors.length > 0 && (
                      <div className="custom-scroll mt-3 max-h-32 space-y-1.5 overflow-y-auto pl-1">
                        {bulkResults.errors.map((err: string, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-start gap-1.5 text-[11px] leading-relaxed text-red-400/90">
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-red-400/60" />
                            <span>{err}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            }
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        {!(isBulkMode && bulkResults && bulkResults.failed === 0) && (
          <div className="mt-6 flex justify-end gap-3">
            {isBulkMode && bulkResults ?
              <button
                onClick={() => {
                  resetForm()
                  onClose()
                }}
                className="rounded-lg bg-cyan-500 px-6 py-2 text-[11px] font-bold tracking-wider text-slate-950 transition-all duration-200 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
                Close
              </button>
            : <>
                <button
                  type="button"
                  onClick={() => {
                    resetForm()
                    onClose()
                  }}
                  className="rounded-lg px-4 py-2 text-[11px] font-medium text-white/55 transition-all duration-200 hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97]">
                  Cancel
                </button>
                <button
                  onClick={
                    isBulkMode ?
                      () => void handleBulkAddMembers()
                    : () => void handleAddMember(false)
                  }
                  disabled={
                    loading ||
                    isProcessingBulk ||
                    (!isBulkMode && !newMemberName.trim()) ||
                    (isBulkMode && !bulkMembersText.trim()) ||
                    isProcessingFace
                  }
                  className={`min-w-[120px] rounded-lg px-6 py-2 text-[11px] font-bold tracking-wider transition-all duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-secondary)] focus-visible:outline-none active:scale-[0.97] disabled:opacity-30 ${
                    confirmDuplicate && !isBulkMode ?
                      "bg-amber-500 text-slate-950 hover:bg-amber-400 focus-visible:ring-amber-400"
                    : "bg-cyan-500 text-slate-950 hover:bg-cyan-400 focus-visible:ring-cyan-400"
                  }`}>
                  {loading || isProcessingBulk ?
                    bulkProgress ?
                      `Processing (${bulkProgress.current}/${bulkProgress.total})`
                    : "Processing..."
                  : confirmDuplicate && !isBulkMode ?
                    "Add Anyway"
                  : isBulkMode ?
                    "Add Members"
                  : "Add Member"}
                </button>
              </>
            }
          </div>
        )}
      </div>
    </Modal>
  )
}
