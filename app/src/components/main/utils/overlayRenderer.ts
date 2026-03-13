import type { DetectionResult } from "@/components/main/types"
import type { ExtendedFaceRecognitionResponse } from "./recognitionHelpers"
import type { QuickSettings } from "@/components/settings"

export const getFaceColor = (
  recognitionResult: ExtendedFaceRecognitionResponse | null,
  recognitionEnabled: boolean,
  livenessStatus?: string,
) => {
  // Security first: Spoofing always triggers Red
  if (livenessStatus === "spoof") return "#ef4444" // Red-500

  const isRecognized = recognitionEnabled && recognitionResult?.person_id
  if (!isRecognized) return "#ef4444" // Red for unknown

  // Privacy second: No consent triggers Indigo (Shield)
  if (recognitionResult?.has_consent === false) return "#6366f1" // Indigo-500

  return "#00ff41" // Matrix Green for logged members
}

// Helper to draw rounded rectangle (manual implementation for compatibility)
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
  const cornerRadius = 8 // Modern rounded corners

  // Draw rounded rectangle
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
  persistentCooldowns,
  quickSettings,
  getVideoRect,
  calculateScaleFactors,
  currentGroupId,
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
    const recognitionResult = currentRecognitionResults.get(trackId)
    const color = getFaceColor(recognitionResult || null, recognitionEnabled, face.liveness?.status)

    const isBlocked = recognitionResult?.has_consent === false

    if (isBlocked && face.liveness?.status !== "spoof") {
      // PREMIUM SHIELD: Blur the face area
      ctx.save()
      const cornerRadius = 8
      ctx.beginPath()
      drawRoundedRect(ctx, x1, y1, width, height, cornerRadius)
      ctx.clip()

      // Draw mirrored or normal video section
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

    const isRecognized = recognitionEnabled && recognitionResult?.person_id
    let label = ""
    let shouldShowLabel = false

    if (isRecognized && recognitionResult && quickSettings.showRecognitionNames) {
      if (recognitionResult.has_consent === false) {
        label = "No Consent"
      } else {
        label = recognitionResult.name || recognitionResult.person_id || "Unknown"
      }
      shouldShowLabel = true
    }

    if (shouldShowLabel && recognitionResult) {
      ctx.save()

      const isShield = recognitionResult.has_consent === false
      const text = label
      ctx.font = "bold 12px system-ui, sans-serif"
      const textWidth = ctx.measureText(text).width
      const paddingH = 10
      const badgeW = textWidth + paddingH * 2
      const badgeH = 20

      const badgeX = x1 + (width - badgeW) / 2
      const badgeY = y1 - 25

      // Draw Badge Background
      if (!isShield) {
        ctx.fillStyle = color
        drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 10)
        ctx.fill()
      }

      // Draw Text
      if (isShield) {
        // Text-only for 'No Consent'
        ctx.fillStyle = "#22d3ee" // Cyan-400 for high contrast
        ctx.shadowColor = "#000000"
        ctx.shadowBlur = 8
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 2
      } else {
        ctx.fillStyle = "#000000"
      }
      
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2)

      ctx.restore()
    }

    if (isRecognized && recognitionResult?.person_id && currentGroupId) {
      const cooldownKey = `${recognitionResult.person_id}-${currentGroupId}`
      const cooldownInfo = persistentCooldowns.get(cooldownKey)
      if (cooldownInfo) {
        if (cooldownInfo) {
          ctx.save()

          const centerX = (x1 + x2) / 2
          const centerY = (y1 + y2) / 2

          ctx.fillStyle = "#FFFFFF"
          ctx.font = "500 40px system-ui, -apple-system, sans-serif"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText("Done", centerX, centerY)

          ctx.restore()
        }
      }
    }

    ctx.shadowBlur = 0
  })

  ctx.restore()
}
