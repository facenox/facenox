import { useState, useCallback, useMemo } from "react"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { DetectedFace, BulkRegistrationResult } from "@/components/group/modals/types"
import { makeId, readFileAsDataUrl } from "@/utils/imageHelpers"
import { attendanceManager } from "@/services/AttendanceManager"

export function useBulkRegistration(
  group: AttendanceGroup,
  members: AttendanceMember[],
  onRefresh?: () => Promise<void> | void,
) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([])
  const [isDetecting, setIsDetecting] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registrationResults, setRegistrationResults] = useState<BulkRegistrationResult[] | null>(
    null,
  )

  const availableMembers = useMemo(() => {
    const assignedIds = new Set(detectedFaces.map((f) => f.assignedPersonId).filter(Boolean))
    return members.filter((m) => !assignedIds.has(m.person_id))
  }, [members, detectedFaces])

  const createFacePreview = useCallback(
    async (
      imageDataUrl: string,
      bbox:
        | { x: number; y: number; width: number; height: number }
        | [number, number, number, number],
    ): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const [x, y, w, h] =
            Array.isArray(bbox) ? bbox : [bbox.x, bbox.y, bbox.width, bbox.height]

          const padding = 20
          const desiredX = x - padding
          const desiredY = y - padding
          const desiredW = w + padding * 2
          const desiredH = h + padding * 2

          const cropX = Math.max(0, desiredX)
          const cropY = Math.max(0, desiredY)
          const cropX2 = Math.min(img.width, desiredX + desiredW)
          const cropY2 = Math.min(img.height, desiredY + desiredH)
          const cropW = cropX2 - cropX
          const cropH = cropY2 - cropY

          const offsetX = Math.max(0, -desiredX)
          const offsetY = Math.max(0, -desiredY)

          canvas.width = desiredW
          canvas.height = desiredH

          const ctx = canvas.getContext("2d")
          if (ctx && cropW > 0 && cropH > 0) {
            ctx.drawImage(img, cropX, cropY, cropW, cropH, offsetX, offsetY, cropW, cropH)
            resolve(canvas.toDataURL("image/jpeg", 0.9))
          } else {
            resolve(imageDataUrl)
          }
        }
        img.src = imageDataUrl
      })
    },
    [],
  )

  const handleDetectFaces = useCallback(
    async (filesToProcess?: File[]) => {
      const files = filesToProcess || uploadedFiles
      if (files.length === 0) {
        setError("Please upload images first")
        return
      }

      setIsDetecting(true)
      setError(null)

      try {
        const result = await attendanceManager.bulkDetectFaces(group.id, files)

        const allDetectedFaces: DetectedFace[] = []

        for (const imageResult of result.results) {
          if (!imageResult.success || !imageResult.faces || imageResult.faces.length === 0) {
            continue
          }

          const imageIdx = parseInt(imageResult.image_id.replace("image_", ""))
          const file = files[imageIdx]
          const dataUrl = await readFileAsDataUrl(file)

          for (const face of imageResult.faces) {
            const previewUrl = await createFacePreview(dataUrl, face.bbox)

            allDetectedFaces.push({
              faceId: makeId(),
              imageId: imageResult.image_id,
              bbox: face.bbox,
              confidence: face.confidence,
              landmarks_5: face.landmarks_5,
              qualityScore: face.quality_score,
              isAcceptable: face.is_acceptable,
              suggestions: [], // Standardized service doesn't provide these yet
              assignedPersonId: null,
              previewUrl,
            })
          }
        }

        setDetectedFaces(allDetectedFaces)
        if (allDetectedFaces.length === 0) {
          setError("No faces detected in uploaded images")
        }
      } catch (err) {
        console.error("Face detection error:", err)
        setError(err instanceof Error ? err.message : "Failed to detect faces")
      } finally {
        setIsDetecting(false)
      }
    },
    [uploadedFiles, group.id, createFacePreview],
  )

  const handleFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"))
      if (imageFiles.length === 0) {
        setError("No valid image files selected")
        return
      }

      if (imageFiles.length > 50) {
        setError("Maximum 50 images allowed")
        return
      }

      setUploadedFiles(imageFiles)
      setDetectedFaces([])
      setRegistrationResults(null)
      setError(null)

      await handleDetectFaces(imageFiles)
    },
    [handleDetectFaces],
  )

  const handleAssignMember = useCallback((faceId: string, personId: string) => {
    setDetectedFaces((prev) =>
      prev.map((face) => (face.faceId === faceId ? { ...face, assignedPersonId: personId } : face)),
    )
  }, [])

  const handleUnassign = useCallback((faceId: string) => {
    setDetectedFaces((prev) =>
      prev.map((face) => (face.faceId === faceId ? { ...face, assignedPersonId: null } : face)),
    )
  }, [])

  const handleBulkRegister = useCallback(async () => {
    const assignedFaces = detectedFaces.filter((f) => f.assignedPersonId)
    if (assignedFaces.length === 0) {
      setError("Please assign at least one face to a member")
      return
    }

    setIsRegistering(true)
    setError(null)
    setRegistrationResults(null)

    try {
      const registrations = assignedFaces.map((face) => {
        const imageIdx = parseInt(face.imageId.replace("image_", ""))
        const file = uploadedFiles[imageIdx]
        const filename = `image_${imageIdx}.${file.name.split(".").pop() || "jpg"}`

        return {
          person_id: face.assignedPersonId!,
          filename: filename,
          bbox: face.bbox,
          landmarks_5: face.landmarks_5 || [],
        }
      })

      // Collect unique files needed with their associated names
      const uniqueImageIndices = Array.from(
        new Set(assignedFaces.map((f) => parseInt(f.imageId.replace("image_", "")))),
      )
      const imageFiles: { file: File; filename: string }[] = uniqueImageIndices.map((idx) => {
        const file = uploadedFiles[idx]
        return {
          file,
          filename: `image_${idx}.${file.name.split(".").pop() || "jpg"}`,
        }
      })

      const result = await attendanceManager.bulkRegisterFaces(group.id, registrations, imageFiles)

      const results: BulkRegistrationResult[] = result.results.map((r) => {
        // Find member info for the name
        const member = members.find((m) => m.person_id === r.person_id)
        return {
          personId: r.person_id!,
          memberName: member?.name || "Unknown Member",
          success: r.success,
          error: r.error,
        }
      })

      setRegistrationResults(results)
      if (result.success_count > 0 && onRefresh) {
        await onRefresh()
      }
    } catch (err) {
      console.error("Bulk registration error:", err)
      setError(err instanceof Error ? err.message : "Failed to register faces")
    } finally {
      setIsRegistering(false)
    }
  }, [detectedFaces, uploadedFiles, group.id, members, onRefresh])

  return {
    uploadedFiles,
    detectedFaces,
    isDetecting,
    isRegistering,
    error,
    setError,
    registrationResults,
    availableMembers,
    handleFilesSelected,
    handleAssignMember,
    handleUnassign,
    handleBulkRegister,
  }
}
