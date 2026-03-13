import { useCallback, useRef, useEffect } from "react"
import { startTransition } from "react"
import { attendanceManager } from "@/services"
import type { BackendService } from "@/services"
import type { AttendanceGroup, AttendanceMember } from "@/types/recognition"
import type { DetectionResult } from "@/components/main/types"
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
  loadAttendanceDataRef: React.RefObject<() => Promise<void>>
}

export function useFaceRecognition(options: UseFaceRecognitionOptions) {
  const {
    backendServiceRef,
    currentGroupRef,
    memberCacheRef,
    calculateAngleConsistencyRef,
    loadAttendanceDataRef,
  } = options

  const { currentRecognitionResults, setCurrentRecognitionResults, setTrackedFaces } =
    useDetectionStore()
  const { persistentCooldowns, attendanceCooldownSeconds, setPersistentCooldowns } =
    useAttendanceStore()

  const persistentCooldownsRef = useRef(persistentCooldowns)

  useEffect(() => {
    persistentCooldownsRef.current = persistentCooldowns
  }, [persistentCooldowns])
  const { setError } = useUIStore()

  // Prevent sound spam: person+group throttling
  const lastSoundAtRef = useRef<Map<string, number>>(new Map())

  const maybePlayRecognitionSound = useCallback(
    (personId: string, groupId: string) => {
      // If this person is already "Done" (i.e., has an active cooldown entry), do not play sound.
      // This matches the UI overlay behavior and prevents repeat sounds.
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
      if (!audioSettings.recognitionSoundEnabled) return
      if (!audioSettings.recognitionSoundUrl) return

      const soundKey = cooldownKey
      const now = Date.now()
      const lastAt = lastSoundAtRef.current.get(soundKey) ?? 0

      // ~1.2s throttle feels instant but avoids per-frame repeats
      if (now - lastAt <= 1200) return
      lastSoundAtRef.current.set(soundKey, now)

      soundEffects.play(audioSettings.recognitionSoundUrl)
    },
    [persistentCooldownsRef],
  )

  const attendanceEnabled = true

  const performFaceRecognition = useCallback(
    async (detectionResult: DetectionResult, frameData: ArrayBuffer | null) => {
      try {
        const currentGroupValue = currentGroupRef.current
        if (!currentGroupValue) {
          setCurrentRecognitionResults(new Map())
          return
        }

        if (!frameData) {
          return
        }

        const processingGroup = currentGroupValue

        const recognitionPromises = detectionResult.faces.map(async (face) => {
          try {
            if (!backendServiceRef.current) {
              return null
            }

            if (face.track_id === undefined) {
              return null
            }
            const trackId = face.track_id

            if (face.liveness?.status === "spoof") {
              return {
                face: face,
                skipRecognition: true,
                reason: "spoofed",
              }
            }

            if (face.liveness?.status === "error") {
              return null
            }

            const bbox = [face.bbox.x, face.bbox.y, face.bbox.width, face.bbox.height]

            const response = await backendServiceRef.current.recognizeFace(
              frameData,
              bbox,
              currentGroupValue.id,
              face.landmarks_5,
            )

            if (response.success && response.person_id) {
              const memberResult = await getMemberFromCache(
                response.person_id,
                currentGroupValue,
                memberCacheRef,
              )

              const hasConsent = memberResult?.member?.has_consent ?? false

              if (hasConsent) {
                maybePlayRecognitionSound(response.person_id, currentGroupValue.id)
              }
              const { memberName } = memberResult || { memberName: "Unknown" }
              const trackIdStr = `track_${face.track_id}`
              const currentTime = Date.now()

              startTransition(() => {
                setTrackedFaces((prev) => {
                  const newTracked = new Map(prev)
                  const currentLivenessStatus = face.liveness?.status
                  const existingTrack = newTracked.get(trackIdStr)

                  if (existingTrack) {
                    existingTrack.lastSeen = currentTime
                    // Keep existing confidence if it's higher (standard tracking update)
                    // But if this is a fresh recognition, maybe we should take the new one?
                    // Let's stick to update logic:
                    existingTrack.confidence = face.confidence // Update with current confidence
                    existingTrack.trackingHistory.push({
                      timestamp: currentTime,
                      bbox: face.bbox,
                      confidence: face.confidence,
                    })
                    existingTrack.trackingHistory = trimTrackingHistory(
                      existingTrack.trackingHistory,
                    )
                    existingTrack.occlusionCount = 0
                    existingTrack.angleConsistency =
                      calculateAngleConsistencyRef.current?.(existingTrack.trackingHistory) ?? 1.0
                    existingTrack.livenessStatus = currentLivenessStatus
                    existingTrack.unknownFramesCount = 0 // Reset consecutive misses since we recognized them again

                    // RE-BIND IDENTITY (Just in case it was lost/reset, though unlikely here)
                    existingTrack.personId = response.person_id ?? undefined

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
                      isLocked: true,
                      personId: response.person_id ?? undefined,
                      occlusionCount: 0,
                      angleConsistency: 1.0,
                      livenessStatus: currentLivenessStatus,
                      unknownFramesCount: 0,
                    })
                  }

                  return newTracked
                })
              })

              if (attendanceEnabled && currentGroupValue && response.person_id) {
                const livenessStatus = face.liveness?.status ?? null
                const shouldSkipAttendanceLogging =
                  !hasConsent ||
                  (!!face.liveness &&
                    (face.liveness.is_real !== true ||
                      (livenessStatus !== null &&
                        NON_LOGGING_ANTISPOOF_STATUSES.has(livenessStatus))))

                if (
                  face.liveness?.status &&
                  NON_LOGGING_ANTISPOOF_STATUSES.has(face.liveness.status)
                ) {
                  return null
                }

                if (!shouldSkipAttendanceLogging) {
                  try {
                    const cooldownKey = `${response.person_id}-${currentGroupValue.id}`
                    const cooldownInfo = persistentCooldownsRef.current.get(cooldownKey)
                    const authoritativeTimestamp = cooldownInfo?.startTime || 0
                    const timeSinceLastAttendance = Date.now() - authoritativeTimestamp
                    const thresholdMs =
                      (cooldownInfo?.cooldownDurationSeconds ?? attendanceCooldownSeconds) * 1000

                    if (timeSinceLastAttendance < thresholdMs) {
                      setPersistentCooldowns((prev) => {
                        const newPersistent = new Map(prev)
                        const existing = newPersistent.get(cooldownKey)
                        if (existing) {
                          newPersistent.set(cooldownKey, { ...existing, lastKnownBbox: face.bbox })
                          persistentCooldownsRef.current = newPersistent
                          return newPersistent
                        }
                        return prev
                      })
                    } else {
                      const attendanceEvent = await attendanceManager.processAttendanceEvent(
                        response.person_id,
                        face.confidence,
                        "LiveVideo Camera",
                        face.liveness?.status,
                        face.liveness?.confidence,
                      )

                      if (attendanceEvent) {
                        setPersistentCooldowns((prev) => {
                          const newPersistent = new Map(prev)
                          newPersistent.set(cooldownKey, {
                            personId: response.person_id!,
                            startTime: Date.now(),
                            memberName: memberName,
                            lastKnownBbox: face.bbox,
                            cooldownDurationSeconds: attendanceCooldownSeconds,
                          })
                          persistentCooldownsRef.current = newPersistent
                          return newPersistent
                        })

                        requestIdleCallback(
                          () => {
                            loadAttendanceDataRef.current().catch(() => {})
                          },
                          { timeout: 500 },
                        )
                      }
                    }
                    setError(null)
                  } catch {
                    setError("Attendance failed")
                  }
                }
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
            } else if (response.success) {
              const trackIdStr = `track_${face.track_id}`
              const currentTime = Date.now()

              // Check store for existing identity
              const existingTrack = useDetectionStore.getState().trackedFaces.get(trackIdStr)
              const knownPersonId = existingTrack?.personId

              // If we know who this is, recover the identity!
              let recoveredMemberName = ""
              let recoveredPersonId: string | null = null

              if (knownPersonId) {
                const member = await getMemberFromCache(
                  knownPersonId,
                  currentGroupValue,
                  memberCacheRef,
                )
                if (member) {
                  recoveredMemberName = member.memberName
                  recoveredPersonId = knownPersonId
                  const stillHasConsent = member.member?.has_consent ?? false

                  // IDENTITY RECOVERED: Now trigger attendance logic if enabled
                  if (attendanceEnabled && currentGroupValue && recoveredPersonId) {
                    try {
                      const cooldownKey = `${recoveredPersonId}-${currentGroupValue.id}`
                      const cooldownInfo = persistentCooldownsRef.current.get(cooldownKey)
                      const authoritativeTimestamp = cooldownInfo?.startTime || 0
                      const timeSinceLastAttendance = Date.now() - authoritativeTimestamp
                      const thresholdMs =
                        (cooldownInfo?.cooldownDurationSeconds ?? attendanceCooldownSeconds) * 1000

                      if (timeSinceLastAttendance < thresholdMs) {
                        // Just update bbox in the cooldown map
                        setPersistentCooldowns((prev) => {
                          const newPersistent = new Map(prev)
                          const existing = newPersistent.get(cooldownKey)
                          if (existing) {
                            newPersistent.set(cooldownKey, {
                              ...existing,
                              lastKnownBbox: face.bbox,
                            })
                            persistentCooldownsRef.current = newPersistent
                            return newPersistent
                          }
                          return prev
                        })
                      } else {
                        // ELAPSED: Attempt to log
                        const attendanceEvent = await attendanceManager.processAttendanceEvent(
                          recoveredPersonId,
                          face.confidence,
                          "LiveVideo Camera",
                          face.liveness?.status,
                          face.liveness?.confidence,
                        )

                        if (attendanceEvent) {
                          setPersistentCooldowns((prev) => {
                            const newPersistent = new Map(prev)
                            newPersistent.set(cooldownKey, {
                              personId: recoveredPersonId!,
                              startTime: Date.now(),
                              memberName: recoveredMemberName,
                              lastKnownBbox: face.bbox,
                              cooldownDurationSeconds: attendanceCooldownSeconds,
                            })
                            persistentCooldownsRef.current = newPersistent
                            return newPersistent
                          })
                          requestIdleCallback(
                            () => {
                              loadAttendanceDataRef.current().catch(() => {})
                            },
                            { timeout: 500 },
                          )
                        }
                      }
                    } catch {
                      // Fail silently or handle
                    }
                  }

                  return {
                    trackId,
                    result: {
                      success: true,
                      person_id: recoveredPersonId,
                      similarity: 0.99,
                      processing_time: 0,
                      name: stillHasConsent ? recoveredMemberName : "Protected",
                      memberName: recoveredMemberName,
                      has_consent: stillHasConsent,
                      error: null,
                    },
                  }
                }
              } else {
                // ** TRUE UNKNOWN **
                startTransition(() => {
                  setTrackedFaces((prev) => {
                    const newTracked = new Map(prev)
                    // Create new track with NO identity
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
                      isLocked: false,
                      personId: undefined,
                      occlusionCount: 0,
                      angleConsistency: 1.0,
                      livenessStatus: face.liveness?.status,
                    })
                    return newTracked
                  })
                })
              }
            }
          } catch {
            // Ignore individual face recognition errors
          }
          return null
        })

        const recognitionResults = await Promise.all(recognitionPromises)

        if (processingGroup?.id !== currentGroupRef.current?.id) {
          return
        }

        const newRecognitionResults = new Map<number, ExtendedFaceRecognitionResponse>()
        recognitionResults.forEach((result) => {
          if (result) {
            if (result.skipRecognition) {
              if (result.face.track_id !== undefined) {
                newRecognitionResults.set(result.face.track_id, {
                  success: false,
                  person_id: null,
                  similarity: 0,
                  processing_time: 0,
                  error: "Spoofed face - recognition skipped",
                })
              }
            } else if (result.result && result.trackId !== undefined) {
              const res = result.result
              newRecognitionResults.set(result.trackId, res)
            }
          }
        })

        setCurrentRecognitionResults((prev) => {
          if (areRecognitionMapsEqual(prev, newRecognitionResults)) {
            return prev
          }
          return newRecognitionResults
        })

        startTransition(() => {
          recognitionResults.forEach((result) => {
            if (result?.skipRecognition) {
              const face = result.face
              const faceId = `spoofed_track_${face.track_id}`
              const currentTime = Date.now()

              setTrackedFaces((prev) => {
                const newTracked = new Map(prev)
                newTracked.set(faceId, {
                  id: faceId,
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
                  isLocked: false,
                  personId: undefined,
                  occlusionCount: 0,
                  angleConsistency: 1.0,
                  livenessStatus: face.liveness?.status,
                })
                return newTracked
              })
            }
          })
        })
      } catch {
        // Recognition failed
      }
    },
    [
      attendanceCooldownSeconds,
      attendanceEnabled,
      backendServiceRef,
      calculateAngleConsistencyRef,
      currentGroupRef,
      loadAttendanceDataRef,
      memberCacheRef,
      maybePlayRecognitionSound,
      persistentCooldownsRef,
      setCurrentRecognitionResults,
      setError,
      setPersistentCooldowns,
      setTrackedFaces,
    ],
  )

  return {
    currentRecognitionResults,
    setCurrentRecognitionResults,
    performFaceRecognition,
  }
}
