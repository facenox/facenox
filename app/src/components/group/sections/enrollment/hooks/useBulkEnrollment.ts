import { useState, useCallback, useMemo } from "react"

import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type {
  DetectedFace,
  BulkEnrollmentResult,
  BulkEnrollResponseItem,
} from "@/components/group/sections/enrollment/types"
import { attendanceManager } from "@/services/AttendanceManager"
import { makeId, readFileAsDataUrl } from "@/utils/imageHelpers"
import { parsePhotoFilename } from "@/utils/filenameParser"
import { useGroupStore } from "@/components/group/stores"
import { useAttendanceStore } from "@/components/main/stores"

export interface PendingDuplicateFiles {
  duplicates: File[]
  newFiles: File[]
}

export function useBulkEnrollment(
  group: AttendanceGroup,
  members: AttendanceMember[],
  onRefresh?: () => Promise<void> | void,
) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([])
  const [isDetecting, setIsDetecting] = useState(false)
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enrollmentResults, setEnrollmentResults] = useState<BulkEnrollmentResult[] | null>(null)

  const [pendingDuplicates, setPendingDuplicates] = useState<PendingDuplicateFiles | null>(null)

  const availableMembers = useMemo(() => {
    const assignedIds = new Set(detectedFaces.map((f) => f.assignedPersonId).filter(Boolean))
    return members.filter((m) => !assignedIds.has(m.person_id))
  }, [members, detectedFaces])

  const createFacePreview = useCallback(
    async (
      imageDataUrl: string,
      bbox:
        { x: number; y: number; width: number; height: number } | [number, number, number, number],
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
        if (!filesToProcess) setError("Upload image files to begin face detection.")
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

          // Smart Filename Parsing & Auto-Matching
          const { name: parsedName, role: parsedRole } = parsePhotoFilename(file.name)
          const normalizedParsed = parsedName.toLowerCase()
          const matchedMember = members.find((m) => m.name.toLowerCase() === normalizedParsed)

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
              assignedPersonId: matchedMember ? matchedMember.person_id : null,
              previewUrl,
              filename: file.name,
              parsedName,
              parsedRole,
              isAutoMatched: Boolean(matchedMember),
              isNewMember: !matchedMember,
              customMemberName: matchedMember ? matchedMember.name : parsedName,
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
    [uploadedFiles, group.id, createFacePreview, members],
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
    setEnrollmentResults(null)
    setPendingDuplicates(null)
  }, [])

  const handleAssignMember = useCallback(
    (faceId: string, personId: string) => {
      setDetectedFaces((prev) =>
        prev.map((face) => {
          if (face.faceId !== faceId) return face
          const matched = members.find((m) => m.person_id === personId)
          return {
            ...face,
            assignedPersonId: personId,
            isAutoMatched: false,
            isNewMember: false,
            customMemberName: matched?.name || face.customMemberName,
          }
        }),
      )
    },
    [members],
  )

  const handleUnassign = useCallback((faceId: string) => {
    setDetectedFaces((prev) =>
      prev.map((face) => {
        if (face.faceId !== faceId) return face
        return {
          ...face,
          assignedPersonId: null,
          isAutoMatched: false,
          isNewMember: false,
        }
      }),
    )
  }, [])

  const handleSetNewMember = useCallback((faceId: string, name?: string) => {
    setDetectedFaces((prev) =>
      prev.map((face) => {
        if (face.faceId !== faceId) return face
        return {
          ...face,
          assignedPersonId: null,
          isAutoMatched: false,
          isNewMember: true,
          customMemberName: name !== undefined ? name : face.customMemberName || face.parsedName,
        }
      }),
    )
  }, [])

  const handleUpdateCustomName = useCallback((faceId: string, newName: string) => {
    setDetectedFaces((prev) =>
      prev.map((face) => {
        if (face.faceId !== faceId) return face
        return {
          ...face,
          customMemberName: newName,
        }
      }),
    )
  }, [])

  const handleBulkEnroll = useCallback(async () => {
    const facesToEnroll = detectedFaces.filter(
      (f) => f.assignedPersonId || (f.isNewMember && (f.customMemberName || f.parsedName)?.trim()),
    )

    if (facesToEnroll.length === 0) {
      setError("Assign at least one face to a member or enter a name.")
      return
    }

    setIsEnrolling(true)
    setError(null)
    setEnrollmentResults(null)

    try {
      // 1. Auto-create new members if needed
      const facesNeedingCreation = facesToEnroll.filter((f) => f.isNewMember && !f.assignedPersonId)
      const newlyCreatedMembers: AttendanceMember[] = []

      for (const face of facesNeedingCreation) {
        const memberName = (face.customMemberName || face.parsedName || "Member").trim()
        if (!memberName) continue

        try {
          const newMember = await attendanceManager.addMember(group.id, memberName, {
            role: face.parsedRole || undefined,
          })
          face.assignedPersonId = newMember.person_id
          newlyCreatedMembers.push(newMember)
        } catch (addErr) {
          console.warn(`Failed to auto-create member ${memberName}:`, addErr)
        }
      }

      if (newlyCreatedMembers.length > 0) {
        useGroupStore.setState({
          members: [...useGroupStore.getState().members, ...newlyCreatedMembers],
        })
        useAttendanceStore.setState({
          groupMembers: [...useAttendanceStore.getState().groupMembers, ...newlyCreatedMembers],
        })
      }

      // 2. Enroll all assigned faces
      const readyFaces = facesToEnroll.filter((f) => f.assignedPersonId)
      if (readyFaces.length === 0) {
        throw new Error("No members could be prepared for enrollment.")
      }

      const enrollments = readyFaces.map((face) => {
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

      const result = await attendanceManager.bulkEnrollFaces(
        group.id,
        enrollments,
        uploadedFiles
          .filter((_, i) => readyFaces.some((f) => parseInt(f.imageId.replace("image_", "")) === i))
          .map((file) => ({
            file,
            filename: file.name,
          })),
      )

      const results: BulkEnrollmentResult[] = result.results.map((r: BulkEnrollResponseItem) => ({
        personId: r.person_id,
        memberName: r.member_name || "",
        success: r.success,
        error: r.error,
        qualityWarning: r.quality_warning,
      }))

      setEnrollmentResults(results)
      if (result.success_count > 0 && onRefresh) {
        await onRefresh()
      }
    } catch (err) {
      console.error("Bulk enrollment error:", err)
      setError(err instanceof Error ? err.message : "Failed to enroll members")
    } finally {
      setIsEnrolling(false)
    }
  }, [detectedFaces, uploadedFiles, group.id, onRefresh])

  return {
    uploadedFiles,
    detectedFaces,
    isDetecting,
    isEnrolling,
    error,
    setError,
    enrollmentResults,
    availableMembers,
    pendingDuplicates,
    handleFilesSelected,
    handleConfirmDuplicates,
    handleCancelDuplicates,
    handleDismissDuplicates,
    handleAssignMember,
    handleUnassign,
    handleSetNewMember,
    handleUpdateCustomName,
    handleBulkEnroll,
    handleClearFiles,
  }
}
