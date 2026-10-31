import { act, renderHook } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { useFaceDetection } from "./useFaceDetection"
import { useBackendService } from "./useBackendService"
import { useCameraStore, useAttendanceStore } from "@/components/main/stores"
import type { WebSocketService } from "@/services/WebSocketService"
import type { DetectionResult } from "@/components/main/types"

vi.mock("@/services", () => ({ persistentSettings: { get: vi.fn(async () => "device") } }))
vi.mock("@/components/main/hooks/useAttendanceGroups", () => ({ ALL_GROUPS_ID: "all" }))
vi.mock("@/services/SoundEffectsService", () => ({ soundEffects: { play: vi.fn() } }))
vi.mock("@/utils/syncNotifier", () => ({ notifyDataChanged: vi.fn() }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function createDetectionOptions() {
  const send = vi.fn<(data: ArrayBuffer) => Promise<void>>(async () => {})
  const options: Parameters<typeof useFaceDetection>[0] = {
    webSocketServiceRef: {
      current: {
        isWebSocketReady: () => true,
        sendDetectionRequest: send,
      } as unknown as WebSocketService,
    },
    isScanningRef: { current: true },
    isStreamingRef: { current: true },
    captureFrame: vi.fn(async () => new ArrayBuffer(16)),
    lastDetectionFrameRef: { current: null },
    frameCounterRef: { current: 0 },
    skipFramesRef: { current: 0 },
    lastFrameTimestampRef: { current: 0 },
    lastDetectionRef: { current: null },
    processCurrentFrameRef: { current: async () => {} },
    trackingSessionRef: { current: 1 },
    detectionInFlightRef: { current: false },
  }
  return { options, send }
}

it("does not send a captured frame after scanning stops", async () => {
  const { options, send } = createDetectionOptions()
  let finishCapture!: (value: ArrayBuffer) => void
  options.captureFrame = () =>
    new Promise((resolve) => {
      finishCapture = resolve
    })
  renderHook(() => useFaceDetection(options))
  let pending!: Promise<void>
  act(() => {
    pending = options.processCurrentFrameRef.current()
  })
  options.isScanningRef.current = false
  options.isStreamingRef.current = false
  options.trackingSessionRef.current += 1
  await act(async () => {
    finishCapture(new ArrayBuffer(16))
    await pending
  })
  expect(send).not.toHaveBeenCalled()
})

it("drops a late capture when the watchdog has already retried", async () => {
  vi.useFakeTimers()
  const { options, send } = createDetectionOptions()
  let finishOld!: (value: ArrayBuffer) => void
  const latest = new ArrayBuffer(32)
  options.captureFrame = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve
        }),
    )
    .mockResolvedValue(latest)
  renderHook(() => useFaceDetection(options))
  let pending!: Promise<void>
  act(() => {
    pending = options.processCurrentFrameRef.current()
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000)
  })
  expect(send).toHaveBeenCalledExactlyOnceWith(latest)
  await act(async () => {
    finishOld(new ArrayBuffer(16))
    await pending
  })
  expect(send).toHaveBeenCalledTimes(1)
  expect(options.lastDetectionFrameRef.current).toBe(latest)
})

it("cleans up its watchdog on unmount", async () => {
  vi.useFakeTimers()
  const { options, send } = createDetectionOptions()
  const { unmount } = renderHook(() => useFaceDetection(options))
  await act(async () => {
    await options.processCurrentFrameRef.current()
  })
  unmount()
  await vi.advanceTimersByTimeAsync(10_000)
  expect(send).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it("automatically retries a frame that receives no response, even after a wall-clock correction", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"))
  const send = vi.fn(async () => {})
  const raf = vi.fn()
  vi.stubGlobal("requestAnimationFrame", raf)
  const options = {
    webSocketServiceRef: {
      current: {
        isWebSocketReady: () => true,
        sendDetectionRequest: send,
      } as unknown as WebSocketService,
    },
    isScanningRef: { current: true },
    isStreamingRef: { current: true },
    captureFrame: vi.fn(async () => new ArrayBuffer(16)),
    lastDetectionFrameRef: { current: null as ArrayBuffer | null },
    frameCounterRef: { current: 0 },
    skipFramesRef: { current: 0 },
    lastFrameTimestampRef: { current: 0 },
    lastDetectionRef: { current: null as DetectionResult | null },
    processCurrentFrameRef: { current: async () => {} },
    trackingSessionRef: { current: 1 },
    detectionInFlightRef: { current: false },
  }
  renderHook(() => useFaceDetection(options))
  await act(async () => {
    await options.processCurrentFrameRef.current()
  })
  expect(send).toHaveBeenCalledTimes(1)
  expect(options.detectionInFlightRef.current).toBe(true)
  // A silent/no-response frame is the condition the watchdog says it handles.
  vi.setSystemTime(new Date("2026-10-31T23:00:00Z"))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000)
  })
  expect(options.detectionInFlightRef.current).toBe(true)
  expect(send).toHaveBeenCalledTimes(2)
  expect(raf).not.toHaveBeenCalled()
  options.isScanningRef.current = false
  options.isStreamingRef.current = false
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000)
  })
  expect(send).toHaveBeenCalledTimes(2)
  vi.unstubAllGlobals()
})

it("schedules the next frame when a backend response timestamp goes backward", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"))
  const handlers = new Map<string, (data: unknown) => void>()
  const socket = {
    isWebSocketReady: () => true,
    updateLiveConfig: vi.fn(),
    offMessage: vi.fn(),
    onMessage: (topic: string, handler: (data: unknown) => void) => handlers.set(topic, handler),
    onStatusChange: () => () => {},
    sendDetectionRequest: vi.fn(async () => {}),
  }
  const raf = vi.fn()
  vi.stubGlobal("requestAnimationFrame", raf)
  const options = {
    webSocketServiceRef: { current: socket as unknown as WebSocketService },
    isScanningRef: { current: false },
    isStreamingRef: { current: false },
    captureFrame: vi.fn(async () => new ArrayBuffer(16)),
    lastDetectionFrameRef: { current: null as ArrayBuffer | null },
    frameCounterRef: { current: 0 },
    skipFramesRef: { current: 0 },
    lastFrameTimestampRef: { current: 0 },
    lastDetectionRef: { current: null as DetectionResult | null },
    processCurrentFrameRef: { current: async () => {} },
    trackingSessionRef: { current: 1 },
    detectionInFlightRef: { current: false },
  }
  useCameraStore.setState({ websocketStatus: "disconnected" })
  useAttendanceStore.setState({ enableSpoofDetection: false })
  const backendOptions = {
    ...options,
    isStartingRef: { current: false },
    currentGroupId: "g",
    maxRecognitionFacesPerFrame: 6,
    performFaceRecognition: vi.fn(async () => {}),
    stopCamera: { current: null },
    animationFrameRef: { current: undefined },
    streamRef: { current: null },
    videoRef: { current: null },
    backendServiceReadyRef: { current: true },
    loadAttendanceDataRef: { current: async () => {} },
  }
  renderHook(() => {
    useFaceDetection(options)
    return useBackendService(backendOptions)
  })
  options.isStreamingRef.current = true
  options.isScanningRef.current = true
  options.lastFrameTimestampRef.current = 100
  await act(async () => {
    await options.processCurrentFrameRef.current()
  })
  act(() => {
    handlers.get("detection_response")?.({
      faces: [],
      model_used: "face_detector",
      success: true,
      frame_timestamp: 99,
    })
  })
  expect(options.lastFrameTimestampRef.current).toBe(99)
  expect(raf).toHaveBeenCalledTimes(1)
  await act(async () => {
    await (raf.mock.calls[0][0] as () => void)()
  })
  expect(socket.sendDetectionRequest).toHaveBeenCalledTimes(2)
  vi.unstubAllGlobals()
})
