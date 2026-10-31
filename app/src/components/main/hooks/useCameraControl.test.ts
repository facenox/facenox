import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useCameraControl } from "./useCameraControl"
import { useStreamState } from "./useStreamState"
import type { WebSocketService } from "@/services/WebSocketService"
import type { DetectionResult } from "@/components/main/types"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function makeStream() {
  const track = { onended: null, stop: vi.fn(), readyState: "live" }
  const stream = { active: true, getTracks: () => [track], getVideoTracks: () => [track] }
  track.stop.mockImplementation(() => {
    track.readyState = "ended"
    stream.active = false
  })
  return { track, stream: stream as unknown as MediaStream }
}

function setup(width = 640) {
  const video = document.createElement("video")
  Object.defineProperty(video, "videoWidth", { configurable: true, value: width })
  Object.defineProperty(video, "videoHeight", { configurable: true, value: width ? 480 : 0 })
  video.play = vi.fn().mockResolvedValue(undefined)
  video.pause = vi.fn()
  const devices = [
    { deviceId: "cam-1", kind: "videoinput", label: "Camera", groupId: "g" },
  ] as MediaDeviceInfo[]
  const getUserMedia = vi.fn()
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } })
  const options = {
    videoRef: { current: video },
    streamRef: { current: null as MediaStream | null },
    animationFrameRef: { current: undefined as number | undefined },
    webSocketServiceRef: {
      current: {
        getWebSocketStatus: () => "connected",
        isWebSocketReady: () => true,
        refreshActiveStream: vi.fn(),
      } as unknown as WebSocketService,
    },
    isStreamingRef: { current: false },
    isScanningRef: { current: false },
    isStartingRef: { current: false },
    isStoppingRef: { current: false },
    lastStartTimeRef: { current: 0 },
    lastStopTimeRef: { current: 0 },
    frameCounterRef: { current: 0 },
    skipFramesRef: { current: 0 },
    lastFrameTimestampRef: { current: 0 },
    lastDetectionRef: { current: null as DetectionResult | null },
    lastDetectionFrameRef: { current: null as ArrayBuffer | null },
    backendServiceReadyRef: { current: true },
    processCurrentFrameRef: { current: vi.fn(async () => {}) },
    trackingSessionRef: { current: 0 },
    detectionInFlightRef: { current: false },
    resetOverlayRefs: vi.fn(),
    overlayCanvasRef: { current: null },
    setIsStreaming: vi.fn(),
    setIsVideoLoading: vi.fn(),
    setCameraActive: vi.fn(),
    setSelectedCamera: vi.fn(),
    setError: vi.fn(),
    selectedCamera: "cam-1" as string | null,
    cameraDevices: devices,
    initializeWebSocket: vi.fn(async () => {}),
    getCameraDevices: vi.fn(async () => devices),
  }
  return { options, getUserMedia, video }
}

function renderCamera(options: ReturnType<typeof setup>["options"]) {
  const isProcessingRef = { current: false }
  return renderHook(() => {
    useStreamState({ ...options, isProcessingRef })
    return useCameraControl(options)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"))
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
})

it("cancels startup before device enumeration completes", async () => {
  const { options, getUserMedia } = setup()
  const devices = deferred<MediaDeviceInfo[]>()
  options.getCameraDevices = vi.fn(() => devices.promise)
  const { result } = renderCamera(options)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  act(() => result.current.stopCamera())
  await act(async () => {
    devices.resolve(options.cameraDevices)
    await pending
  })
  expect(getUserMedia).not.toHaveBeenCalled()
  expect(options.isStartingRef.current).toBe(false)
  expect(options.isScanningRef.current).toBe(false)
})

it("does not let a cancelled acquisition overwrite a newer startup", async () => {
  const { options, getUserMedia, video } = setup()
  const oldAcquisition = deferred<MediaStream>()
  const older = makeStream()
  const newer = makeStream()
  getUserMedia.mockReturnValueOnce(oldAcquisition.promise).mockResolvedValueOnce(newer.stream)
  const { result } = renderCamera(options)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  act(() => result.current.stopCamera())
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
    await result.current.startCamera()
  })
  await act(async () => {
    oldAcquisition.resolve(older.stream)
    await pending
  })
  expect(older.track.stop).toHaveBeenCalledTimes(1)
  expect(newer.track.stop).not.toHaveBeenCalled()
  expect(options.streamRef.current).toBe(newer.stream)
  expect(video.srcObject).toBe(newer.stream)
  expect(options.isScanningRef.current).toBe(true)
})

it("releases a late stream after unmount", async () => {
  const { options, getUserMedia } = setup()
  const acquisition = deferred<MediaStream>()
  const { stream, track } = makeStream()
  getUserMedia.mockReturnValue(acquisition.promise)
  const { result, unmount } = renderCamera(options)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  unmount()
  await act(async () => {
    acquisition.resolve(stream)
    await pending
  })
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(options.streamRef.current).toBeNull()
  expect(options.isScanningRef.current).toBe(false)
})

it("keeps an explicit camera selection when its constraints fail", async () => {
  const { options, getUserMedia } = setup()
  getUserMedia.mockRejectedValueOnce(
    Object.assign(new Error("unsupported"), { name: "OverconstrainedError" }),
  )
  const { result } = renderCamera(options)
  await act(async () => {
    await result.current.startCamera()
  })
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  expect(options.isScanningRef.current).toBe(false)
  expect(options.setError).toHaveBeenLastCalledWith(
    "The selected camera could not be started. Select another camera or reconnect the device.",
  )
})

it("normal camera startup sends the first frame", async () => {
  const { options, getUserMedia } = setup()
  const { stream } = makeStream()
  getUserMedia.mockResolvedValue(stream)
  const { result } = renderCamera(options)
  await act(async () => {
    await result.current.startCamera()
  })
  expect(options.isScanningRef.current).toBe(true)
  expect(options.processCurrentFrameRef.current).toHaveBeenCalledTimes(1)
  act(() => result.current.stopCamera(true))
})

it("stops a late camera stream when acquisition was cancelled", async () => {
  const { options, getUserMedia, video } = setup()
  const media = deferred<MediaStream>()
  const { stream, track } = makeStream()
  getUserMedia.mockReturnValue(media.promise)
  const { result } = renderCamera(options)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
    await Promise.resolve()
  })
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  act(() => result.current.stopCamera())
  expect(options.isScanningRef.current).toBe(false)
  await act(async () => {
    media.resolve(stream)
    await pending
  })
  expect(video.srcObject).toBeNull()
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(options.isScanningRef.current).toBe(false)
  expect(options.setCameraActive).toHaveBeenLastCalledWith(false)
  expect(options.setError).toHaveBeenLastCalledWith(null)
  act(() => result.current.stopCamera(true))
})

it("releases the camera stream when video readiness times out", async () => {
  const { options, getUserMedia, video } = setup(0)
  const { stream, track } = makeStream()
  getUserMedia.mockResolvedValue(stream)
  const { result } = renderCamera(options)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
    await Promise.resolve()
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_100)
    await pending
  })
  expect(options.setError).toHaveBeenLastCalledWith(
    "Camera did not deliver video within 10 seconds.",
  )
  expect(options.isStreamingRef.current).toBe(false)
  expect(options.setCameraActive).toHaveBeenLastCalledWith(false)
  expect(options.streamRef.current).toBeNull()
  expect(video.srcObject).toBeNull()
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(stream.active).toBe(false)
  act(() => result.current.stopCamera(true))
})

it("starts detection after successful fallback camera acquisition", async () => {
  const { options, getUserMedia } = setup()
  options.selectedCamera = null
  const { stream } = makeStream()
  getUserMedia
    .mockRejectedValueOnce(
      Object.assign(new Error("unsupported device"), { name: "OverconstrainedError" }),
    )
    .mockResolvedValueOnce(stream)
  const { result } = renderCamera(options)
  await act(async () => {
    await result.current.startCamera()
  })
  expect(getUserMedia).toHaveBeenCalledTimes(2)
  expect(options.isScanningRef.current).toBe(true)
  expect(options.setCameraActive).toHaveBeenLastCalledWith(true)
  expect(options.processCurrentFrameRef.current).toHaveBeenCalledTimes(1)
  act(() => result.current.stopCamera(true))
})

it("applies the readiness deadline to fallback startup even when play never settles", async () => {
  const { options, getUserMedia, video } = setup(0)
  options.selectedCamera = null
  const play = deferred<void>()
  video.play = vi.fn().mockReturnValue(play.promise)
  const { stream, track } = makeStream()
  getUserMedia
    .mockRejectedValueOnce(
      Object.assign(new Error("unsupported device"), { name: "OverconstrainedError" }),
    )
    .mockResolvedValueOnce(stream)
  const { result } = renderCamera(options)
  let settled = false
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera().then(() => {
      settled = true
    })
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
  expect(settled).toBe(true)
  expect(options.isStartingRef.current).toBe(false)
  await pending
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(video.srcObject).toBeNull()
  expect(options.setError).toHaveBeenLastCalledWith(
    "Camera did not deliver video within 10 seconds.",
  )
  act(() => result.current.stopCamera(true))
})
