import { useRef, useCallback, useEffect } from "react"
import { startTransition } from "react"
import { WebSocketService } from "@/services/WebSocketService"
import { soundEffects } from "@/services/SoundEffectsService"
import type {
  WebSocketDetectionResponse,
  WebSocketConnectionMessage,
  WebSocketErrorMessage,
  DetectionResult,
  WebSocketFaceData,
} from "@/components/main/types"
import { cleanupStream, cleanupVideo, cleanupAnimationFrame } from "@/components/main/utils"
import {
  useCameraStore,
  useDetectionStore,
  useAttendanceStore,
  useUIStore,
} from "@/components/main/stores"

interface UseBackendServiceOptions {
  webSocketServiceRef: React.RefObject<WebSocketService | null>
  isStreamingRef: React.RefObject<boolean>
  isScanningRef: React.RefObject<boolean>
  isStartingRef: React.RefObject<boolean>
  currentGroupId: string | null
  maxRecognitionFacesPerFrame: number
  performFaceRecognition: (detectionResult: DetectionResult) => Promise<void>
  lastFrameTimestampRef: React.RefObject<number>
  lastDetectionRef: React.RefObject<DetectionResult | null>
  skipFramesRef: React.RefObject<number>
  processCurrentFrameRef: React.RefObject<() => Promise<void>>
  trackingSessionRef: React.RefObject<number>
  detectionInFlightRef: React.MutableRefObject<boolean>
  stopCamera: React.RefObject<((forceCleanup: boolean) => void) | null>
  animationFrameRef: React.RefObject<number | undefined>
  streamRef: React.RefObject<MediaStream | null>
  videoRef: React.RefObject<HTMLVideoElement | null>
  backendServiceReadyRef: React.RefObject<boolean>
  loadAttendanceDataRef: React.RefObject<() => Promise<void>>
}

export function useBackendService(options: UseBackendServiceOptions) {
  const {
    webSocketServiceRef,
    isStreamingRef,
    isScanningRef,
    isStartingRef,
    currentGroupId,
    maxRecognitionFacesPerFrame,
    performFaceRecognition,
    lastFrameTimestampRef,
    lastDetectionRef,
    skipFramesRef,
    processCurrentFrameRef,
    trackingSessionRef,
    detectionInFlightRef,
    stopCamera,
    animationFrameRef,
    streamRef,
    videoRef,
    backendServiceReadyRef,
    loadAttendanceDataRef,
  } = options

  const {
    setIsStreaming,
    setIsVideoLoading,
    setCameraActive,
    websocketStatus,
    setWebsocketStatus,
  } = useCameraStore()
  const { setCurrentDetections } = useDetectionStore()
  const { enableSpoofDetection, attendanceCooldownSeconds, setPersistentCooldowns } =
    useAttendanceStore()
  const { setError } = useUIStore()
  const lastSoundAtRef = useRef<Map<string, number>>(new Map())
  const initializationRef = useRef<{
    initialized: boolean
    isInitializing: boolean
    cleanupTimeout?: NodeJS.Timeout
  }>({ initialized: false, isInitializing: false })

  useEffect(() => {
    if (webSocketServiceRef.current) {
      webSocketServiceRef.current.updateLiveConfig({
        enableLivenessDetection: enableSpoofDetection,
        groupId: currentGroupId,
        maxRecognitionFacesPerFrame,
      })
    }
  }, [enableSpoofDetection, currentGroupId, maxRecognitionFacesPerFrame, webSocketServiceRef])

  const waitForBackendReady = useCallback(
    async (
      maxWaitTime = 60000,
      pollInterval = 100,
    ): Promise<{ ready: boolean; modelsLoaded: boolean; error?: string }> => {
      const startTime = Date.now()
      let lastError: string | undefined

      // Check immediately first (no delay)
      try {
        if (window.electronAPI?.backend) {
          const readinessCheck = await window.electronAPI.backend.checkReadiness()
          if (readinessCheck?.ready && readinessCheck?.modelsLoaded) {
            return {
              ready: true,
              modelsLoaded: true,
            }
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown error"
      }

      while (Date.now() - startTime < maxWaitTime) {
        try {
          if (!window.electronAPI?.backend) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval))
            continue
          }

          const readinessCheck = await window.electronAPI.backend.checkReadiness()

          if (readinessCheck?.ready && readinessCheck?.modelsLoaded) {
            return {
              ready: true,
              modelsLoaded: true,
            }
          }

          if (readinessCheck?.error) {
            lastError = readinessCheck.error
          } else {
            lastError = "Models still loading"
          }

          if (
            readinessCheck?.error?.includes("Backend service not started") ||
            readinessCheck?.error?.includes("Backend health check failed")
          ) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval))
            continue
          }

          const waitTime = Math.min(pollInterval * 2, 500)
          await new Promise((resolve) => setTimeout(resolve, waitTime))
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Unknown error"
          await new Promise((resolve) => setTimeout(resolve, pollInterval))
        }
      }

      return {
        ready: false,
        modelsLoaded: false,
        error: lastError ?? "Timeout waiting for backend to be ready",
      }
    },
    [],
  )

  const registerWebSocketHandlers = useCallback(() => {
    if (!webSocketServiceRef.current) return

    webSocketServiceRef.current.offMessage("detection_response")
    webSocketServiceRef.current.offMessage("connection")
    webSocketServiceRef.current.offMessage("error")
    webSocketServiceRef.current.offMessage("attendance_event")

    webSocketServiceRef.current.onMessage(
      "attendance_event",
      (
        data: import("@/components/main/types").AttendanceEvent & {
          data?: import("@/components/main/types").AttendanceEvent
        },
      ) => {
        const { currentGroup } = useAttendanceStore.getState()
        const payload = data.data ?? data
        if (payload.time_health?.warning_message) {
          window.dispatchEvent(
            new CustomEvent("facenox:clock-warning", {
              detail: { message: payload.time_health.warning_message },
            }),
          )
        }

        if (currentGroup && payload.group_id === currentGroup.id) {
          const member =
            payload.member?.name ?
              { name: payload.member.name }
            : useAttendanceStore
                .getState()
                .groupMembers.find((m) => m.person_id === payload.person_id)
          const memberName = member ? member.name : "Member"
          const cooldownKey = `${payload.person_id}-${payload.group_id}`

          setPersistentCooldowns((prev) => {
            const next = new Map(prev)
            next.set(cooldownKey, {
              personId: payload.person_id,
              memberName,
              startTime: Date.now(),
              lastKnownBbox:
                (
                  payload.bbox &&
                  payload.bbox.x !== undefined &&
                  payload.bbox.y !== undefined &&
                  payload.bbox.width !== undefined &&
                  payload.bbox.height !== undefined
                ) ?
                  {
                    x: payload.bbox.x,
                    y: payload.bbox.y,
                    width: payload.bbox.width,
                    height: payload.bbox.height,
                  }
                : undefined,
              cooldownDurationSeconds: attendanceCooldownSeconds,
            })
            return next
          })

          const { audioSettings } = useUIStore.getState()
          if (audioSettings.recognitionSoundEnabled && audioSettings.recognitionSoundUrl) {
            const now = Date.now()
            const lastAt = lastSoundAtRef.current.get(cooldownKey) ?? 0
            if (now - lastAt > 1200) {
              lastSoundAtRef.current.set(cooldownKey, now)
              soundEffects.play(audioSettings.recognitionSoundUrl)
            }
          }

          // Refresh attendance data to show in sidebar
          loadAttendanceDataRef.current?.().catch(console.error)
        }
      },
    )

    webSocketServiceRef.current.onMessage(
      "detection_response",
      (data: WebSocketDetectionResponse) => {
        detectionInFlightRef.current = false

        if (!isStreamingRef.current || !isScanningRef.current) {
          return
        }

        if (data.frame_timestamp === undefined) {
          return
        }

        const responseFrameTimestamp = data.frame_timestamp
        const lastFrameTimestamp = lastFrameTimestampRef.current ?? 0

        if (responseFrameTimestamp < lastFrameTimestamp) {
          return
        }

        lastFrameTimestampRef.current = responseFrameTimestamp

        if (data.faces && Array.isArray(data.faces)) {
          if (data.suggested_skip !== undefined) {
            skipFramesRef.current = data.suggested_skip
          }

          if (!data.model_used) {
            return
          }

          const detectionResult: DetectionResult = {
            faces: data.faces
              .map((face: WebSocketFaceData) => {
                if (!face.bbox || !Array.isArray(face.bbox) || face.bbox.length !== 4) {
                  return null
                }

                if (face.confidence === undefined) {
                  return null
                }

                const bbox = face.bbox

                if (
                  !face.landmarks_5 ||
                  !Array.isArray(face.landmarks_5) ||
                  face.landmarks_5.length !== 5
                ) {
                  return null
                }

                return {
                  bbox: {
                    x: bbox[0],
                    y: bbox[1],
                    width: bbox[2],
                    height: bbox[3],
                  },
                  confidence: face.confidence,
                  track_id: face.track_id,
                  landmarks_5: face.landmarks_5,
                  liveness: (() => {
                    if (!face.liveness) {
                      return undefined
                    }
                    if (face.liveness.status === undefined) {
                      return undefined
                    }
                    if (face.liveness.is_real === undefined) {
                      return undefined
                    }
                    return {
                      is_real: face.liveness.is_real,
                      confidence: face.liveness.confidence,
                      logit_diff: face.liveness.logit_diff,
                      real_logit: face.liveness.real_logit,
                      spoof_logit: face.liveness.spoof_logit,
                      status: face.liveness.status,
                      attack_type: face.liveness.attack_type,
                      message: face.liveness.message,
                    }
                  })(),
                  recognition:
                    face.recognition ?
                      {
                        success: face.recognition.success,
                        person_id: face.recognition.person_id ?? null,
                        name: face.recognition.name,
                        similarity: face.recognition.similarity,
                        processing_time: face.recognition.processing_time,
                        error: face.recognition.error ?? null,
                        memberName: face.recognition.memberName,
                        has_consent: face.recognition.has_consent,
                      }
                    : undefined,
                }
              })
              .filter((face) => face !== null) as DetectionResult["faces"],
            model_used: data.model_used,
          }

          setCurrentDetections(detectionResult)
          lastDetectionRef.current = detectionResult

          if (backendServiceReadyRef.current && trackingSessionRef.current > 0) {
            startTransition(() => {
              performFaceRecognition(detectionResult).catch((error) => {
                console.error("Face recognition failed:", error)
              })
            })
          }
        }

        if (isScanningRef.current && isStreamingRef.current) {
          requestAnimationFrame(() => processCurrentFrameRef.current?.())
        }
      },
    )

    webSocketServiceRef.current.onMessage("connection", (data: WebSocketConnectionMessage) => {
      if (data.status === "connected") {
        backendServiceReadyRef.current = true
        setWebsocketStatus("connected")
      } else if (data.status === "disconnected") {
        setWebsocketStatus("disconnected")
      }
    })

    webSocketServiceRef.current.onMessage("error", (data: WebSocketErrorMessage) => {
      detectionInFlightRef.current = false

      if (!isStreamingRef.current || !isScanningRef.current) {
        return
      }

      console.error("WebSocket error message:", data)
      if (data.message) {
        setError(`Detection error: ${data.message}`)
      } else {
        setError("Detection error occurred")
      }

      requestAnimationFrame(() => processCurrentFrameRef.current?.())
    })
  }, [
    performFaceRecognition,
    webSocketServiceRef,
    isStreamingRef,
    isScanningRef,
    lastFrameTimestampRef,
    skipFramesRef,
    lastDetectionRef,
    backendServiceReadyRef,
    processCurrentFrameRef,
    trackingSessionRef,
    detectionInFlightRef,
    setCurrentDetections,
    setWebsocketStatus,
    setError,
    setPersistentCooldowns,
    attendanceCooldownSeconds,
    loadAttendanceDataRef,
  ])

  const initializeWebSocket = useCallback(async () => {
    try {
      if (!webSocketServiceRef.current) {
        webSocketServiceRef.current = new WebSocketService()
      }

      const currentStatus = webSocketServiceRef.current.getWebSocketStatus()
      if (currentStatus === "connected") {
        registerWebSocketHandlers()
        return
      }

      const readinessResult = await waitForBackendReady(60000, 500)

      if (!readinessResult.ready || !readinessResult.modelsLoaded) {
        const errorMessage = readinessResult.error ?? "Backend not ready: Models still loading"
        throw new Error(errorMessage)
      }

      registerWebSocketHandlers()
      await webSocketServiceRef.current.connectWebSocket()
    } catch (error) {
      console.error("WebSocket initialization failed:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"

      if (!isStartingRef.current) {
        if (errorMessage.includes("Models still loading")) {
          setError("AI models are still loading. Please wait a moment and try again.")
        } else if (errorMessage.includes("Backend service not started")) {
          setError("Backend service is not running. Please restart the application.")
        } else if (errorMessage.includes("Timeout")) {
          setError(
            "Backend took too long to load models. Please check if the backend service is running.",
          )
        } else {
          setError(`Failed to connect to detection service: ${errorMessage}`)
        }
      }
      throw error
    }
  }, [waitForBackendReady, registerWebSocketHandlers, webSocketServiceRef, isStartingRef, setError])

  useEffect(() => {
    isStreamingRef.current = false
    isScanningRef.current = false
    backendServiceReadyRef.current = false
    setError(null)
    setIsStreaming(false)
    setIsVideoLoading(false)
    setCameraActive(false)
    setWebsocketStatus("disconnected")

    cleanupStream(streamRef)
    cleanupVideo(videoRef, true)
    cleanupAnimationFrame(animationFrameRef)

    if (initializationRef.current.cleanupTimeout) {
      clearTimeout(initializationRef.current.cleanupTimeout)
      initializationRef.current.cleanupTimeout = undefined
    }

    if (webSocketServiceRef.current?.isWebSocketReady()) {
      registerWebSocketHandlers()
      initializationRef.current.initialized = true
      initializationRef.current.isInitializing = false
      return
    }

    if (initializationRef.current.isInitializing) {
      return
    }

    if (initializationRef.current.initialized && !webSocketServiceRef.current?.isWebSocketReady()) {
      initializationRef.current.initialized = false
    }

    initializationRef.current.isInitializing = true

    const initWebSocket = async () => {
      try {
        await initializeWebSocket()
        initializationRef.current.initialized = true
      } catch {
        setWebsocketStatus("disconnected")
        initializationRef.current.initialized = false
      } finally {
        initializationRef.current.isInitializing = false
      }
    }

    initWebSocket()

    const cleanupTimeout = initializationRef.current.cleanupTimeout
    const wasInitialized = initializationRef.current.initialized
    const wasInitializing = initializationRef.current.isInitializing
    const stopCameraFn = stopCamera.current
    // Capture ref values at effect time to avoid linter warnings
    const currentAnimationFrame = animationFrameRef.current
    const isCurrentlyStreaming = isStreamingRef.current

    return () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout)
      }

      if (wasInitialized || wasInitializing) {
        // Use captured values to avoid linter warnings about refs changing
        if (isCurrentlyStreaming) {
          if (stopCameraFn) {
            stopCameraFn(false)
          }
        } else if (currentAnimationFrame) {
          cancelAnimationFrame(currentAnimationFrame)
          animationFrameRef.current = undefined
        }

        const initRef = initializationRef
        setTimeout(() => {
          initRef.current.initialized = false
          initRef.current.isInitializing = false
        }, 50)
      }
    }
  }, [
    initializeWebSocket,
    registerWebSocketHandlers,
    stopCamera,
    isStreamingRef,
    isScanningRef,
    animationFrameRef,
    backendServiceReadyRef,
    webSocketServiceRef,
    setIsStreaming,
    setIsVideoLoading,
    setCameraActive,
    setError,
    setWebsocketStatus,
    streamRef,
    videoRef,
  ])

  useEffect(() => {
    if (!webSocketServiceRef.current) return

    return webSocketServiceRef.current.onStatusChange((status) => {
      setWebsocketStatus(status)
    })
  }, [webSocketServiceRef, setWebsocketStatus])

  useEffect(() => {
    if (websocketStatus === "connected" && isScanningRef.current && isStreamingRef.current) {
      if (webSocketServiceRef.current?.isWebSocketReady()) {
        processCurrentFrameRef.current?.()
      }
    }
  }, [websocketStatus, isScanningRef, isStreamingRef, webSocketServiceRef, processCurrentFrameRef])

  return {
    backendServiceReadyRef,
    initializeWebSocket,
    registerWebSocketHandlers,
    waitForBackendReady,
  }
}
