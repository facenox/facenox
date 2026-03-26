import { useState, useCallback, useMemo } from "react"

import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type {
  DetectedFace,
  BulkRegistrationResult,
  BulkRegisterResponseItem,
} from "@/components/group/sections/registration/types"
import { attendanceManager } from "@/services/AttendanceManager"
import { makeId, readFileAsDataUrl } from "@/utils/imageHelpers"

export interface PendingDuplicateFiles {
  duplicates: File[]
  newFiles: File[]
}

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

  const [pendingDuplicates, setPendingDuplicates] = useState<PendingDuplicateFiles | null>(null)

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
    async (filesToProcess?: File[], startIndex = 0) => {
      const files = filesToProcess || uploadedFiles
      if (files.length === 0) {
        if (!filesToProcess) setError("Please upload images first")
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
          if (!file) {
            console.error(`No file found for image index ${imageIdx}`)
            continue
          }
          const dataUrl = await readFileAsDataUrl(file)
          const absoluteImageId = `image_${imageIdx + startIndex}`

          for (const face of imageResult.faces) {
            const previewUrl = await createFacePreview(dataUrl, face.bbox)

            allDetectedFaces.push({
              faceId: makeId(),
              imageId: absoluteImageId,
              bbox: face.bbox,
              confidence: face.confidence,
              landmarks_5: face.landmarks_5,
              qualityScore: face.quality_score,
              isAcceptable: face.is_acceptable,
              suggestions: face.suggestions || [],
              assignedPersonId: null,
              previewUrl,
            })
          }
        }

        setDetectedFaces((prev) =>
          filesToProcess ? [...prev, ...allDetectedFaces] : allDetectedFaces,
        )

        if (allDetectedFaces.length === 0) {
          setError(
            filesToProcess ? "No new faces detected" : "No faces detected in uploaded images",
          )
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

  const isFileDuplicate = useCallback(
    (file: File): boolean => {
      return uploadedFiles.some(
        (existing) => existing.name === file.name && existing.size === file.size,
      )
    },
    [uploadedFiles],
  )

  const processFiles = useCallback(
    async (filesToProcess: File[]) => {
      if (filesToProcess.length === 0) return

      const startIndex = uploadedFiles.length
      setUploadedFiles((prev) => [...prev, ...filesToProcess])

      await handleDetectFaces(filesToProcess, startIndex)
    },
    [handleDetectFaces, uploadedFiles.length],
  )

  const handleFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files) return

      const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"))

      if (imageFiles.length === 0) return

      const duplicates: File[] = []
      const newFiles: File[] = []

      for (const file of imageFiles) {
        if (isFileDuplicate(file)) {
          duplicates.push(file)
        } else {
          newFiles.push(file)
        }
      }

      if (duplicates.length > 0) {
        setPendingDuplicates({ duplicates, newFiles })
        return
      }

      await processFiles(newFiles)
    },
    [isFileDuplicate, processFiles],
  )

  const handleConfirmDuplicates = useCallback(async () => {
    if (!pendingDuplicates) return

    const allFiles = [...pendingDuplicates.newFiles, ...pendingDuplicates.duplicates]
    setPendingDuplicates(null)
    await processFiles(allFiles)
  }, [pendingDuplicates, processFiles])

  const handleCancelDuplicates = useCallback(async () => {
    if (!pendingDuplicates) return

    const newFilesOnly = pendingDuplicates.newFiles
    setPendingDuplicates(null)

    if (newFilesOnly.length > 0) {
      await processFiles(newFilesOnly)
    }
  }, [pendingDuplicates, processFiles])

  const handleDismissDuplicates = useCallback(() => {
    setPendingDuplicates(null)
  }, [])

  const handleClearFiles = useCallback(() => {
    setUploadedFiles([])
    setDetectedFaces([])
    setError(null)
    setRegistrationResults(null)
    setPendingDuplicates(null)
  }, [])

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
        return {
          person_id: face.assignedPersonId as string,
          bbox: face.bbox,
          landmarks_5: face.landmarks_5 as number[][],
          skip_quality_check: false,
          filename: file.name,
        }
      })

      const result = await attendanceManager.bulkRegisterFaces(
        group.id,
        registrations,
        uploadedFiles
          .filter((_, i) =>
            assignedFaces.some((f) => parseInt(f.imageId.replace("image_", "")) === i),
          )
          .map((file) => ({
            file,
            filename: file.name,
          })),
      )
      const results: BulkRegistrationResult[] = result.results.map(
        (r: BulkRegisterResponseItem) => ({
          personId: r.person_id,
          memberName: r.member_name || "",
          success: r.success,
          error: r.error,
          qualityWarning: r.quality_warning,
        }),
      )

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
  }, [detectedFaces, uploadedFiles, group.id, onRefresh])

  return {
    uploadedFiles,
    detectedFaces,
    isDetecting,
    isRegistering,
    error,
    setError,
    registrationResults,
    availableMembers,
    pendingDuplicates,
    handleFilesSelected,
    handleConfirmDuplicates,
    handleCancelDuplicates,
    handleDismissDuplicates,
    handleAssignMember,
    handleUnassign,
    handleBulkRegister,
    handleClearFiles,
  }
}
