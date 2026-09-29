import { useCallback, useEffect, useRef } from "react"
import type { WebSocketService } from "@/services/WebSocketService"
import type { DetectionResult } from "@/components/main/types"

// Safety-net: if a frame has been "in-flight" for longer than this
// without a response, forcibly reset the lock so the pipeline can resume.
// In normal operation this never fires — purely defensive insurance.
const WATCHDOG_TIMEOUT_MS = 5_000

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

  // Tracks when detectionInFlightRef was last set to true
  const inflightSinceRef = useRef<number>(0)

  const processCurrentFrame = useCallback(async () => {
    if (
      !webSocketServiceRef.current?.isWebSocketReady() ||
      !isScanningRef.current ||
      !isStreamingRef.current ||
      trackingSessionRef.current <= 0
    ) {
      return
    }

    // Watchdog: if a frame has been in-flight far too long, force-reset
    if (detectionInFlightRef.current) {
      if (
        inflightSinceRef.current > 0 &&
        Date.now() - inflightSinceRef.current > WATCHDOG_TIMEOUT_MS
      ) {
        detectionInFlightRef.current = false
        inflightSinceRef.current = 0
        // Fall through to process next frame
      } else {
        return
      }
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
      inflightSinceRef.current = Date.now()

      webSocketServiceRef.current.sendDetectionRequest(frameData).catch((error) => {
        detectionInFlightRef.current = false
        inflightSinceRef.current = 0
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
}
