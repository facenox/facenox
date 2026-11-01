import { useState, useEffect, useCallback, useRef } from "react"
import { persistentSettings } from "@/services"
import { buildCameraConstraints } from "@/utils/cameraConstraints"

const VIDEO_READY_TIMEOUT_MS = 10_000

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => {
    track.onended = null
    track.stop()
  })
}

// getUserMedia cannot be aborted. Settle cancellation now and release any late stream.
function abortable<T>(
  request: Promise<T>,
  signal: AbortSignal,
  releaseLate?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    if (signal.aborted) onAbort()
    else signal.addEventListener("abort", onAbort, { once: true })
    request.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        if (signal.aborted) releaseLate?.(value)
        else resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}

function waitForVideoReady(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let playing = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      clearTimeout(timeout)
      signal.removeEventListener("abort", onAbort)
      if (error) reject(error)
      else resolve()
    }
    const check = () => {
      if (playing && video.videoWidth > 0 && video.videoHeight > 0 && !video.paused) finish()
    }
    const onAbort = () => finish(signal.reason)
    const poll = setInterval(check, 16)
    const timeout = setTimeout(() => {
      const error = new Error("Camera preview did not become ready. Try again.")
      error.name = "TimeoutError"
      finish(error)
    }, VIDEO_READY_TIMEOUT_MS)
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener("abort", onAbort, { once: true })
    try {
      void video.play().then(() => {
        playing = true
        check()
      }, finish)
    } catch (error) {
      finish(error)
    }
  })
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedCamera, setSelectedCameraState] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [cameraSession, setCameraSession] = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const isStartingRef = useRef(false)
  const mountedRef = useRef(true)
  const cameraAttemptRef = useRef<AbortController | null>(null)

  const releaseCamera = useCallback(() => {
    const attempt = cameraAttemptRef.current
    cameraAttemptRef.current = null
    isStartingRef.current = false
    attempt?.abort()
    if (streamRef.current) {
      const stream = streamRef.current
      streamRef.current = null
      stopStream(stream)
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      releaseCamera()
    }
  }, [releaseCamera])

  const setSelectedCamera = useCallback((deviceId: string) => {
    setSelectedCameraState(deviceId)
    persistentSettings.setUIState({ selectedCamera: deviceId }).catch(console.error)
  }, [])

  useEffect(() => {
    let cancelled = false
    persistentSettings
      .getUIState()
      .then((uiState) => {
        if (!cancelled && uiState.selectedCamera) {
          setSelectedCameraState(uiState.selectedCamera)
        }
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [])

  const getCameraDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter((device) => device.kind === "videoinput")
    if (mountedRef.current) setCameraDevices(videoDevices)
    return videoDevices
  }, [])

  useEffect(() => {
    let cancelled = false
    void getCameraDevices().catch(() => {
      if (!cancelled) setCameraError("Unable to detect cameras. Ensure a camera is connected.")
    })
    return () => {
      cancelled = true
    }
  }, [getCameraDevices])

  const stopCamera = useCallback(() => {
    releaseCamera()
    if (!mountedRef.current) return
    setIsStreaming(false)
    setIsVideoReady(false)
    setIsRecovering(false)
    setCameraError(null)
  }, [releaseCamera])

  const startCamera = useCallback(
    async (forcedDeviceId?: string) => {
      if (!mountedRef.current || isStartingRef.current || streamRef.current) {
        return
      }

      const attempt = new AbortController()
      cameraAttemptRef.current = attempt
      setCameraSession((session) => session + 1)
      const isCurrentAttempt = () =>
        mountedRef.current && cameraAttemptRef.current === attempt && !attempt.signal.aborted
      try {
        isStartingRef.current = true
        setCameraError(null)
        setIsStreaming(true)
        setIsVideoReady(false)
        setIsRecovering(false)

        const videoDevices = await abortable(getCameraDevices(), attempt.signal)
        if (!isCurrentAttempt()) return

        if (videoDevices.length === 0) {
          throw new Error("No camera detected. Ensure a camera is connected and try again.")
        }

        let deviceIdToUse: string | undefined = undefined
        let cameraToSelect = forcedDeviceId || selectedCamera

        if (cameraToSelect && videoDevices.length > 0) {
          const deviceExists = videoDevices.some(
            (device) => device.deviceId && device.deviceId === cameraToSelect,
          )
          if (deviceExists) {
            deviceIdToUse = cameraToSelect
          } else {
            const validDevice = videoDevices.find(
              (device) => device.deviceId && device.deviceId.trim() !== "",
            )
            if (validDevice) {
              deviceIdToUse = validDevice.deviceId
              cameraToSelect = validDevice.deviceId
              setSelectedCamera(validDevice.deviceId)
            }
          }
        } else if (videoDevices.length > 0 && !cameraToSelect) {
          const validDevice = videoDevices.find(
            (device) => device.deviceId && device.deviceId.trim() !== "",
          )
          if (validDevice) {
            deviceIdToUse = validDevice.deviceId
            cameraToSelect = validDevice.deviceId
            setSelectedCamera(validDevice.deviceId)
          }
        }

        if (!deviceIdToUse) {
          throw new Error("No valid camera device found.")
        }

        const constraints = buildCameraConstraints(deviceIdToUse)

        const video = videoRef.current
        if (!video) throw new Error("Video element not available")
        const stream = await abortable(
          navigator.mediaDevices.getUserMedia(constraints),
          attempt.signal,
          stopStream,
        )
        if (!isCurrentAttempt()) {
          stopStream(stream)
          return
        }
        streamRef.current = stream

        stream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            if (!isCurrentAttempt() || streamRef.current !== stream) return
            console.warn("[useCamera] Enrollment camera video track ended unexpectedly.")
            releaseCamera()
            setIsStreaming(false)
            setIsVideoReady(false)
            setIsRecovering(false)
            setCameraError("Active camera disconnected. Ensure camera is connected and try again.")
          }
        })

        video.srcObject = stream
        await waitForVideoReady(video, attempt.signal)
        if (!isCurrentAttempt()) return
        if (videoRef.current !== video) throw new Error("Video element no longer available")
        setIsVideoReady(true)
      } catch (err) {
        if (!isCurrentAttempt()) return
        console.error("Error starting camera:", err)
        releaseCamera()

        let errorMessage = "Unable to access camera. Ensure a camera is connected and try again."

        if (err instanceof Error) {
          const errorName = err.name
          if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
            errorMessage = "Camera permission was denied. Allow camera access in system settings."
          } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
            errorMessage = "No camera detected."
          } else if (errorName === "NotReadableError" || errorName === "TrackStartError") {
            errorMessage = "Camera is being used by another app."
          } else if (
            errorName === "OverconstrainedError" ||
            errorName === "ConstraintNotSatisfiedError"
          ) {
            errorMessage = "Unable to start camera with current settings."
          } else if (errorName === "TimeoutError") {
            errorMessage = "Camera preview did not become ready. Try again."
          }
        }

        setCameraError(errorMessage)
        setIsStreaming(false)
        setIsVideoReady(false)
        setIsRecovering(false)
      } finally {
        // A canceled start must not unlock a newer attempt that is still pending.
        if (cameraAttemptRef.current === attempt) isStartingRef.current = false
      }
    },
    [selectedCamera, getCameraDevices, setSelectedCamera, releaseCamera],
  )

  useEffect(() => {
    if (!isStreaming) return

    const video = videoRef.current
    const attempt = cameraAttemptRef.current
    if (!video || !attempt) return

    let cancelled = false
    let recovering = false
    const isCurrentPreview = () =>
      !cancelled &&
      mountedRef.current &&
      !attempt.signal.aborted &&
      cameraAttemptRef.current === attempt &&
      videoRef.current === video

    const failPreview = (message: string) => {
      if (!isCurrentPreview()) return
      releaseCamera()
      setIsStreaming(false)
      setIsVideoReady(false)
      setIsRecovering(false)
      setCameraError(message)
    }

    const checkPreview = () => {
      if (!isCurrentPreview() || !video.isConnected || isStartingRef.current || recovering) return
      const stream = streamRef.current
      if (!stream) return
      const tracks = stream.getVideoTracks()
      if (
        stream.active === false ||
        tracks.length === 0 ||
        tracks.some((track) => track.readyState === "ended")
      ) {
        failPreview("Active camera disconnected. Ensure camera is connected and try again.")
        return
      }
      if (
        video.srcObject === stream &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !video.paused
      ) {
        setIsVideoReady(true)
        return
      }

      // Resume the existing stream. A temporary pause must not latch readiness off forever.
      recovering = true
      setIsRecovering(true)
      setIsVideoReady(false)
      if (video.srcObject !== stream) video.srcObject = stream
      void waitForVideoReady(video, attempt.signal)
        .then(() => {
          if (!isCurrentPreview()) return
          setIsVideoReady(true)
          setIsRecovering(false)
        })
        .catch(() => {
          failPreview("Camera preview stopped. Try again.")
        })
        .finally(() => {
          recovering = false
        })
    }
    const onError = () => {
      if (!isStartingRef.current) failPreview("Camera preview stopped. Try again.")
    }
    const interval = setInterval(checkPreview, 1000)
    video.addEventListener("pause", checkPreview)
    video.addEventListener("emptied", checkPreview)
    video.addEventListener("resize", checkPreview)
    video.addEventListener("error", onError)
    return () => {
      cancelled = true
      clearInterval(interval)
      video.removeEventListener("pause", checkPreview)
      video.removeEventListener("emptied", checkPreview)
      video.removeEventListener("resize", checkPreview)
      video.removeEventListener("error", onError)
    }
  }, [isStreaming, cameraSession, releaseCamera])

  return {
    videoRef,
    cameraDevices,
    selectedCamera,
    setSelectedCamera,
    isStreaming,
    isVideoReady,
    isRecovering,
    cameraError,
    startCamera,
    stopCamera,
  }
}
