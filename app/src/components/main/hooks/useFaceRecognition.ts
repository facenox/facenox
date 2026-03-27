import { useCallback, useEffect, useRef } from "react"
import { startTransition } from "react"
import { attendanceManager } from "@/services"
import type { BackendService } from "@/services"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { DetectionResult, PendingDetectionRequest } from "@/components/main/types"
import type { ExtendedFaceRecognitionResponse } from "@/components/main/utils"
import {
  trimTrackingHistory,
  areRecognitionMapsEqual,
  getMemberFromCache,
} from "@/components/main/utils"
import { NON_LOGGING_ANTISPOOF_STATUSES } from "@/components/main/constants"
import { useDetectionStore, useAttendanceStore, useUIStore } from "@/components/main/stores"
import { soundEffects } from "@/services/SoundEffectsService"

interface UseFaceRecognitionOptions {
  backendServiceRef: React.RefObject<BackendService | null>
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

const MIN_RECOGNITION_FACE_SIZE = 48

export function useFaceRecognition(options: UseFaceRecognitionOptions) {
  const { backendServiceRef, currentGroupRef, memberCacheRef, calculateAngleConsistencyRef } =
    options

  const { currentRecognitionResults, setCurrentRecognitionResults, setTrackedFaces } =
    useDetectionStore()
  const {
    persistentCooldowns,
    attendanceCooldownSeconds,
    setPersistentCooldowns,
    maxRecognitionFacesPerFrame,
  } = useAttendanceStore()

  const persistentCooldownsRef = useRef(persistentCooldowns)

  useEffect(() => {
    persistentCooldownsRef.current = persistentCooldowns
  }, [persistentCooldowns])

  const { setError } = useUIStore()
  const lastSoundAtRef = useRef<Map<string, number>>(new Map())

  const maybePlayRecognitionSound = useCallback(
    (personId: string, groupId: string) => {
      const cooldownKey = `${personId}-${groupId}`
      const existing = persistentCooldownsRef.current?.get(cooldownKey)
      if (existing?.startTime) {
        const { attendanceCooldownSeconds } = useAttendanceStore.getState()
        const cooldownMs = attendanceCooldownSeconds * 1000
        const now = Date.now()
        if (now - existing.startTime < cooldownMs) {
          return
        }
      }

      const { audioSettings } = useUIStore.getState()
      if (!audioSettings.recognitionSoundEnabled || !audioSettings.recognitionSoundUrl) return

      const now = Date.now()
      const lastAt = lastSoundAtRef.current.get(cooldownKey) ?? 0
      if (now - lastAt <= 1200) return

      lastSoundAtRef.current.set(cooldownKey, now)
      soundEffects.play(audioSettings.recognitionSoundUrl)
    },
    [persistentCooldownsRef],
  )

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

  const updateAttendanceCooldown = useCallback(
    (
      personId: string,
      groupId: string,
      memberName: string,
      face: DetectionResult["faces"][number],
    ) => {
      const cooldownKey = `${personId}-${groupId}`
      setPersistentCooldowns((prev) => {
        const newPersistent = new Map(prev)
        newPersistent.set(cooldownKey, {
          personId,
          startTime: Date.now(),
          memberName,
          lastKnownBbox: face.bbox,
          cooldownDurationSeconds: attendanceCooldownSeconds,
        })
        persistentCooldownsRef.current = newPersistent
        return newPersistent
      })
    },
    [attendanceCooldownSeconds, setPersistentCooldowns],
  )

  const touchAttendanceCooldown = useCallback(
    (personId: string, groupId: string, face: DetectionResult["faces"][number]) => {
      const cooldownKey = `${personId}-${groupId}`
      setPersistentCooldowns((prev) => {
        const newPersistent = new Map(prev)
        const existing = newPersistent.get(cooldownKey)
        if (!existing) return prev
        newPersistent.set(cooldownKey, { ...existing, lastKnownBbox: face.bbox })
        persistentCooldownsRef.current = newPersistent
        return newPersistent
      })
    },
    [setPersistentCooldowns],
  )

  const maybeLogAttendance = useCallback(
    async (
      personId: string,
      memberName: string,
      hasConsent: boolean,
      currentGroupId: string,
      face: DetectionResult["faces"][number],
    ) => {
      const livenessStatus = face.liveness?.status ?? null
      const shouldSkipAttendanceLogging =
        !hasConsent ||
        (!!face.liveness &&
          (face.liveness.is_real !== true ||
            (livenessStatus !== null && NON_LOGGING_ANTISPOOF_STATUSES.has(livenessStatus))))

      if (face.liveness?.status && NON_LOGGING_ANTISPOOF_STATUSES.has(face.liveness.status)) {
        return
      }

      if (shouldSkipAttendanceLogging) {
        return
      }

      const cooldownKey = `${personId}-${currentGroupId}`
      const cooldownInfo = persistentCooldownsRef.current.get(cooldownKey)
      const authoritativeTimestamp = cooldownInfo?.startTime || 0
      const timeSinceLastAttendance = Date.now() - authoritativeTimestamp
      const thresholdMs =
        (cooldownInfo?.cooldownDurationSeconds ?? attendanceCooldownSeconds) * 1000

      if (timeSinceLastAttendance < thresholdMs) {
        touchAttendanceCooldown(personId, currentGroupId, face)
        return
      }

      const attendanceEvent = await attendanceManager.processAttendanceEvent(
        personId,
        face.confidence,
        "LiveVideo Camera",
        face.liveness?.status,
        face.liveness?.confidence,
      )

      if (attendanceEvent) {
        updateAttendanceCooldown(personId, currentGroupId, memberName, face)
      }
    },
    [attendanceCooldownSeconds, touchAttendanceCooldown, updateAttendanceCooldown],
  )

  const performFaceRecognition = useCallback(
    async (detectionResult: DetectionResult, pendingRequest: PendingDetectionRequest | null) => {
      try {
        const currentGroupValue = currentGroupRef.current
        if (!currentGroupValue) {
          setCurrentRecognitionResults(new Map())
          return
        }

        const frameData = pendingRequest?.frameData ?? null
        if (!frameData || !backendServiceRef.current) {
          return
        }

        const processingGroup = currentGroupValue
        const recognitionCandidates = [...detectionResult.faces]
          .filter(
            (face) =>
              face.bbox.width >= MIN_RECOGNITION_FACE_SIZE &&
              face.bbox.height >= MIN_RECOGNITION_FACE_SIZE,
          )
          .sort(
            (left, right) =>
              right.bbox.width * right.bbox.height - left.bbox.width * left.bbox.height,
          )
          .slice(0, maxRecognitionFacesPerFrame)

        const batchEligibleFaces = recognitionCandidates.filter(
          (face) =>
            face.track_id !== undefined &&
            face.liveness?.status !== "spoof" &&
            face.liveness?.status !== "error",
        )

        const batchResponse =
          batchEligibleFaces.length > 0 ?
            await backendServiceRef.current.recognizeFacesBatch(
              frameData,
              currentGroupValue.id,
              batchEligibleFaces.map((face) => ({
                track_id: face.track_id!,
                landmarks_5: face.landmarks_5,
              })),
            )
          : { success: true, results: [], processing_time: 0 }

        const batchResults = new Map(
          batchResponse.results.map((result) => [result.track_id, result]),
        )

        const recognitionResults = await Promise.all(
          recognitionCandidates.map(async (face) => {
            try {
              if (face.track_id === undefined) {
                return null
              }

              const trackId = face.track_id

              if (face.liveness?.status === "spoof") {
                return {
                  face,
                  skipRecognition: true,
                }
              }

              if (face.liveness?.status === "error") {
                return null
              }

              const response = batchResults.get(trackId) ?? {
                success: false,
                person_id: null,
                similarity: 0,
                processing_time: 0,
                error: "Recognition unavailable",
              }

              if (response.success && response.person_id) {
                const isProtected = response.person_id === "PROTECTED_IDENTITY"
                let hasConsent = false
                let memberName = "Unknown"

                if (isProtected) {
                  memberName = "Protected"
                } else {
                  const memberResult = await getMemberFromCache(
                    response.person_id,
                    currentGroupValue,
                    memberCacheRef,
                  )
                  hasConsent = memberResult?.member?.has_consent ?? false
                  memberName = memberResult?.memberName || "Unknown"

                  if (hasConsent) {
                    maybePlayRecognitionSound(response.person_id, currentGroupValue.id)
                  }
                }

                upsertTrackedFace(`track_${trackId}`, face, response.person_id ?? undefined, true)

                try {
                  await maybeLogAttendance(
                    response.person_id,
                    memberName,
                    hasConsent,
                    currentGroupValue.id,
                    face,
                  )
                  setError(null)
                } catch {
                  setError("Attendance failed")
                }

                return {
                  trackId,
                  result: {
                    ...response,
                    name: hasConsent ? memberName : "Protected",
                    memberName,
                    has_consent: hasConsent,
                  },
                }
              }

              if (response.success) {
                const trackIdStr = `track_${trackId}`
                const existingTrack = useDetectionStore.getState().trackedFaces.get(trackIdStr)
                const knownPersonId = existingTrack?.personId

                if (knownPersonId) {
                  const member = await getMemberFromCache(
                    knownPersonId,
                    currentGroupValue,
                    memberCacheRef,
                  )
                  if (member) {
                    const recoveredMemberName = member.memberName
                    const stillHasConsent = member.member?.has_consent ?? false

                    try {
                      await maybeLogAttendance(
                        knownPersonId,
                        recoveredMemberName,
                        stillHasConsent,
                        currentGroupValue.id,
                        face,
                      )
                    } catch {
                      // Keep recognition resilient even if attendance write fails.
                    }

                    upsertTrackedFace(trackIdStr, face, knownPersonId, true)

                    return {
                      trackId,
                      result: {
                        success: true,
                        person_id: knownPersonId,
                        similarity: 0.99,
                        processing_time: 0,
                        name: stillHasConsent ? recoveredMemberName : "Protected",
                        memberName: recoveredMemberName,
                        has_consent: stillHasConsent,
                        error: null,
                      },
                    }
                  }
                }

                upsertTrackedFace(trackIdStr, face, undefined, false)
              }
            } catch {
              // Keep scanning even if a single face fails.
            }

            return null
          }),
        )

        if (processingGroup.id !== currentGroupRef.current?.id) {
          return
        }

        const newRecognitionResults = new Map<number, ExtendedFaceRecognitionResponse>()
        recognitionResults.forEach((result) => {
          if (!result) return
          if (result.skipRecognition) {
            if (result.face.track_id !== undefined) {
              newRecognitionResults.set(result.face.track_id, {
                success: false,
                person_id: null,
                similarity: 0,
                processing_time: 0,
                error: "Spoofed face - recognition skipped",
              })
              upsertTrackedFace(
                `spoofed_track_${result.face.track_id}`,
                result.face,
                undefined,
                false,
              )
            }
            return
          }
          if (result.result && result.trackId !== undefined) {
            newRecognitionResults.set(result.trackId, result.result)
          }
        })

        setCurrentRecognitionResults((prev) => {
          if (areRecognitionMapsEqual(prev, newRecognitionResults)) {
            return prev
          }
          return newRecognitionResults
        })
      } catch {
        // Recognition failed
      }
    },
    [
      backendServiceRef,
      currentGroupRef,
      maxRecognitionFacesPerFrame,
      memberCacheRef,
      maybeLogAttendance,
      maybePlayRecognitionSound,
      setCurrentRecognitionResults,
      setError,
      upsertTrackedFace,
    ],
  )

  return {
    currentRecognitionResults,
    setCurrentRecognitionResults,
    performFaceRecognition,
  }
}
