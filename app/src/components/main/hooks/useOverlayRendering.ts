import { useRef, useCallback, useEffect } from "react"
import type { DetectionResult } from "@/components/main/types"
import { drawOverlays } from "@/components/main/utils"
import {
  getOverlayGuidance,
  updateHoldStillCache,
  updateVerifyingHintCache,
  type HoldStillCacheEntry,
  type VerifyingHintCacheEntry,
} from "@/components/main/utils/overlayGuidance"
import {
  useDetectionStore,
  useCameraStore,
  useAttendanceStore,
  useUIStore,
} from "@/components/main/stores"

const BOX_OPACITY_LERP = 0.38
const BOX_MISSING_HOLD_MS = 90
const BOX_MIN_OPACITY = 0.04

type DetectionFace = DetectionResult["faces"][number]

interface VisibleFaceState {
  key: string
  face: DetectionFace
  opacity: number
  targetOpacity: number
  lastSeenAt: number
}

interface UseOverlayRenderingOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>
  animationFrameRef: React.MutableRefObject<number | undefined>
  videoRectRef: React.RefObject<DOMRect | null>
  lastVideoRectUpdateRef: React.RefObject<number>
}

export function useOverlayRendering(options: UseOverlayRenderingOptions) {
  const { videoRef, overlayCanvasRef, animationFrameRef, videoRectRef, lastVideoRectUpdateRef } =
    options

  const { currentDetections, currentRecognitionResults } = useDetectionStore()
  const { isStreaming } = useCameraStore()
  const { persistentCooldowns, currentGroup, enableSpoofDetection } = useAttendanceStore()
  const { quickSettings } = useUIStore()

  const lastCanvasSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })
  const lastVideoSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })
  const scaleFactorsRef = useRef<{
    scaleX: number
    scaleY: number
    offsetX: number
    offsetY: number
  }>({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 })
  const visibleFacesRef = useRef<Map<string, VisibleFaceState>>(new Map())
  const holdStillCacheRef = useRef<Map<string, HoldStillCacheEntry>>(new Map())
  const verifyingHintCacheRef = useRef<Map<string, VerifyingHintCacheEntry>>(new Map())
  const nextAnonymousGuidanceKeyRef = useRef(0)
  const nextAnonymousVerifyingKeyRef = useRef(0)
  const animateRef = useRef<() => void>(() => {})

  const getFaceKey = useCallback((face: DetectionFace, index: number) => {
    if (face.track_id !== undefined && face.track_id !== null) {
      return `track-${face.track_id}`
    }

    const { x, y, width, height } = face.bbox
    return `face-${index}-${Math.round(x / 10)}-${Math.round(y / 10)}-${Math.round(width / 10)}-${Math.round(height / 10)}`
  }, [])

  const getVideoRect = useCallback(() => {
    const video = videoRef.current
    if (!video) return null

    const now = Date.now()
    if (!videoRectRef.current || now - (lastVideoRectUpdateRef.current ?? 0) > 200) {
      ;(videoRectRef as React.MutableRefObject<DOMRect | null>).current =
        video.getBoundingClientRect()
      ;(lastVideoRectUpdateRef as React.MutableRefObject<number>).current = now
    }

    return videoRectRef.current
  }, [videoRef, videoRectRef, lastVideoRectUpdateRef])

  const calculateScaleFactors = useCallback(() => {
    const video = videoRef.current
    const overlayCanvas = overlayCanvasRef.current

    if (!video || !overlayCanvas) return null

    const currentVideoWidth = video.videoWidth
    const currentVideoHeight = video.videoHeight

    if (
      lastVideoSizeRef.current.width === currentVideoWidth &&
      lastVideoSizeRef.current.height === currentVideoHeight &&
      lastCanvasSizeRef.current.width === overlayCanvas.width &&
      lastCanvasSizeRef.current.height === overlayCanvas.height
    ) {
      return scaleFactorsRef.current
    }

    lastVideoSizeRef.current = {
      width: currentVideoWidth,
      height: currentVideoHeight,
    }
    lastCanvasSizeRef.current = {
      width: overlayCanvas.width,
      height: overlayCanvas.height,
    }

    const displayWidth = overlayCanvas.width
    const displayHeight = overlayCanvas.height

    const videoAspectRatio = currentVideoWidth / currentVideoHeight
    const containerAspectRatio = displayWidth / displayHeight

    let actualVideoWidth: number
    let actualVideoHeight: number
    let offsetX = 0
    let offsetY = 0

    if (videoAspectRatio > containerAspectRatio) {
      actualVideoWidth = displayWidth
      actualVideoHeight = displayWidth / videoAspectRatio
      offsetY = (displayHeight - actualVideoHeight) / 2
    } else {
      actualVideoHeight = displayHeight
      actualVideoWidth = displayHeight * videoAspectRatio
      offsetX = (displayWidth - actualVideoWidth) / 2
    }

    const scaleX = actualVideoWidth / currentVideoWidth
    const scaleY = actualVideoHeight / currentVideoHeight

    scaleFactorsRef.current = { scaleX, scaleY, offsetX, offsetY }
    return scaleFactorsRef.current
  }, [videoRef, overlayCanvasRef])

  const handleDrawOverlays = useCallback(
    (detections: DetectionResult | null) => {
      drawOverlays({
        videoRef,
        overlayCanvasRef,
        currentDetections: detections,
        isStreaming,
        currentRecognitionResults,
        recognitionEnabled: true,
        persistentCooldowns,
        quickSettings,
        enableSpoofDetection,
        getVideoRect,
        calculateScaleFactors,
        currentGroupId: currentGroup?.id,
      })
    },
    [
      isStreaming,
      currentRecognitionResults,
      persistentCooldowns,
      currentGroup,
      quickSettings,
      enableSpoofDetection,
      getVideoRect,
      calculateScaleFactors,
      videoRef,
      overlayCanvasRef,
    ],
  )

  const animate = useCallback(() => {
    const detectionsToRender = currentDetections
    const overlayCanvas = overlayCanvasRef.current

    if (!overlayCanvas || !isStreaming) {
      if (overlayCanvas && overlayCanvas.width > 0 && overlayCanvas.height > 0) {
        const ctx = overlayCanvas.getContext("2d", {
          willReadFrequently: false,
        })
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        }
      }
      holdStillCacheRef.current.clear()
      verifyingHintCacheRef.current.clear()
      if (isStreaming) {
        animationFrameRef.current = requestAnimationFrame(animateRef.current)
      }
      return
    }

    const now = performance.now()
    const visibleFaces = visibleFacesRef.current
    const seenKeys = new Set<string>()

    if (detectionsToRender?.faces?.length) {
      detectionsToRender.faces.forEach((face, index) => {
        const key = getFaceKey(face, index)
        seenKeys.add(key)

        const existing = visibleFaces.get(key)
        if (existing) {
          existing.face = face
          existing.targetOpacity = 1
          existing.lastSeenAt = now
        } else {
          visibleFaces.set(key, {
            key,
            face,
            opacity: 0,
            targetOpacity: 1,
            lastSeenAt: now,
          })
        }
      })
    }

    const renderedFaces: DetectionFace[] = []

    for (const [key, visibleFace] of visibleFaces) {
      if (!seenKeys.has(key) && now - visibleFace.lastSeenAt > BOX_MISSING_HOLD_MS) {
        visibleFace.targetOpacity = 0
      }

      visibleFace.opacity += (visibleFace.targetOpacity - visibleFace.opacity) * BOX_OPACITY_LERP

      if (visibleFace.opacity <= BOX_MIN_OPACITY && visibleFace.targetOpacity === 0) {
        visibleFaces.delete(key)
        continue
      }

      renderedFaces.push({
        ...visibleFace.face,
        renderOpacity: visibleFace.opacity,
      })
    }

    if (renderedFaces.length > 0) {
      const { nextCache, activeKeys, faceKeyByIndex, nextAnonymousSeed } = updateHoldStillCache(
        renderedFaces,
        holdStillCacheRef.current,
        now,
        nextAnonymousGuidanceKeyRef.current,
        {
          enableSpoofDetection,
          recognitionEnabled: true,
          currentRecognitionResults,
        },
      )

      holdStillCacheRef.current = nextCache
      nextAnonymousGuidanceKeyRef.current = nextAnonymousSeed

      const {
        nextCache: nextVerifyingHintCache,
        activeKeys: activeVerifyingHintKeys,
        faceKeyByIndex: verifyingHintKeyByIndex,
        nextAnonymousSeed: nextVerifyingAnonymousSeed,
      } = updateVerifyingHintCache(
        renderedFaces,
        verifyingHintCacheRef.current,
        now,
        nextAnonymousVerifyingKeyRef.current,
        {
          enableSpoofDetection,
          recognitionEnabled: true,
          currentRecognitionResults,
        },
      )

      verifyingHintCacheRef.current = nextVerifyingHintCache
      nextAnonymousVerifyingKeyRef.current = nextVerifyingAnonymousSeed

      const guidedFaces = renderedFaces.map((face, index) => {
        const trackId = face.track_id
        const recognitionResult =
          (trackId !== undefined ? currentRecognitionResults.get(trackId) : undefined) ??
          face.recognition ??
          null
        const holdStillKey = faceKeyByIndex.get(index)
        const verifyingHintKey = verifyingHintKeyByIndex.get(index)
        const overlayGuidance = getOverlayGuidance(face, {
          enableSpoofDetection,
          recognitionEnabled: true,
          recognitionResult,
          holdStillActive: holdStillKey ? activeKeys.has(holdStillKey) : false,
          verifyingHintActive:
            verifyingHintKey ? activeVerifyingHintKeys.has(verifyingHintKey) : false,
        })

        if (!overlayGuidance) {
          return face
        }

        return {
          ...face,
          overlayGuidance,
        }
      })

      handleDrawOverlays({
        faces: guidedFaces,
        model_used: detectionsToRender?.model_used ?? "current",
      })
    } else {
      holdStillCacheRef.current.clear()
      verifyingHintCacheRef.current.clear()
      const ctx = overlayCanvas.getContext("2d", { willReadFrequently: false })
      if (ctx && overlayCanvas.width > 0 && overlayCanvas.height > 0) {
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
      }
    }

    if (isStreaming) {
      animationFrameRef.current = requestAnimationFrame(animateRef.current)
    }
  }, [
    isStreaming,
    handleDrawOverlays,
    currentDetections,
    currentRecognitionResults,
    enableSpoofDetection,
    getFaceKey,
    overlayCanvasRef,
    animationFrameRef,
  ])

  useEffect(() => {
    animateRef.current = animate
  }, [animate])

  const resetOverlayRefs = useCallback(() => {
    lastVideoSizeRef.current = { width: 0, height: 0 }
    lastCanvasSizeRef.current = { width: 0, height: 0 }
    scaleFactorsRef.current = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
    visibleFacesRef.current.clear()
    holdStillCacheRef.current.clear()
    nextAnonymousGuidanceKeyRef.current = 0
    verifyingHintCacheRef.current.clear()
    nextAnonymousVerifyingKeyRef.current = 0
  }, [])

  return {
    getVideoRect,
    calculateScaleFactors,
    animate,
    resetOverlayRefs,
  }
}
