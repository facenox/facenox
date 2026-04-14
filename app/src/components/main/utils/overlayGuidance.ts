import type { DetectionResult } from "@/components/main/types"
import type { ExtendedFaceRecognitionResponse } from "@/components/main/utils/recognitionHelpers"

type Face = DetectionResult["faces"][number]
type FaceBbox = Face["bbox"]

export interface OverlayGuidance {
  label: string
  tone: "warning" | "failure"
}

export interface HoldStillCacheEntry {
  bbox: FaceBbox
  firstSeenAt: number
  lastSeenAt: number
  consecutiveFrames: number
}

interface HoldStillCacheOptions {
  enableSpoofDetection: boolean
  recognitionEnabled: boolean
  currentRecognitionResults: Map<number, ExtendedFaceRecognitionResponse>
  minFrames?: number
  minDurationMs?: number
}

const HOLD_STILL_IOU_THRESHOLD = 0.3
const DEFAULT_MIN_FRAMES = 2
const DEFAULT_MIN_DURATION_MS = 250

const hasPositiveTrackId = (trackId: number | undefined): boolean =>
  typeof trackId === "number" && trackId > 0

const getRecognitionResult = (
  face: Face,
  currentRecognitionResults: Map<number, ExtendedFaceRecognitionResponse>,
): ExtendedFaceRecognitionResponse | null => {
  const trackId = face.track_id
  if (trackId === undefined) {
    return face.recognition ?? null
  }
  return currentRecognitionResults.get(trackId) ?? face.recognition ?? null
}

export const isRecognizedLiveFace = (
  face: Face,
  recognitionEnabled: boolean,
  recognitionResult: ExtendedFaceRecognitionResponse | null,
): boolean => {
  return Boolean(
    recognitionEnabled && recognitionResult?.person_id && face.liveness?.status !== "spoof",
  )
}

const getBoundingBoxIoU = (a: FaceBbox, b: FaceBbox): number => {
  const ax2 = a.x + a.width
  const ay2 = a.y + a.height
  const bx2 = b.x + b.width
  const by2 = b.y + b.height

  const overlapWidth = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x))
  const overlapHeight = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y))
  const intersection = overlapWidth * overlapHeight

  if (intersection <= 0) {
    return 0
  }

  const areaA = a.width * a.height
  const areaB = b.width * b.height
  return intersection / Math.max(areaA + areaB - intersection, 1e-6)
}

const hasHigherPriorityGuidance = (face: Face): boolean => {
  const status = face.liveness?.status
  return status === "center_face" || status === "move_closer"
}

const isHoldStillCandidate = (
  face: Face,
  currentRecognitionResults: Map<number, ExtendedFaceRecognitionResponse>,
  recognitionEnabled: boolean,
  enableSpoofDetection: boolean,
): boolean => {
  if (!enableSpoofDetection) {
    return false
  }

  const recognitionResult = getRecognitionResult(face, currentRecognitionResults)
  if (isRecognizedLiveFace(face, recognitionEnabled, recognitionResult)) {
    return false
  }

  if (hasHigherPriorityGuidance(face)) {
    return false
  }

  return !hasPositiveTrackId(face.track_id)
}

const findBestCacheKey = (
  face: Face,
  cache: Map<string, { bbox: FaceBbox }>,
  usedKeys: Set<string>,
): string | null => {
  if (hasPositiveTrackId(face.track_id)) {
    return `track-${face.track_id}`
  }

  let bestKey: string | null = null
  let bestIoU = 0

  for (const [key, entry] of cache) {
    if (usedKeys.has(key)) {
      continue
    }

    const iou = getBoundingBoxIoU(face.bbox, entry.bbox)
    if (iou > bestIoU) {
      bestIoU = iou
      bestKey = key
    }
  }

  if (bestIoU >= HOLD_STILL_IOU_THRESHOLD) {
    return bestKey
  }

  return null
}

const buildPersistenceCacheEntry = (
  face: Face,
  previousEntry: HoldStillCacheEntry | undefined,
  now: number,
): HoldStillCacheEntry => ({
  bbox: face.bbox,
  firstSeenAt: previousEntry?.firstSeenAt ?? now,
  lastSeenAt: now,
  consecutiveFrames: (previousEntry?.consecutiveFrames ?? 0) + 1,
})

export const updateHoldStillCache = (
  faces: Face[],
  previousCache: Map<string, HoldStillCacheEntry>,
  now: number,
  nextAnonymousSeed: number,
  options: HoldStillCacheOptions,
): {
  nextCache: Map<string, HoldStillCacheEntry>
  activeKeys: Set<string>
  faceKeyByIndex: Map<number, string>
  nextAnonymousSeed: number
} => {
  const {
    enableSpoofDetection,
    recognitionEnabled,
    currentRecognitionResults,
    minFrames = DEFAULT_MIN_FRAMES,
    minDurationMs = DEFAULT_MIN_DURATION_MS,
  } = options

  if (!enableSpoofDetection || faces.length === 0) {
    return {
      nextCache: new Map(),
      activeKeys: new Set(),
      faceKeyByIndex: new Map(),
      nextAnonymousSeed,
    }
  }

  const nextCache = new Map<string, HoldStillCacheEntry>()
  const activeKeys = new Set<string>()
  const faceKeyByIndex = new Map<number, string>()
  const usedKeys = new Set<string>()

  faces.forEach((face, index) => {
    if (
      !isHoldStillCandidate(
        face,
        currentRecognitionResults,
        recognitionEnabled,
        enableSpoofDetection,
      )
    ) {
      return
    }

    const matchedKey = findBestCacheKey(face, previousCache, usedKeys)
    const key = matchedKey ?? `anon-${nextAnonymousSeed++}`
    const previousEntry = matchedKey ? previousCache.get(matchedKey) : undefined
    const nextEntry = buildPersistenceCacheEntry(face, previousEntry, now)

    nextCache.set(key, nextEntry)
    usedKeys.add(key)
    faceKeyByIndex.set(index, key)

    if (nextEntry.consecutiveFrames >= minFrames || now - nextEntry.firstSeenAt >= minDurationMs) {
      activeKeys.add(key)
    }
  })

  return {
    nextCache,
    activeKeys,
    faceKeyByIndex,
    nextAnonymousSeed,
  }
}

export const getOverlayGuidance = (
  face: Face,
  options: {
    enableSpoofDetection: boolean
    recognitionEnabled: boolean
    recognitionResult: ExtendedFaceRecognitionResponse | null
    holdStillActive: boolean
  },
): OverlayGuidance | null => {
  const { enableSpoofDetection, recognitionEnabled, recognitionResult, holdStillActive } = options

  if (!enableSpoofDetection) {
    return null
  }

  if (isRecognizedLiveFace(face, recognitionEnabled, recognitionResult)) {
    return null
  }

  const status = face.liveness?.status

  if (status === "center_face") {
    return { label: "Center your face", tone: "warning" }
  }

  if (status === "move_closer") {
    return { label: "Move closer", tone: "warning" }
  }

  if (holdStillActive) {
    return { label: "Hold still", tone: "warning" }
  }

  if (status === "spoof") {
    return { label: "Verifying...", tone: "warning" }
  }

  return null
}
