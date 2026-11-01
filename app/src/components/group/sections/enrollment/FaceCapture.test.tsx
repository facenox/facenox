import type { HTMLAttributes, ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { CapturedFrame } from "./types"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures"
import { FaceCapture } from "./FaceCapture"

const mocks = vi.hoisted(() => ({
  groupUI: { preSelectedMemberId: "member-1", resetEnrollment: vi.fn() },
  ui: { enrollmentInfoDismissed: true, setEnrollmentInfoDismissed: vi.fn() },
  capture: {
    frames: [] as CapturedFrame[],
    isEnrolling: false,
    successMessage: null,
    globalError: null,
    setSuccessMessage: vi.fn(),
    setGlobalError: vi.fn(),
    captureProcessedFrame: vi.fn(),
    handleEnroll: vi.fn(),
    resetFrames: vi.fn(),
  },
}))

vi.mock("@/services", () => ({
  persistentSettings: {
    getUIState: vi.fn(async () => ({})),
    setUIState: vi.fn(async () => {}),
  },
}))
vi.mock("@/components/group/stores", () => ({
  useGroupUIStore: (selector: (state: typeof mocks.groupUI) => unknown) => selector(mocks.groupUI),
}))
vi.mock("@/components/main/stores", () => ({
  useUIStore: (selector: (state: typeof mocks.ui) => unknown) => selector(mocks.ui),
}))
vi.mock("@/components/group/sections/enrollment/hooks/useFaceCapture", () => ({
  useFaceCapture: () => mocks.capture,
}))
vi.mock("@/components/shared", async () => ({
  Tooltip: (await import("@/components/shared/Tooltip")).Tooltip,
  useDialog: () => ({}),
  Dropdown: () => null,
}))
vi.mock("@/components/common", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? children : null,
}))
vi.mock("@/components/group/sections/enrollment/components/EnrollmentInfoModal", () => ({
  EnrollmentInfoModal: () => null,
}))
vi.mock("@/components/group/sections/enrollment/components/UploadArea", () => ({
  UploadArea: () => <div>Upload a photo</div>,
}))
vi.mock("@/components/group/sections/enrollment/components/ResultView", () => ({
  ResultView: () => <div>Photo ready</div>,
}))
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ children, className, role }: HTMLAttributes<HTMLDivElement>) => (
      <div className={className} role={role}>
        {children}
      </div>
    ),
  },
}))

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
    group: createAttendanceGroup(),
    members: [createAttendanceMember({ person_id: "member-1", name: "Alice" })],
    onRefresh: vi.fn(),
  }
  const view = render(<FaceCapture {...props} />)
  const video = view.container.querySelector("video")!
  Object.defineProperties(video, {
    videoWidth: { configurable: true, value: 640 },
    videoHeight: { configurable: true, value: 480 },
    paused: { configurable: true, value: false },
  })
  video.play = vi.fn(async () => {})
  video.pause = vi.fn()
  video.srcObject = null
  return { ...view, props, video, track, stream, getUserMedia }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  mocks.capture.frames = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it.each(["permission", "disconnect"])(
  "keeps a %s error visible until the operator retries",
  async (failure) => {
    const { getUserMedia, track } = setup()
    if (failure === "permission") {
      getUserMedia.mockRejectedValueOnce(
        Object.assign(new Error("Denied"), { name: "NotAllowedError" }),
      )
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    if (failure === "disconnect") act(() => track.onended?.())
    expect(screen.getByRole("alert")).toHaveTextContent(
      failure === "permission" ? "Camera permission was denied" : "Active camera disconnected",
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Retry camera" })).toBeVisible()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry camera" }))
    })
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled()
  },
)

it.each(["upload", "deselect"])(
  "cancels an in-flight start on %s without attaching a late stream",
  async (action) => {
    const { getUserMedia, stream, track, video } = setup()
    let resolve!: (stream: MediaStream) => void
    getUserMedia.mockReturnValueOnce(
      new Promise<MediaStream>((release) => {
        resolve = release
      }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    if (action === "upload")
      fireEvent.click(screen.getByRole("button", { name: "Switch to file upload" }))
    else fireEvent.keyDown(window, { key: "Escape" })
    await act(async () => {
      resolve(stream)
    })
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(video.srcObject).toBeNull()
    expect(video.play).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(
      screen.getByText(
        action === "upload" ? "Upload a photo" : "Select a member to begin enrollment",
      ),
    ).toBeVisible()
  },
)

it("releases the camera when the captured photo replaces its preview", async () => {
  const { getUserMedia, track, video, props, rerender } = setup()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled()
  mocks.capture.frames = [
    {
      id: "photo-1",
      dataUrl: "data:image/jpeg;base64,photo",
      width: 640,
      height: 480,
      status: "ready",
    },
  ]
  rerender(<FaceCapture {...props} />)
  expect(screen.getByText("Photo ready")).toBeVisible()
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(video).not.toBeInTheDocument()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000)
  })
  expect(getUserMedia).toHaveBeenCalledTimes(1)
})
