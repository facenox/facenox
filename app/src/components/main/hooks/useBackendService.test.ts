import { act, renderHook, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useBackendService } from "./useBackendService"
import { useAttendanceStore, useCameraStore, useUIStore } from "@/components/main/stores"
import { WebSocketService } from "@/services/WebSocketService"

const { getDeviceId } = vi.hoisted(() => ({ getDeviceId: vi.fn() }))

vi.mock("@/services", () => ({ persistentSettings: { get: getDeviceId } }))
vi.mock("@/services/localBackendScope", () => ({ appendOrganizationId: vi.fn() }))
vi.mock("@/components/main/hooks/useAttendanceGroups", () => ({ ALL_GROUPS_ID: "all" }))
vi.mock("@/services/SoundEffectsService", () => ({ soundEffects: { play: vi.fn() } }))
vi.mock("@/utils/syncNotifier", () => ({ notifyDataChanged: vi.fn() }))

class MockWebSocket {
  static OPEN = 1
  static instances: MockWebSocket[] = []
  readyState = 0
  binaryType = ""
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: (() => void) | null = null
  send = vi.fn<(data: string | ArrayBuffer) => void>()

  constructor() {
    MockWebSocket.instances.push(this)
  }

  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  close() {
    this.readyState = 3
  }

  configs() {
    return this.send.mock.calls.map(([data]) => JSON.parse(data as string))
  }
}

function createOptions(): Parameters<typeof useBackendService>[0] {
  return {
    webSocketServiceRef: { current: null },
    isStreamingRef: { current: false },
    isScanningRef: { current: false },
    isStartingRef: { current: false },
    currentGroupId: "saved-group",
    maxRecognitionFacesPerFrame: 5,
    performFaceRecognition: vi.fn(async () => {}),
    lastFrameTimestampRef: { current: 0 },
    lastDetectionRef: { current: null },
    skipFramesRef: { current: 0 },
    processCurrentFrameRef: { current: vi.fn(async () => {}) },
    trackingSessionRef: { current: 0 },
    detectionInFlightRef: { current: false },
    stopCamera: { current: null },
    animationFrameRef: { current: undefined },
    streamRef: { current: null },
    videoRef: { current: null },
    backendServiceReadyRef: { current: false },
    loadAttendanceDataRef: { current: vi.fn(async () => {}) },
  }
}

async function openSocket(index = 0) {
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(index + 1))
  const socket = MockWebSocket.instances[index]
  await act(async () => socket.open())
  return socket
}

describe("useBackendService live configuration", () => {
  let options: ReturnType<typeof createOptions>

  beforeEach(() => {
    options = createOptions()
    MockWebSocket.instances = []
    vi.stubGlobal("WebSocket", MockWebSocket)
    getDeviceId.mockReset().mockResolvedValue("test-device")
    useCameraStore.setState({
      websocketStatus: "disconnected",
      isStreaming: false,
      isVideoLoading: false,
      cameraActive: false,
    })
    useAttendanceStore.setState({ enableSpoofDetection: false })
    useUIStore.setState({ error: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends the saved group on a production-style mount without StrictMode", async () => {
    renderHook(() => useBackendService(options))
    const socket = await openSocket()

    expect(socket.configs()).toContainEqual({
      type: "config",
      group_id: "saved-group",
      enable_liveness_detection: false,
      max_recognition_faces_per_frame: 5,
      device_id: "test-device",
    })
    expect(socket.configs().every((config) => !("scan_behavior" in config))).toBe(true)
  })

  it("configures recognition before a slow device ID lookup finishes", async () => {
    let resolveDeviceId!: (value: string) => void
    getDeviceId.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveDeviceId = resolve
      }),
    )
    renderHook(() => useBackendService(options))
    const socket = await openSocket()

    expect(socket.configs()[0]).toMatchObject({
      group_id: "saved-group",
      enable_liveness_detection: false,
    })
    await act(async () => resolveDeviceId("late-device"))
    expect(socket.configs().at(-1)).toMatchObject({
      group_id: "saved-group",
      device_id: "late-device",
    })
  })

  it("keeps scanning configured when the device ID lookup fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    getDeviceId.mockRejectedValue(new Error("Settings unavailable"))
    renderHook(() => useBackendService(options))
    const socket = await openSocket()

    expect(socket.configs()[0]).toMatchObject({ group_id: "saved-group" })
    expect(useUIStore.getState().error).toBeNull()
  })

  it("updates groups and ignores a device ID lookup from an earlier group", async () => {
    let resolveOldDeviceId!: (value: string) => void
    getDeviceId.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveOldDeviceId = resolve
      }),
    )
    const { rerender } = renderHook(
      ({ groupId }) => useBackendService({ ...options, currentGroupId: groupId }),
      {
        initialProps: { groupId: "saved-group" },
      },
    )
    const socket = await openSocket()
    rerender({ groupId: "all" })
    await waitFor(() =>
      expect(socket.configs().at(-1)).toMatchObject({ group_id: "all", device_id: "test-device" }),
    )
    const configCount = socket.send.mock.calls.length
    await act(async () => resolveOldDeviceId("stale-device"))

    expect(socket.send).toHaveBeenCalledTimes(configCount)
    expect(socket.configs().at(-1)).toMatchObject({ group_id: "all", device_id: "test-device" })
  })

  it("retains the selected group when reconnecting the same service", async () => {
    const { result } = renderHook(() => useBackendService(options))
    const first = await openSocket()
    await act(async () => {
      first.readyState = 3
      first.onclose?.({ code: 1006, reason: "" } as CloseEvent)
    })
    let reconnect!: Promise<void>
    act(() => {
      reconnect = result.current.initializeWebSocket()
    })
    const second = await openSocket(1)
    await act(async () => reconnect)

    expect(second.configs()[0]).toMatchObject({ group_id: "saved-group" })
  })

  it("also configures correctly with development StrictMode", async () => {
    renderHook(() => useBackendService(options), { wrapper: StrictMode })
    const socket = await openSocket()
    expect(socket.configs()[0]).toMatchObject({ group_id: "saved-group" })
  })

  it("configures an existing WebSocket service", async () => {
    options.webSocketServiceRef.current = new WebSocketService()
    renderHook(() => useBackendService(options))
    const socket = await openSocket()
    expect(socket.configs()[0]).toMatchObject({ group_id: "saved-group" })
  })

  it("dispatches timezone advice and prioritizes actual clock warnings on attendance events", async () => {
    useAttendanceStore.setState({ currentGroup: null })
    const listener = vi.fn()
    window.addEventListener("facenox:clock-warning", listener)
    try {
      renderHook(() => useBackendService(options))
      const socket = await openSocket()
      const health = {
        timezone_mismatch: true,
        device_time_zone_name: "America/Phoenix",
        attendance_time_zone_name: "America/Denver",
        timezone_warning_message: "Different DST rules.",
      }
      const send = (time_health: typeof health & { warning_message?: string }) =>
        act(() => {
          socket.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify({
                type: "attendance_event",
                person_id: "p",
                group_id: "unselected-group",
                time_health,
              }),
            }),
          )
        })
      send(health)
      expect(listener.mock.calls[0][0].detail).toEqual({
        message: "Different DST rules.",
        dedupeKey: "attendance-timezone-mismatch:America/Phoenix:America/Denver",
      })
      send({ ...health, warning_message: "Clock moved backwards." })
      expect(listener.mock.calls[1][0].detail).toEqual({
        message: "Clock moved backwards.",
        dedupeKey: undefined,
      })
    } finally {
      window.removeEventListener("facenox:clock-warning", listener)
    }
  })
})
