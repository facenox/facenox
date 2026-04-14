import { describe, expect, it } from "vitest"

import type { DetectionResult } from "@/components/main/types"
import { getOverlayGuidance, updateHoldStillCache } from "@/components/main/utils/overlayGuidance"

const baseFace = (
  overrides: Partial<DetectionResult["faces"][number]> = {},
): DetectionResult["faces"][number] => ({
  bbox: {
    x: 10,
    y: 20,
    width: 100,
    height: 120,
  },
  confidence: 0.98,
  track_id: -1,
  landmarks_5: [
    [20, 30],
    [80, 30],
    [50, 55],
    [28, 88],
    [72, 88],
  ],
  ...overrides,
})

describe("overlayGuidance", () => {
  it("maps center_face to a centering prompt", () => {
    const face = baseFace({
      liveness: {
        is_real: null,
        status: "center_face",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        recognitionResult: null,
        holdStillActive: false,
      }),
    ).toEqual({
      label: "Center your face",
      tone: "warning",
    })
  })

  it("maps move_closer to a distance prompt", () => {
    const face = baseFace({
      liveness: {
        is_real: null,
        status: "move_closer",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        recognitionResult: null,
        holdStillActive: false,
      }),
    ).toEqual({
      label: "Move closer",
      tone: "warning",
    })
  })

  it("maps spoof to a temporary verifying prompt before failure is sustained", () => {
    const face = baseFace({
      liveness: {
        is_real: false,
        status: "spoof",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        recognitionResult: null,
        holdStillActive: false,
      }),
    ).toEqual({
      label: "Verifying...",
      tone: "warning",
    })
  })

  it("does not expose a user-facing label for raw errors", () => {
    const face = baseFace({
      liveness: {
        is_real: false,
        status: "error",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        recognitionResult: null,
        holdStillActive: false,
      }),
    ).toBeNull()
  })

  it("suppresses guidance for recognized live faces", () => {
    const face = baseFace({
      track_id: 7,
      liveness: {
        is_real: true,
        status: "real",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        recognitionResult: {
          success: true,
          person_id: "person-1",
          name: "Person One",
          similarity: 0.97,
          processing_time: 0,
          error: null,
        },
        holdStillActive: false,
      }),
    ).toBeNull()
  })

  it("requires persistence before showing hold still and clears once tracking stabilizes", () => {
    const firstFrame = [baseFace()]
    const secondFrame = [
      baseFace({
        bbox: { x: 12, y: 22, width: 100, height: 120 },
      }),
    ]
    const trackedFrame = [
      baseFace({
        track_id: 12,
        liveness: {
          is_real: true,
          status: "real",
        },
      }),
    ]

    const firstPass = updateHoldStillCache(firstFrame, new Map(), 1000, 0, {
      enableSpoofDetection: true,
      recognitionEnabled: true,
      currentRecognitionResults: new Map(),
    })
    expect(firstPass.activeKeys.size).toBe(0)

    const secondPass = updateHoldStillCache(
      secondFrame,
      firstPass.nextCache,
      1100,
      firstPass.nextAnonymousSeed,
      {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        currentRecognitionResults: new Map(),
      },
    )
    expect(secondPass.activeKeys.size).toBe(1)

    const trackedPass = updateHoldStillCache(
      trackedFrame,
      secondPass.nextCache,
      1200,
      secondPass.nextAnonymousSeed,
      {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        currentRecognitionResults: new Map([
          [
            12,
            {
              success: true,
              person_id: "person-1",
              name: "Person One",
              similarity: 0.97,
              processing_time: 0,
              error: null,
            },
          ],
        ]),
      },
    )
    expect(trackedPass.activeKeys.size).toBe(0)
    expect(trackedPass.nextCache.size).toBe(0)
  })
})
