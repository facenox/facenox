import { useState, useCallback, useEffect } from "react"
import { attendanceManager, backendService } from "@/services"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { DialogAPI } from "@/components/shared"
import type { CapturedFrame } from "@/components/group/sections/enrollment/types"
import { makeId } from "@/utils/imageHelpers"
import { dataUrlToBlob } from "@/utils/dataUrl"
import { validateAndGetBestFace } from "@/utils/faceValidation"

export function useFaceCapture(
  group: AttendanceGroup | null,
  members: AttendanceMember[],
  onRefresh?: () => Promise<void> | void,
  dialog?: Pick<DialogAPI, "confirm">,
) {
  const [frames, setFrames] = useState<CapturedFrame[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isEnrolling, setIsEnrolling] = useState(false)

  // Automatically clear errors after a few seconds so they don't linger on the UI
  useEffect(() => {
    if (globalError) {
      const timer = setTimeout(() => setGlobalError(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [globalError])

  const resetFrames = useCallback(() => {
    setFrames([])
  }, [])

  const updateFrame = useCallback(
    (frameId: string, updater: (frame: CapturedFrame) => CapturedFrame) => {
      setFrames((prev) => prev.map((frame) => (frame.id === frameId ? updater(frame) : frame)))
    },
    [],
  )

  const captureProcessedFrame = useCallback(
    async (angle: string, dataUrl: string, width: number, height: number) => {
      const id = makeId()

      setGlobalError(null)
      setSuccessMessage(null)

      // Replace any previous capture for this slot
      setFrames((prev) => [
        ...prev.filter((frame) => frame.angle !== angle),
        {
          id,
          angle,
          label: angle,
          dataUrl,
          width,
          height,
          status: "processing",
        },
      ])

      try {
        const blob = dataUrlToBlob(dataUrl)

        const detection = await backendService.detectFaces(blob, {
          model_type: "face_detector",
          enableLiveness: false, // Enrollment should not enforce liveness
        })

        const bestFace = validateAndGetBestFace(detection)

        updateFrame(id, (frame) => ({
          ...frame,
          status: "ready",
          confidence: bestFace.confidence,
          bbox: bestFace.bbox,
          landmarks_5: bestFace.landmarks_5,
          error: undefined,
        }))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Biometric analysis failed. Try again."
        setFrames((prev) => prev.filter((frame) => frame.id !== id))
        setGlobalError(message)
      }
    },
    [updateFrame],
  )

  const handleEnroll = useCallback(
    async (
      selectedMemberId: string,
      loadMemberStatus: () => Promise<void>,
      memberStatus: Map<string, boolean>,
    ) => {
      if (!group) {
        setGlobalError("No group selected.")
        return
      }

      const frame = frames.find((f) => f.angle === "Front")

      if (frame?.status !== "ready" || !frame.bbox) {
        setGlobalError("Capture a valid enrollment image to proceed.")
        return
      }

      setIsEnrolling(true)
      setGlobalError(null)
      setSuccessMessage(null)

      try {
        const blob = dataUrlToBlob(frame.dataUrl)

        if (frame.landmarks_5?.length !== 5) {
          throw new Error("Cannot enroll: facial features are missing. Capture a new image.")
        }

        const result = await attendanceManager.enrollFaceForGroupPerson(
          group.id,
          selectedMemberId,
          blob,
          frame.bbox,
          frame.landmarks_5,
        )

        if (!result.success) {
          throw new Error(result.error || "Enrollment failed.")
        }

        updateFrame(frame.id, (current) => ({
          ...current,
          status: "enrolled",
        }))

        const isAlreadyEnrolled = memberStatus.get(selectedMemberId) ?? false
        const member = members.find((m) => m.person_id === selectedMemberId)
        const memberName = member?.name || "Member"

        setSuccessMessage(
          isAlreadyEnrolled ?
            `${memberName} Re-enrolled successfully!`
          : `${memberName} Enrolled successfully!`,
        )

        await loadMemberStatus()
        if (onRefresh) await onRefresh()

        // Trigger immediate sync so other paired devices receive the new embedding
        try {
          if (window.electronAPI?.sync?.triggerNow) {
            window.electronAPI.sync.triggerNow().catch(() => {})
          }
        } catch {
          // Sync trigger is best-effort
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Enrollment failed. Try again."
        setGlobalError(message)
      } finally {
        setIsEnrolling(false)
      }
    },
    [group, frames, members, updateFrame, onRefresh],
  )

  const handleRemoveFaceData = useCallback(
    async (
      member: AttendanceMember & { displayName?: string },
      loadMemberStatus: () => Promise<void>,
    ) => {
      if (!group) return

      const displayName = member.displayName || member.name

      if (dialog) {
        const ok = await dialog.confirm({
          title: "Purge embeddings",
          message: `Remove all face embeddings for ${displayName}?`,
          confirmText: "Remove",
          cancelText: "Cancel",
          confirmVariant: "danger",
        })
        if (!ok) return
      } else {
        const confirmation = window.confirm(`Remove all face embeddings for ${displayName}?`)
        if (!confirmation) return
      }

      try {
        const result = await attendanceManager.removeFaceDataForGroupPerson(
          group.id,
          member.person_id,
        )
        if (!result.success) {
          throw new Error(result.error || "Failed to remove embeddings")
        }
        await loadMemberStatus()
        if (onRefresh) await onRefresh()
        setSuccessMessage(`Embeddings purged for ${displayName}.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to remove face data."
        setGlobalError(message)
      }
    },
    [group, onRefresh, dialog],
  )

  return {
    frames,
    globalError,
    successMessage,
    isEnrolling,
    setGlobalError,
    setSuccessMessage,
    resetFrames,
    captureProcessedFrame,
    handleEnroll,
    handleRemoveFaceData,
  }
}
