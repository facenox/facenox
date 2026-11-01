import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AddMember } from "./AddMember"
import { backendService } from "@/services"
import { createAttendanceGroup } from "@/test/fixtures"

vi.mock("@/services", () => ({
  attendanceManager: {},
  backendService: { detectFaces: vi.fn() },
  persistentSettings: {
    getUIState: vi.fn(async () => ({})),
    setUIState: vi.fn(async () => {}),
  },
}))
vi.mock("@/components/shared", async () => ({
  Tooltip: (await import("@/components/shared/Tooltip")).Tooltip,
  InfoPopover: () => null,
}))
vi.mock("@/components/common", async () => {
  const { forwardRef } = await import("react")
  return {
    Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? children : null,
    FormInput: forwardRef<
      HTMLInputElement,
      React.InputHTMLAttributes<HTMLInputElement> & { focusColor?: string }
    >(({ focusColor, ...props }, ref) => (
      <input {...props} data-focus-color={focusColor} ref={ref} />
    )),
    Spinner: () => <span>Loading</span>,
    ErrorMessage: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,YQ==")
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(640)
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(480)
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockReturnValue(false)
  vi.mocked(backendService.detectFaces).mockResolvedValue({
    faces: [
      {
        bbox: [0, 0, 100, 100],
        landmarks_5: [
          [1, 1],
          [2, 2],
          [3, 3],
          [4, 4],
          [5, 5],
        ],
        confidence: 1,
      },
    ],
  } as Awaited<ReturnType<typeof backendService.detectFaces>>)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function advance(ms = 1000) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(100, ms - elapsed))
    })
  }
}

function setup() {
  const track = { onended: null as (() => void) | null, stop: vi.fn() }
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream
  const getUserMedia = vi.fn(async () => stream)
  vi.stubGlobal("navigator", {
    mediaDevices: {
      enumerateDevices: async () => [{ deviceId: "camera-1", kind: "videoinput" }],
      getUserMedia,
    },
  })
  const props = {
    isOpen: true,
    group: createAttendanceGroup(),
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }
  const view = render(<AddMember {...props} />)
  return { ...view, props, track, stream, getUserMedia }
}

it("waits for the animated preview, stays stopped after capture, and restarts on Retake", async () => {
  const { getUserMedia, track } = setup()
  await advance()
  expect(getUserMedia).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
  await advance()
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Capture photo" }))
  })
  await advance(5000)
  expect(screen.getByText("Photo ready")).toBeVisible()
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(console.error).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Retake" }))
  await advance()
  expect(getUserMedia).toHaveBeenCalledTimes(2)
  expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled()
  expect(console.error).not.toHaveBeenCalled()
})

it.each(["permission", "disconnect"])(
  "does not retry a %s error until Retry camera is clicked",
  async (failure) => {
    const { getUserMedia, track } = setup()
    if (failure === "permission")
      getUserMedia.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { name: "NotAllowedError" }),
      )
    fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
    await advance()
    if (failure === "disconnect") act(() => track.onended?.())
    await advance(5000)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("alert")).toHaveTextContent(
      failure === "permission" ? "Camera permission was denied" : "Active camera disconnected",
    )
    fireEvent.click(screen.getByRole("button", { name: "Retry camera" }))
    await advance()
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled()
  },
)

it.each(["upload", "bulk", "close"])(
  "cancels a pending camera when switching to %s",
  async (action) => {
    const { getUserMedia, stream, track, rerender, props } = setup()
    let resolve!: (stream: MediaStream) => void
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((done) => {
          resolve = done
        }),
    )
    fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
    await advance()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    if (action === "upload") fireEvent.click(screen.getByRole("button", { name: "Upload" }))
    else if (action === "bulk") fireEvent.click(screen.getByRole("button", { name: "Multiple" }))
    else rerender(<AddMember {...props} isOpen={false} />)
    await advance()
    await act(async () => resolve(stream))
    await advance(5000)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  },
)
