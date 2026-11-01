import { StrictMode } from "react"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useCamera } from "./useCamera"

vi.mock("@/services", () => ({
  persistentSettings: {
    getUIState: vi.fn(async () => ({})),
    setUIState: vi.fn(async () => {}),
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function makeStream() {
  const track = {
    onended: null as (() => void) | null,
    stop: vi.fn(),
    readyState: "live",
  }
  const stream = { active: true, getTracks: () => [track], getVideoTracks: () => [track] }
  track.stop.mockImplementation(() => {
    track.readyState = "ended"
    stream.active = false
  })
  return { track, stream: stream as unknown as MediaStream }
}

function setup(width = 640, strict = false) {
  const video = document.createElement("video")
  Object.defineProperties(video, {
    videoWidth: { configurable: true, value: width },
    videoHeight: { configurable: true, value: width ? 480 : 0 },
    paused: { configurable: true, writable: true, value: true },
  })
  video.play = vi.fn(async () => {
    Object.defineProperty(video, "paused", { value: false })
  })
  video.pause = vi.fn(() => {
    Object.defineProperty(video, "paused", { value: true })
  })
  const media = makeStream()
  const devices = [
    { deviceId: "camera-1", kind: "videoinput", label: "Camera" },
  ] as MediaDeviceInfo[]
  const enumerateDevices = vi.fn(async () => devices)
  const getUserMedia = vi.fn(async () => media.stream)
  vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices, getUserMedia } })
  const hook = renderHook(() => useCamera(), { wrapper: strict ? StrictMode : undefined })
  hook.result.current.videoRef.current = video
  return { ...hook, ...media, video, devices, enumerateDevices, getUserMedia }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  document.querySelectorAll("video[data-camera-health-test]").forEach((video) => video.remove())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it.each(["paused", "missing frames", "detached source"])(
  "recovers the existing stream after a temporarily %s preview",
  async (failure) => {
    const { result, video, stream, getUserMedia } = setup()
    video.dataset.cameraHealthTest = "true"
    document.body.appendChild(video)
    await act(async () => {
      await result.current.startCamera()
    })
    if (failure === "paused") Object.defineProperty(video, "paused", { value: true })
    else if (failure === "missing frames") {
      Object.defineProperty(video, "videoWidth", { value: 0 })
      Object.defineProperty(video, "videoHeight", { value: 0 })
    } else video.srcObject = null
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    Object.defineProperty(video, "videoWidth", { value: 640 })
    Object.defineProperty(video, "videoHeight", { value: 480 })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.isVideoReady).toBe(true)
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.isRecovering).toBe(false)
    expect(result.current.cameraError).toBeNull()
    expect(video.srcObject).toBe(stream)
    expect(video.paused).toBe(false)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  },
)

it("monitors a replacement stream even when stop and start are batched", async () => {
  const { result, video, getUserMedia } = setup()
  video.dataset.cameraHealthTest = "true"
  document.body.appendChild(video)
  await act(async () => {
    await result.current.startCamera()
  })
  const retry = makeStream()
  getUserMedia.mockResolvedValueOnce(retry.stream)
  await act(async () => {
    result.current.stopCamera()
    await result.current.startCamera()
  })
  Object.defineProperty(video, "paused", { value: true })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(video.srcObject).toBe(retry.stream)
  expect(video.paused).toBe(false)
  expect(result.current.isVideoReady).toBe(true)
  expect(getUserMedia).toHaveBeenCalledTimes(2)
  expect(video.play).toHaveBeenCalledTimes(3)
})

it.each(["rejected", "timed out"])(
  "reports a %s playback recovery instead of staying unready",
  async (failure) => {
    const { result, video, track, getUserMedia } = setup()
    video.dataset.cameraHealthTest = "true"
    document.body.appendChild(video)
    await act(async () => {
      await result.current.startCamera()
    })
    Object.defineProperty(video, "paused", { value: true })
    if (failure === "rejected")
      vi.mocked(video.play).mockRejectedValueOnce(new Error("Playback failed"))
    else vi.mocked(video.play).mockReturnValueOnce(new Promise<void>(() => {}))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    if (failure === "timed out") {
      expect(result.current.isRecovering).toBe(true)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
    }
    expect(result.current.isVideoReady).toBe(false)
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.isRecovering).toBe(false)
    expect(result.current.cameraError).toBe("Camera preview stopped. Try again.")
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  },
)

it.each(["stop", "unmount"])(
  "cancels playback recovery on %s without affecting a later preview",
  async (action) => {
    const { result, video, track, getUserMedia, unmount } = setup()
    video.dataset.cameraHealthTest = "true"
    document.body.appendChild(video)
    await act(async () => {
      await result.current.startCamera()
    })
    const playback = deferred<void>()
    Object.defineProperty(video, "paused", { value: true })
    vi.mocked(video.play).mockReturnValueOnce(playback.promise)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.isRecovering).toBe(true)
    act(() => {
      if (action === "stop") result.current.stopCamera()
      else unmount()
    })
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    const retry = makeStream()
    if (action === "stop") {
      getUserMedia.mockResolvedValueOnce(retry.stream)
      await act(async () => {
        await result.current.startCamera()
      })
    }
    await act(async () => playback.resolve())
    if (action === "stop") {
      expect(result.current.isVideoReady).toBe(true)
      expect(result.current.isRecovering).toBe(false)
      expect(result.current.cameraError).toBeNull()
      expect(video.srcObject).toBe(retry.stream)
      expect(retry.track.stop).not.toHaveBeenCalled()
    }
  },
)

it.each(["ended track", "video error"])(
  "surfaces a %s after the preview has started",
  async (failure) => {
    const { result, video, track, getUserMedia } = setup()
    video.dataset.cameraHealthTest = "true"
    document.body.appendChild(video)
    await act(async () => {
      await result.current.startCamera()
    })
    await act(async () => {
      if (failure === "ended track") track.readyState = "ended"
      else video.dispatchEvent(new Event("error"))
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.isVideoReady).toBe(false)
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.cameraError).toBe(
      failure === "ended track" ?
        "Active camera disconnected. Ensure camera is connected and try again."
      : "Camera preview stopped. Try again.",
    )
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  },
)

it.each([false, true])(
  "starts and releases the enrollment camera (StrictMode: %s)",
  async (strict) => {
    const { result, video, stream, track, getUserMedia, unmount } = setup(640, strict)
    await act(async () => {
      await result.current.startCamera()
    })
    expect(result.current.isStreaming).toBe(true)
    expect(result.current.isVideoReady).toBe(true)
    expect(result.current.cameraError).toBeNull()
    expect(video.srcObject).toBe(stream)
    await act(async () => {
      await result.current.startCamera()
    })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    unmount()
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(track.onended).toBeNull()
    expect(video.srcObject).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  },
)

it("cancels pending device enumeration without opening a camera", async () => {
  const { result, devices, enumerateDevices, getUserMedia } = setup()
  const enumeration = deferred<MediaDeviceInfo[]>()
  enumerateDevices.mockReturnValueOnce(enumeration.promise)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  await act(async () => {
    result.current.stopCamera()
    await pending
  })
  await act(async () => {
    enumeration.resolve(devices)
  })
  expect(getUserMedia).not.toHaveBeenCalled()
  expect(result.current.isStreaming).toBe(false)
  expect(result.current.isVideoReady).toBe(false)
})

it.each(["stop", "unmount"])("releases a camera that arrives after %s", async (action) => {
  const { result, getUserMedia, stream, track, video, unmount } = setup()
  const acquisition = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(acquisition.promise)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  await act(async () => {
    if (action === "stop") result.current.stopCamera()
    else {
      unmount()
      result.current.videoRef.current = null
    }
    await pending
  })
  expect(track.stop).not.toHaveBeenCalled()
  await act(async () => {
    acquisition.resolve(stream)
  })
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(video.srcObject).toBeNull()
  expect(video.play).not.toHaveBeenCalled()
  if (action === "stop") {
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.isVideoReady).toBe(false)
    expect(result.current.cameraError).toBeNull()
  }
})

it("does not let a canceled acquisition replace a newer stream", async () => {
  const { result, getUserMedia, video } = setup()
  const acquisition = deferred<MediaStream>()
  const older = makeStream()
  const newer = makeStream()
  getUserMedia.mockReturnValueOnce(acquisition.promise).mockResolvedValueOnce(newer.stream)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  act(() => result.current.stopCamera())
  await act(async () => {
    await result.current.startCamera()
  })
  await act(async () => {
    acquisition.resolve(older.stream)
    await pending
  })
  expect(older.track.stop).toHaveBeenCalledTimes(1)
  expect(newer.track.stop).not.toHaveBeenCalled()
  expect(video.srcObject).toBe(newer.stream)
  expect(result.current.isStreaming).toBe(true)
  expect(result.current.isVideoReady).toBe(true)
})

it("ignores a stale acquisition error while the next start is pending", async () => {
  const { result, getUserMedia } = setup()
  const older = deferred<MediaStream>()
  const newer = deferred<MediaStream>()
  getUserMedia.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
  let pending!: Promise<void>
  let retry!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  act(() => result.current.stopCamera())
  await act(async () => {
    retry = result.current.startCamera()
  })
  await act(async () => {
    older.reject(new Error("old failure"))
    await pending
  })
  await act(async () => {
    await result.current.startCamera()
  })
  expect(getUserMedia).toHaveBeenCalledTimes(2)
  expect(result.current.cameraError).toBeNull()
  const media = makeStream()
  await act(async () => {
    newer.resolve(media.stream)
    await retry
  })
  expect(result.current.isVideoReady).toBe(true)
})

it("times out a preview with no frames and allows retry", async () => {
  const { result, track, video, getUserMedia } = setup(0)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000)
    await pending
  })
  expect(result.current.cameraError).toBe("Camera preview did not become ready. Try again.")
  expect(result.current.isStreaming).toBe(false)
  expect(result.current.isVideoReady).toBe(false)
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(video.srcObject).toBeNull()
  expect(vi.getTimerCount()).toBe(0)

  const retry = makeStream()
  Object.defineProperty(video, "videoWidth", { value: 640 })
  Object.defineProperty(video, "videoHeight", { value: 480 })
  getUserMedia.mockResolvedValueOnce(retry.stream)
  await act(async () => {
    await result.current.startCamera()
  })
  expect(result.current.cameraError).toBeNull()
  expect(result.current.isVideoReady).toBe(true)
  expect(video.srcObject).toBe(retry.stream)
})

it("bounds a pending play promise even when video dimensions are available", async () => {
  const { result, video, track } = setup()
  video.play = vi.fn(() => new Promise<void>(() => {}))
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000)
    await pending
  })
  expect(result.current.cameraError).toContain("did not become ready")
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it("ignores a late play result after cancellation and retry", async () => {
  const { result, video, getUserMedia } = setup()
  const playback = deferred<void>()
  vi.mocked(video.play).mockReturnValueOnce(playback.promise)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  await act(async () => {
    result.current.stopCamera()
    await pending
  })
  const retry = makeStream()
  getUserMedia.mockResolvedValueOnce(retry.stream)
  await act(async () => {
    await result.current.startCamera()
  })
  await act(async () => {
    playback.resolve()
  })
  expect(result.current.cameraError).toBeNull()
  expect(result.current.isStreaming).toBe(true)
  expect(result.current.isVideoReady).toBe(true)
  expect(video.srcObject).toBe(retry.stream)
  expect(retry.track.stop).not.toHaveBeenCalled()
})

it("cancels readiness timers when enrollment unmounts", async () => {
  const { result, track, unmount } = setup(0)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  await act(async () => {
    unmount()
    await pending
  })
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it("stops readiness polling immediately and permits a fresh start", async () => {
  const { result, video, track, getUserMedia } = setup(0)
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.startCamera()
  })
  await act(async () => {
    result.current.stopCamera()
    await pending
  })
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
  Object.defineProperty(video, "videoWidth", { value: 640 })
  Object.defineProperty(video, "videoHeight", { value: 480 })
  getUserMedia.mockResolvedValueOnce(makeStream().stream)
  await act(async () => {
    await result.current.startCamera()
  })
  expect(result.current.isVideoReady).toBe(true)
})

it("cleans up a rejected preview play and allows retry", async () => {
  const { result, video, track, getUserMedia } = setup()
  vi.mocked(video.play).mockRejectedValueOnce(new Error("Playback failed"))
  await act(async () => {
    await result.current.startCamera()
  })
  expect(result.current.cameraError).toContain("Unable to access camera")
  expect(result.current.isStreaming).toBe(false)
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
  getUserMedia.mockResolvedValueOnce(makeStream().stream)
  await act(async () => {
    await result.current.startCamera()
  })
  expect(result.current.isVideoReady).toBe(true)
})

it("preserves the disconnect error, allows retry, and clears it on explicit stop", async () => {
  const { result, video, track, getUserMedia } = setup()
  await act(async () => {
    await result.current.startCamera()
  })
  act(() => track.onended?.())
  expect(result.current.isStreaming).toBe(false)
  expect(result.current.isVideoReady).toBe(false)
  expect(result.current.cameraError).toContain("Active camera disconnected")
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(video.srcObject).toBeNull()
  const retry = makeStream()
  getUserMedia.mockResolvedValueOnce(retry.stream)
  await act(async () => {
    await result.current.startCamera()
  })
  expect(result.current.isVideoReady).toBe(true)
  expect(result.current.cameraError).toBeNull()
  act(() => retry.track.onended?.())
  expect(result.current.cameraError).toContain("Active camera disconnected")
  act(() => result.current.stopCamera())
  expect(result.current.cameraError).toBeNull()
})

it.each([
  ["NotAllowedError", "Camera permission was denied"],
  ["NotReadableError", "Camera is being used by another app"],
])("keeps the actionable %s error", async (name, message) => {
  const { result, getUserMedia } = setup()
  getUserMedia.mockRejectedValueOnce(Object.assign(new Error("Camera failed"), { name }))
  await act(async () => {
    await result.current.startCamera()
  })
  expect(result.current.cameraError).toContain(message)
  expect(result.current.isStreaming).toBe(false)
  expect(result.current.isVideoReady).toBe(false)
})

it("does not acquire a stream when the preview is no longer mounted", async () => {
  const { result, getUserMedia } = setup()
  result.current.videoRef.current = null
  await act(async () => {
    await result.current.startCamera()
  })
  expect(getUserMedia).not.toHaveBeenCalled()
  expect(result.current.isStreaming).toBe(false)
})
