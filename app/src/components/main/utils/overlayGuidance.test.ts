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
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Center face",
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
        verifyingHintActive: false,
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
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Verifying...",
      tone: "warning",
    })
  })

  it("maps candidate_real to the same temporary verifying prompt", () => {
    const face = baseFace({
      liveness: {
        is_real: false,
        status: "candidate_real",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        recognitionResult: null,
        holdStillActive: false,
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Verifying...",
      tone: "warning",
    })
  })

  it("shows a more helpful delayed hint when verifying stays stuck in optimal light", () => {
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
        verifyingHintActive: true,
      }),
    ).toEqual({
      label: "Verifying...",
      subLabel: "Slowly turn head",
      tone: "warning",
      isLowLight: undefined,
    })
  })

  it("shows Poor lighting detected instantly when low-light is true", () => {
    const face = baseFace({
      low_light: true,
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
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Verifying...",
      tone: "warning",
      isLowLight: true,
    })
  })

  it("shows Poor lighting detected when stuck in low light", () => {
    const face = baseFace({
      low_light: true,
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
        verifyingHintActive: true,
      }),
    ).toEqual({
      label: "Verifying...",
      subLabel: "Slowly turn head",
      tone: "warning",
      isLowLight: true,
    })
  })

  it("shows Poor lighting detected when low-light is true and status is neutral", () => {
    const face = baseFace({
      low_light: true,
      liveness: {
        is_real: null,
        status: "real",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        recognitionResult: null,
        holdStillActive: false,
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Poor lighting detected",
      tone: "warning",
      isLowLight: true,
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
        verifyingHintActive: false,
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
        verifyingHintActive: false,
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

  it("suppresses overlay guidance for unrecognized faces to stay sleek and neutral", () => {
    const face = baseFace({
      track_id: 10,
      liveness: {
        is_real: false,
        status: "candidate_real",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: true,
        recognitionResult: {
          success: true,
          person_id: null,
          name: "Unknown",
          similarity: 0.1,
          processing_time: 0,
          error: null,
        },
        holdStillActive: false,
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Verifying...",
      tone: "warning",
      isLowLight: undefined,
    })
  })

  it("returns avoid glare guidance when liveness status is glare", () => {
    const face = baseFace({
      liveness: {
        is_real: null,
        confidence: 0.9,
        status: "glare",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: false,
        recognitionResult: null,
        holdStillActive: false,
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Too bright",
      subLabel: "Avoid direct light",
      tone: "warning",
      isLowLight: undefined,
    })
  })

  it("returns too dark guidance when liveness status is too_dark", () => {
    const face = baseFace({
      liveness: {
        is_real: null,
        confidence: 0.9,
        status: "too_dark",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: false,
        recognitionResult: null,
        holdStillActive: false,
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Too dark",
      subLabel: "Step into light",
      tone: "warning",
      isLowLight: true,
    })
  })

  it("returns look at camera guidance when liveness status is look_at_camera", () => {
    const face = baseFace({
      liveness: {
        is_real: null,
        confidence: 0.0,
        status: "look_at_camera",
      },
    })

    expect(
      getOverlayGuidance(face, {
        enableSpoofDetection: true,
        recognitionEnabled: false,
        recognitionResult: null,
        holdStillActive: false,
        verifyingHintActive: false,
      }),
    ).toEqual({
      label: "Look at camera",
      subLabel: "Keep face upright",
      tone: "warning",
      isLowLight: undefined,
    })
  })
})
