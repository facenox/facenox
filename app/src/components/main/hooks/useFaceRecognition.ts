import { useCallback } from "react"
import { startTransition } from "react"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { DetectionResult } from "@/components/main/types"
import type { ExtendedFaceRecognitionResponse } from "@/components/main/utils"
import {
  trimTrackingHistory,
  areRecognitionMapsEqual,
  getMemberFromCache,
} from "@/components/main/utils"
import { useDetectionStore } from "@/components/main/stores"

interface UseFaceRecognitionOptions {
  currentGroupRef: React.RefObject<AttendanceGroup | null>
  memberCacheRef: React.RefObject<Map<string, AttendanceMember | null>>
  calculateAngleConsistencyRef: React.RefObject<
    (
      history: {
        timestamp: number
        bbox: { x: number; y: number; width: number; height: number }
        confidence: number
      }[],
    ) => number
  >
}

export function useFaceRecognition(options: UseFaceRecognitionOptions) {
  const { currentGroupRef, memberCacheRef, calculateAngleConsistencyRef } = options

  const { currentRecognitionResults, setCurrentRecognitionResults, setTrackedFaces } =
    useDetectionStore()

  const upsertTrackedFace = useCallback(
    (
      trackIdStr: string,
      face: DetectionResult["faces"][number],
      personId?: string,
      isLocked: boolean = false,
    ) => {
      const currentTime = Date.now()
      startTransition(() => {
        setTrackedFaces((prev) => {
          const newTracked = new Map(prev)
          const existingTrack = newTracked.get(trackIdStr)

          if (existingTrack) {
            existingTrack.lastSeen = currentTime
            existingTrack.confidence = face.confidence
            existingTrack.trackingHistory.push({
              timestamp: currentTime,
              bbox: face.bbox,
              confidence: face.confidence,
            })
            existingTrack.trackingHistory = trimTrackingHistory(existingTrack.trackingHistory)
            existingTrack.occlusionCount = 0
            existingTrack.angleConsistency =
              calculateAngleConsistencyRef.current?.(existingTrack.trackingHistory) ?? 1.0
            existingTrack.livenessStatus = face.liveness?.status
            existingTrack.unknownFramesCount = 0
            existingTrack.personId = personId ?? existingTrack.personId
            existingTrack.isLocked = isLocked || existingTrack.isLocked
            newTracked.set(existingTrack.id, existingTrack)
          } else {
            newTracked.set(trackIdStr, {
              id: trackIdStr,
              bbox: face.bbox,
              confidence: face.confidence,
              lastSeen: currentTime,
              trackingHistory: [
                {
                  timestamp: currentTime,
                  bbox: face.bbox,
                  confidence: face.confidence,
                },
              ],
              isLocked,
              personId,
              occlusionCount: 0,
              angleConsistency: 1.0,
              livenessStatus: face.liveness?.status,
              unknownFramesCount: 0,
            })
          }

          return newTracked
        })
      })
    },
    [calculateAngleConsistencyRef, setTrackedFaces],
  )

  const performFaceRecognition = useCallback(
    async (detectionResult: DetectionResult) => {
      const currentGroupValue = currentGroupRef.current
      if (!currentGroupValue) {
        setCurrentRecognitionResults(new Map())
        return
      }

      if (!detectionResult.faces.length) {
        setCurrentRecognitionResults(new Map())
        return
      }

      const nextRecognitionResults = new Map<number, ExtendedFaceRecognitionResponse>()

      for (const face of detectionResult.faces) {
        if (face.track_id === undefined) {
          continue
        }

        const trackId = face.track_id

        const response = face.recognition
        if (!response) {
          upsertTrackedFace(`track_${trackId}`, face, undefined, false)
          continue
        }

        if (response.success && response.person_id) {
          let memberName = response.name || "Unknown"
          let hasConsent = response.has_consent ?? true

          if (response.person_id !== "PROTECTED_IDENTITY") {
            const memberResult = await getMemberFromCache(
              response.person_id,
              currentGroupValue,
              memberCacheRef,
            )
            memberName = memberResult?.memberName || memberName
            hasConsent = memberResult?.member?.has_consent ?? hasConsent
          } else {
            memberName = "Protected"
            hasConsent = false
          }

          upsertTrackedFace(`track_${trackId}`, face, response.person_id ?? undefined, true)
          nextRecognitionResults.set(trackId, {
            ...response,
            name: hasConsent ? memberName : "Protected",
            memberName,
            has_consent: hasConsent,
          })
          continue
        }

        upsertTrackedFace(`track_${trackId}`, face, undefined, false)
        nextRecognitionResults.set(trackId, response)
      }

      setCurrentRecognitionResults((prev) => {
        if (areRecognitionMapsEqual(prev, nextRecognitionResults)) {
          return prev
        }
        return nextRecognitionResults
      })
    },
    [currentGroupRef, memberCacheRef, setCurrentRecognitionResults, upsertTrackedFace],
  )

  return {
    currentRecognitionResults,
    setCurrentRecognitionResults,
    performFaceRecognition,
  }
}
