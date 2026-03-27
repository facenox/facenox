import { useCallback, useEffect } from "react"
import type { WebSocketService } from "@/services/WebSocketService"
import type { DetectionResult } from "@/components/main/types"
import { useDetectionStore } from "@/components/main/stores"

interface UseFaceDetectionOptions {
  webSocketServiceRef: React.RefObject<WebSocketService | null>
  isScanningRef: React.RefObject<boolean>
  isStreamingRef: React.RefObject<boolean>
  captureFrame: () => Promise<ArrayBuffer | null>
  lastDetectionFrameRef: React.MutableRefObject<ArrayBuffer | null>
  frameCounterRef: React.MutableRefObject<number>
  skipFramesRef: React.MutableRefObject<number>
  lastFrameTimestampRef: React.MutableRefObject<number>
  lastDetectionRef: React.MutableRefObject<DetectionResult | null>
  processCurrentFrameRef: React.MutableRefObject<() => Promise<void>>
  trackingSessionRef: React.MutableRefObject<number>
  detectionInFlightRef: React.MutableRefObject<boolean>
  fpsTrackingRef: React.MutableRefObject<{
    timestamps: number[]
    maxSamples: number
    lastUpdateTime: number
  }>
}

export function useFaceDetection(options: UseFaceDetectionOptions) {
  const {
    webSocketServiceRef,
    isScanningRef,
    isStreamingRef,
    captureFrame,
    lastDetectionFrameRef,
    frameCounterRef,
    skipFramesRef,
    processCurrentFrameRef,
    trackingSessionRef,
    detectionInFlightRef,
  } = options

  const { detectionFps, currentDetections, setDetectionFps, setCurrentDetections } =
    useDetectionStore()

  const processCurrentFrame = useCallback(async () => {
    if (
      !webSocketServiceRef.current?.isWebSocketReady() ||
      !isScanningRef.current ||
      !isStreamingRef.current ||
      trackingSessionRef.current <= 0
    ) {
      return
    }

    if (detectionInFlightRef.current) {
      return
    }

    frameCounterRef.current += 1

    if ((frameCounterRef.current ?? 0) % ((skipFramesRef.current ?? 0) + 1) !== 0) {
      requestAnimationFrame(() => processCurrentFrameRef.current?.())
      return
    }

    try {
      const frameData = await captureFrame()
      if (!frameData) {
        requestAnimationFrame(() => processCurrentFrameRef.current?.())
        return
      }

      lastDetectionFrameRef.current = frameData
      detectionInFlightRef.current = true

      webSocketServiceRef.current.sendDetectionRequest(frameData).catch((error) => {
        detectionInFlightRef.current = false
        console.error("Frame detection request failed:", error)
        requestAnimationFrame(() => processCurrentFrameRef.current?.())
      })
    } catch (error) {
      console.error("Frame capture failed:", error)
      requestAnimationFrame(() => processCurrentFrameRef.current?.())
    }
  }, [
    captureFrame,
    webSocketServiceRef,
    isScanningRef,
    isStreamingRef,
    frameCounterRef,
    lastDetectionFrameRef,
    processCurrentFrameRef,
    skipFramesRef,
    trackingSessionRef,
    detectionInFlightRef,
  ])

  useEffect(() => {
    processCurrentFrameRef.current = processCurrentFrame
  }, [processCurrentFrame, processCurrentFrameRef])

  return {
    detectionFps,
    setDetectionFps,
    currentDetections,
    setCurrentDetections,
  }
}
