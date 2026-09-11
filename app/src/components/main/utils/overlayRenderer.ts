import type { DetectionResult } from "@/components/main/types"
import type { ExtendedFaceRecognitionResponse } from "./recognitionHelpers"
import type { QuickSettings } from "@/components/settings"

// Module-level cache to track low light opacity per face track_id for smooth transitions
const lowLightOpacityCache = new Map<number, number>()
const subLabelOpacityCache = new Map<number, number>()

export const clearOverlayRendererCache = () => {
  lowLightOpacityCache.clear()
  subLabelOpacityCache.clear()
}

export const getFaceColor = (
  recognitionResult: ExtendedFaceRecognitionResponse | null,
  recognitionEnabled: boolean,
  enableSpoofDetection: boolean,
  livenessStatus?: string,
) => {
  const isRecognized =
    recognitionEnabled &&
    recognitionResult?.person_id &&
    (!enableSpoofDetection || livenessStatus === "real")

  if (isRecognized) {
    if (recognitionResult?.has_consent === false) return "#6366f1"
    return "#22d3ee"
  }

  return "#94a3b8"
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export const drawBoundingBox = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  const width = x2 - x1
  const height = y2 - y1
  const cornerRadius = 8

  // Always enforce clean, premium solid lines for a high-fidelity scanning experience
  ctx.setLineDash([])

  ctx.beginPath()
  drawRoundedRect(ctx, x1, y1, width, height, cornerRadius)
  ctx.stroke()
}

export const setupCanvasContext = (ctx: CanvasRenderingContext2D, color: string) => {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

interface DrawOverlaysParams {
  videoRef: React.RefObject<HTMLVideoElement | null>
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>
  currentDetections: DetectionResult | null
  isStreaming: boolean
  currentRecognitionResults: Map<number, ExtendedFaceRecognitionResponse>
  recognitionEnabled: boolean
  persistentCooldowns: Map<
    string,
    {
      personId: string
      memberName?: string
      startTime: number
      lastKnownBbox?: { x: number; y: number; width: number; height: number }
      cooldownDurationSeconds: number
    }
  >
  quickSettings: QuickSettings
  enableSpoofDetection: boolean
  getVideoRect: () => DOMRect | null
  calculateScaleFactors: () => {
    scaleX: number
    scaleY: number
    offsetX: number
    offsetY: number
  } | null
  currentGroupId?: string
}

export const drawOverlays = ({
  videoRef,
  overlayCanvasRef,
  currentDetections,
  isStreaming,
  currentRecognitionResults,
  recognitionEnabled,
  quickSettings,
  enableSpoofDetection,
  getVideoRect,
  calculateScaleFactors,
}: DrawOverlaysParams) => {
  const video = videoRef.current
  const overlayCanvas = overlayCanvasRef.current

  if (!video || !overlayCanvas || !currentDetections) return

  const ctx = overlayCanvas.getContext("2d", {
    alpha: true,
    willReadFrequently: false,
    desynchronized: true,
  })
  if (!ctx) return

  ctx.imageSmoothingEnabled = false

  if (!isStreaming || !currentDetections.faces?.length) {
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
    return
  }

  const rect = getVideoRect()
  if (!rect) return

  const displayWidth = Math.round(rect.width)
  const displayHeight = Math.round(rect.height)

  const currentWidth = overlayCanvas.width
  const currentHeight = overlayCanvas.height

  if (currentWidth !== displayWidth || currentHeight !== displayHeight) {
    overlayCanvas.width = displayWidth
    overlayCanvas.height = displayHeight
    if (
      overlayCanvas.style.width !== `${displayWidth}px` ||
      overlayCanvas.style.height !== `${displayHeight}px`
    ) {
      overlayCanvas.style.width = `${displayWidth}px`
      overlayCanvas.style.height = `${displayHeight}px`
    }
  }

  ctx.save()
  ctx.clearRect(0, 0, displayWidth, displayHeight)

  const scaleFactors = calculateScaleFactors()
  if (!scaleFactors) return

  const { scaleX, scaleY, offsetX, offsetY } = scaleFactors

  if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return

  currentDetections.faces.forEach((face) => {
    const { bbox } = face

    if (
      !bbox ||
      !isFinite(bbox.x) ||
      !isFinite(bbox.y) ||
      !isFinite(bbox.width) ||
      !isFinite(bbox.height)
    )
      return

    const x1 =
      quickSettings.cameraMirrored ?
        displayWidth - (bbox.x * scaleX + offsetX) - bbox.width * scaleX
      : bbox.x * scaleX + offsetX
    const y1 = bbox.y * scaleY + offsetY
    const x2 =
      quickSettings.cameraMirrored ?
        displayWidth - (bbox.x * scaleX + offsetX)
      : (bbox.x + bbox.width) * scaleX + offsetX
    const y2 = (bbox.y + bbox.height) * scaleY + offsetY

    const width = x2 - x1
    const height = y2 - y1

    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return

    if (x2 <= x1 || y2 <= y1) return

    const trackId = face.track_id!
    const recognitionResult = currentRecognitionResults.get(trackId) ?? face.recognition
    const color = getFaceColor(
      recognitionResult || null,
      recognitionEnabled,
      enableSpoofDetection,
      face.liveness?.status,
    )

    const isRecognized =
      recognitionEnabled &&
      recognitionResult?.person_id &&
      (!enableSpoofDetection || face.liveness?.status === "real")
    const isBlocked = recognitionResult?.has_consent === false

    ctx.save()
    ctx.globalAlpha = face.renderOpacity ?? 1

    if (isBlocked) {
      ctx.save()
      const cornerRadius = 8
      ctx.beginPath()
      drawRoundedRect(ctx, x1, y1, width, height, cornerRadius)
      ctx.clip()

      ctx.filter = "blur(20px)"
      if (quickSettings.cameraMirrored) {
        ctx.translate(displayWidth, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(
          video,
          0,
          0,
          video.videoWidth,
          video.videoHeight,
          offsetX,
          offsetY,
          displayWidth - 2 * offsetX,
          displayHeight - 2 * offsetY,
        )
      } else {
        ctx.drawImage(
          video,
          0,
          0,
          video.videoWidth,
          video.videoHeight,
          offsetX,
          offsetY,
          displayWidth - 2 * offsetX,
          displayHeight - 2 * offsetY,
        )
      }
      ctx.filter = "none"
      ctx.restore()
    } else {
      setupCanvasContext(ctx, color)
      drawBoundingBox(ctx, x1, y1, x2, y2)
    }

    const isActuallyRecognized = isRecognized && !!recognitionResult?.person_id
    let label = ""
    let shouldShowLabel = false
    let labelTone: "recognition" | "guidance-warning" | "guidance-failure" = "recognition"

    if (isActuallyRecognized && recognitionResult && quickSettings.showRecognitionNames) {
      if (recognitionResult.has_consent === false) {
        label = "No Consent"
      } else {
        label = recognitionResult.name || recognitionResult.person_id || ""
      }
      shouldShowLabel = !!label
    }

    if (!shouldShowLabel && enableSpoofDetection && face.overlayGuidance) {
      label = face.overlayGuidance.label
      labelTone = face.overlayGuidance.tone === "failure" ? "guidance-failure" : "guidance-warning"
      shouldShowLabel = true
    }

    if (shouldShowLabel) {
      const isShield = labelTone === "recognition" && recognitionResult?.has_consent === false
      const isLowLight = !!face.overlayGuidance?.isLowLight

      // Sequential smoothly-fading dots animation loop
      const isVerifyingState = label === "Verifying..."
      const text = label

      ctx.font = "bold 12px system-ui, sans-serif"

      // Measure text width to prevent layout overflow
      const measureText = isVerifyingState ? "Verifying..." : text
      const textWidth = ctx.measureText(measureText).width
      const paddingH = 10
      const badgeW = textWidth + paddingH * 2
      const badgeH = 20

      const badgeX = x1 + (width - badgeW) / 2
      const badgeY = Math.max(6, y1 - 25)

      // Stacked low-light warning text with smooth opacity LERP
      const showLowLightBadge = isLowLight && label !== "Poor lighting detected"
      const targetOpacity = showLowLightBadge ? 1.0 : 0.0

      let currentOpacity = lowLightOpacityCache.get(trackId) ?? 0.0

      // Interpolate opacity towards target (LERP)
      const lerpFactor = 0.12
      currentOpacity += (targetOpacity - currentOpacity) * lerpFactor

      if (currentOpacity < 0.001) {
        lowLightOpacityCache.delete(trackId)
      } else {
        lowLightOpacityCache.set(trackId, currentOpacity)
      }

      if (currentOpacity > 0.01) {
        ctx.save()
        ctx.globalAlpha = (face.renderOpacity ?? 1) * currentOpacity
        ctx.font = "italic 11px system-ui, sans-serif"
        const warningText = "⚠ Poor lighting detected"

        let warnBadgeY = badgeY - 14
        if (warnBadgeY < 6) {
          warnBadgeY = badgeY + 16
        }

        // Render borderless text with drop shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)"
        ctx.shadowBlur = 4
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 1

        ctx.fillStyle = "#f5a623" // desaturated honey-gold for dark mode
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(warningText, x1 + width / 2, warnBadgeY)
        ctx.restore()
      }

      // Premium Minimalist Floating Design:
      // All guidance and warning prompts float in a clean, solid white (#f8fafc) to reduce visual clutter.
      // Cyan is strictly reserved for successfully verified member names, keeping the viewport calm and premium.
      let textColor = "#f8fafc" // solid white by default for all guidance prompts
      if (labelTone === "recognition") {
        if (isShield) {
          textColor = "#818cf8" // indigo-400 for No Consent shield
        } else {
          textColor = color // status color (cyan for verified success)
        }
      }

      ctx.textBaseline = "middle"

      // Enforce high-readability drop shadow for weightless floating text
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)"
      ctx.shadowBlur = 4
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 1

      if (isVerifyingState) {
        const textStartX = badgeX + badgeW / 2 - textWidth / 2
        ctx.textAlign = "left"
        ctx.fillStyle = textColor
        ctx.fillText("Verifying", textStartX, badgeY + badgeH / 2)

        const baseTextWidth = ctx.measureText("Verifying").width
        const dotSpacing = 3.5

        // Cycle parameters: 1.8s per sequential loop
        const cycleDuration = 1800
        const t = (performance.now() % cycleDuration) / cycleDuration

        for (let i = 0; i < 3; i++) {
          const dotX = textStartX + baseTextWidth + i * dotSpacing + 1.5

          let opacity: number
          if (t < 0.75) {
            // Sequential smooth fade-in per dot
            const start = i * 0.25
            const end = start + 0.25
            if (t >= end) {
              opacity = 1.0
            } else if (t >= start) {
              const progress = (t - start) / 0.25
              opacity = progress * progress * (3 - 2 * progress) // smoothstep
            } else {
              opacity = 0.0
            }
          } else {
            // Simultaneous smooth fade-out at cycle end
            const progress = (t - 0.75) / 0.25
            const fadeOutProgress = progress * progress * (3 - 2 * progress)
            opacity = 1.0 - fadeOutProgress
          }

          ctx.fillStyle = `rgba(248, 250, 252, ${opacity})`
          ctx.fillText(".", dotX, badgeY + badgeH / 2)
        }
      } else {
        ctx.fillStyle = textColor
        ctx.textAlign = "center"
        ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2)
      }

      // Stacked Sub-label/Helper Hint underneath the primary badge with smooth LERP transition
      const subLabelText = face.overlayGuidance?.subLabel
      const subTargetOpacity = subLabelText ? 1.0 : 0.0
      let subCurrentOpacity = subLabelOpacityCache.get(trackId) ?? 0.0

      subCurrentOpacity += (subTargetOpacity - subCurrentOpacity) * 0.12

      if (subCurrentOpacity < 0.001) {
        subLabelOpacityCache.delete(trackId)
      } else {
        subLabelOpacityCache.set(trackId, subCurrentOpacity)
      }

      if (subCurrentOpacity > 0.01 && subLabelText) {
        ctx.save()
        ctx.globalAlpha = (face.renderOpacity ?? 1) * subCurrentOpacity
        ctx.font = "normal 10px system-ui, sans-serif"
        ctx.fillStyle = "#cbd5e1" // slate-300 for premium low-fatigue subtitle
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        // Enforce high-readability drop shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.9)"
        ctx.shadowBlur = 4
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 1

        const subLabelY = Math.min(displayHeight - 8, y2 + 24)

        // When "Slowly turn head" is active, the dedicated floating 3D HUD card handles the guidance.
        // For other guidance cues (e.g. "Step into light", "Keep face upright"), render the subtitle text here.
        if (subLabelText !== "Slowly turn head") {
          ctx.fillText(subLabelText, x1 + width / 2, subLabelY)
        }
        ctx.restore()
      }
    }

    ctx.shadowBlur = 0
    ctx.shadowColor = "transparent"
    ctx.restore()
  })

  ctx.restore()
}
