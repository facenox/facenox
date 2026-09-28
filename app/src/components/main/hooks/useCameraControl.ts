import { useCallback } from "react"
import {
  cleanupStream,
  cleanupVideo,
  cleanupAnimationFrame,
  resetFrameCounters,
  resetLastDetectionRef,
} from "@/components/main/utils"
import { buildCameraConstraints } from "@/utils/cameraConstraints"
import { useDetectionStore } from "@/components/main/stores"
import type { WebSocketService } from "@/services/WebSocketService"
import type { DetectionResult } from "@/components/main/types"

interface CameraControlProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  streamRef: React.MutableRefObject<MediaStream | null>
  animationFrameRef: React.MutableRefObject<number | undefined>
  webSocketServiceRef: React.MutableRefObject<WebSocketService | null>
  isStreamingRef: React.MutableRefObject<boolean>
  isScanningRef: React.MutableRefObject<boolean>
  isStartingRef: React.MutableRefObject<boolean>
  isStoppingRef: React.MutableRefObject<boolean>
  lastStartTimeRef: React.MutableRefObject<number>
  lastStopTimeRef: React.MutableRefObject<number>
  frameCounterRef: React.MutableRefObject<number>
  skipFramesRef: React.MutableRefObject<number>
  lastFrameTimestampRef: React.MutableRefObject<number>
  lastDetectionRef: React.MutableRefObject<DetectionResult | null>
  lastDetectionFrameRef: React.MutableRefObject<ArrayBuffer | null>
  backendServiceReadyRef: React.MutableRefObject<boolean>
  processCurrentFrameRef: React.MutableRefObject<() => Promise<void>>
  trackingSessionRef: React.MutableRefObject<number>
  detectionInFlightRef: React.MutableRefObject<boolean>
  resetOverlayRefs: () => void
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>

  setIsStreaming: (val: boolean) => void
  setIsVideoLoading: (val: boolean) => void
  setCameraActive: (val: boolean) => void
  setSelectedCamera: (id: string) => void
  setError: (msg: string | null) => void
  selectedCamera: string | null
  cameraDevices: MediaDeviceInfo[]

  initializeWebSocket: () => Promise<void>
  getCameraDevices: () => Promise<MediaDeviceInfo[]>
}

export function useCameraControl({
  videoRef,
  streamRef,
  animationFrameRef,
  webSocketServiceRef,
  isStreamingRef,
  isScanningRef,
  isStartingRef,
  isStoppingRef,
  lastStartTimeRef,
  lastStopTimeRef,
  frameCounterRef,
  skipFramesRef,
  lastFrameTimestampRef,
  lastDetectionRef,
  lastDetectionFrameRef,
  backendServiceReadyRef,
  processCurrentFrameRef,
  trackingSessionRef,
  detectionInFlightRef,
  resetOverlayRefs,
  overlayCanvasRef,
  setIsStreaming,
  setIsVideoLoading,
  setCameraActive,
  setSelectedCamera,
  setError,
  selectedCamera,
  cameraDevices,
  initializeWebSocket,
  getCameraDevices,
}: CameraControlProps) {
  const startCamera = useCallback(async () => {
    let deviceIdToUse: string | undefined = undefined
    const hadExplicitSelection = Boolean(selectedCamera && selectedCamera.trim())
    try {
      const now = Date.now()
      const timeSinceLastStart = now - lastStartTimeRef.current
      const timeSinceLastStop = now - lastStopTimeRef.current

      if (isStartingRef.current || isStreamingRef.current) {
        return
      }

      if (timeSinceLastStop < 100 || timeSinceLastStart < 200) {
        return
      }

      isStartingRef.current = true
      lastStartTimeRef.current = now
      trackingSessionRef.current += 1
      detectionInFlightRef.current = false
      isStreamingRef.current = true
      setIsStreaming(true)
      setIsVideoLoading(true)
      setError(null)

      const currentStatus = webSocketServiceRef.current?.getWebSocketStatus() || "disconnected"
      if (currentStatus !== "connected") {
        try {
          await initializeWebSocket()
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error"
          setError(`Failed to connect to detection service: ${errorMessage}`)
          isStreamingRef.current = false
          setIsStreaming(false)
          setIsVideoLoading(false)
          setCameraActive(false)
          isStartingRef.current = false
          return
        }
      }

      await getCameraDevices()

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }

      deviceIdToUse = undefined
      if (selectedCamera && cameraDevices.length > 0) {
        const deviceExists = cameraDevices.some(
          (device) => device.deviceId && device.deviceId === selectedCamera,
        )
        if (deviceExists) {
          deviceIdToUse = selectedCamera
        } else {
          const validDevice = cameraDevices.find(
            (device) => device.deviceId && device.deviceId.trim() !== "",
          )
          if (validDevice) {
            deviceIdToUse = validDevice.deviceId
            setSelectedCamera(validDevice.deviceId)
          }
        }
      } else if (cameraDevices.length > 0 && !selectedCamera) {
        const validDevice = cameraDevices.find(
          (device) => device.deviceId && device.deviceId.trim() !== "",
        )
        if (validDevice) {
          deviceIdToUse = validDevice.deviceId
          setSelectedCamera(validDevice.deviceId)
        }
      }

      if (cameraDevices.length === 0) {
        throw new Error("No camera detected. Ensure a camera is connected and try again.")
      }

      const constraints = buildCameraConstraints(deviceIdToUse)

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream

        const waitForVideoReady = () => {
          return new Promise<void>((resolve) => {
            const video = videoRef.current
            if (!video) {
              resolve()
              return
            }

            const checkVideoReady = () => {
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                resolve()
              } else {
                setTimeout(checkVideoReady, 16)
              }
            }

            video
              .play()
              .then(() => {
                checkVideoReady()
              })
              .catch(() => {
                checkVideoReady()
              })
          })
        }

        await waitForVideoReady()
        setIsVideoLoading(false)
        setCameraActive(true)

        resetFrameCounters(frameCounterRef, skipFramesRef, lastFrameTimestampRef)

        isScanningRef.current = true
        backendServiceReadyRef.current = true

        if (webSocketServiceRef.current?.isWebSocketReady()) {
          processCurrentFrameRef.current()
        }
      }
    } catch (err) {
      console.error("Error starting camera:", err)

      let errorMessage = "Unable to access camera. Ensure a camera is connected and try again."
      if (err instanceof Error) {
        const errorName = err.name
        if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
          const userAgent = navigator.userAgent.toLowerCase()
          let instructions: string
          if (userAgent.includes("win")) {
            instructions =
              "Check Windows Privacy settings: Go to Settings → Privacy → Camera and ensure 'Allow apps to access the camera' is turned ON."
          } else if (userAgent.includes("mac")) {
            instructions =
              "Check macOS Privacy settings: Go to System Settings → Privacy & Security → Camera and ensure Facenox is allowed to access the camera."
          } else {
            instructions = "Ensure camera permissions are granted in system settings."
          }
          errorMessage = `Camera access was denied. ${instructions}`
        } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
          errorMessage =
            "No camera found. Check if the camera is properly connected to the computer."
        } else if (errorName === "NotReadableError" || errorName === "TrackStartError") {
          const otherCameras = cameraDevices.filter(
            (d) => d.deviceId !== deviceIdToUse && d.deviceId !== "",
          )
          if (otherCameras.length > 0) {
            errorMessage = `Camera is currently in use by another application. Since ${otherCameras.length} other ${otherCameras.length === 1 ? "camera is" : "cameras are"} available, try selecting a different one from the dropdown.`
          } else {
            errorMessage =
              "Camera is currently in use by another application (Zoom, Discord, or a web browser). Close those apps and try starting the camera again."
          }
        } else if (
          errorName === "OverconstrainedError" ||
          errorName === "ConstraintNotSatisfiedError"
        ) {
          if (hadExplicitSelection) {
            errorMessage =
              "The selected camera could not be started with its current settings. Please reselect a camera or reconnect the device."
          } else {
            errorMessage =
              "Camera does not support requested settings. Trying to start with default settings..."
            try {
              const fallbackConstraints = buildCameraConstraints()
              const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
              streamRef.current = fallbackStream
              if (videoRef.current) {
                videoRef.current.srcObject = fallbackStream
                await videoRef.current.play()
                setIsVideoLoading(false)
                setCameraActive(true)
                isStreamingRef.current = true
                setIsStreaming(true)
                isScanningRef.current = true
                backendServiceReadyRef.current = true
                setError(null)
                isStartingRef.current = false
                return
              }
            } catch (fallbackErr) {
              console.error("Fallback camera start also failed:", fallbackErr)
              errorMessage =
                "The camera could not be started. This usually happens if the hardware is busy or malfunctioning. Try re-plugging the camera."
            }
          }
        } else {
          errorMessage =
            "An unexpected error occurred while starting the camera. Check connection or try another camera device."
        }
      }

      setError(errorMessage)
      isStreamingRef.current = false
      isScanningRef.current = false
      setIsStreaming(false)
      setIsVideoLoading(false)
      setCameraActive(false)
    } finally {
      isStartingRef.current = false
    }
  }, [
    selectedCamera,
    cameraDevices,
    getCameraDevices,
    initializeWebSocket,
    setIsStreaming,
    setIsVideoLoading,
    setCameraActive,
    setError,
    setSelectedCamera,
    lastStartTimeRef,
    lastStopTimeRef,
    isStartingRef,
    isStreamingRef,
    webSocketServiceRef,
    streamRef,
    videoRef,
    frameCounterRef,
    skipFramesRef,
    lastFrameTimestampRef,
    isScanningRef,
    backendServiceReadyRef,
    processCurrentFrameRef,
    trackingSessionRef,
    detectionInFlightRef,
  ])

  const stopCamera = useCallback(
    (forceCleanup = false) => {
      const now = Date.now()
      const timeSinceLastStop = now - lastStopTimeRef.current

      if (!forceCleanup) {
        if (isStoppingRef.current || !isStreamingRef.current) {
          return
        }

        if (timeSinceLastStop < 100) {
          return
        }
      }

      isStoppingRef.current = true
      lastStopTimeRef.current = now
      isScanningRef.current = false
      detectionInFlightRef.current = false

      cleanupStream(streamRef)
      cleanupVideo(videoRef, !forceCleanup)

      isStreamingRef.current = false
      setIsStreaming(false)
      setIsVideoLoading(false)
      setCameraActive(false)

      cleanupAnimationFrame(animationFrameRef)

      lastDetectionFrameRef.current = null
      resetLastDetectionRef(lastDetectionRef)
      useDetectionStore.getState().resetDetectionState()

      resetFrameCounters(frameCounterRef, skipFramesRef, lastFrameTimestampRef)
      resetOverlayRefs()

      const overlayCanvas = overlayCanvasRef.current
      if (overlayCanvas) {
        const ctx = overlayCanvas.getContext("2d")
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        }
      }

      isStoppingRef.current = false
    },
    [
      resetOverlayRefs,
      setIsStreaming,
      setIsVideoLoading,
      setCameraActive,
      streamRef,
      videoRef,
      animationFrameRef,
      overlayCanvasRef,
      lastDetectionFrameRef,
      lastDetectionRef,
      frameCounterRef,
      skipFramesRef,
      lastFrameTimestampRef,
      isStreamingRef,
      isScanningRef,
      isStoppingRef,
      lastStopTimeRef,
      detectionInFlightRef,
    ],
  )

  return {
    startCamera,
    stopCamera,
  }
}
