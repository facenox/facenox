export {
  cleanupStream,
  cleanupVideo,
  cleanupAnimationFrame,
} from "@/components/main/utils/cleanupHelpers"

export {
  resetLastDetectionRef,
  resetFrameCounters,
} from "@/components/main/utils/stateResetHelpers"

export type { ExtendedFaceRecognitionResponse } from "@/components/main/utils/recognitionHelpers"
export {
  trimTrackingHistory,
  areRecognitionMapsEqual,
} from "@/components/main/utils/recognitionHelpers"

export { getMemberFromCache } from "@/components/main/utils/memberCacheHelpers"
export { drawOverlays, clearOverlayRendererCache } from "@/components/main/utils/overlayRenderer"
