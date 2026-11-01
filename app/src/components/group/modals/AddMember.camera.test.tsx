import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AddMember } from "./AddMember"
import { attendanceManager, backendService } from "@/services"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures"

vi.mock("@/services", () => ({
  attendanceManager: { addMember: vi.fn(), enrollFaceForGroupPerson: vi.fn() },
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

const faceDetectionResult = {
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
} as Awaited<ReturnType<typeof backendService.detectFaces>>

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
  vi.mocked(backendService.detectFaces).mockResolvedValue(faceDetectionResult)
  vi.mocked(attendanceManager.addMember).mockResolvedValue(
    createAttendanceMember({ name: "Alice" }),
  )
  vi.mocked(attendanceManager.enrollFaceForGroupPerson).mockResolvedValue({ success: true })
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

it("keeps the same camera while typing and resumes a paused preview without reconnecting", async () => {
  const { container, getUserMedia, track, stream } = setup()
  fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
  await advance()
  const video = container.querySelector("video")!
  for (const name of ["A", "Al", "Alice"]) {
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: name } })
    fireEvent.change(screen.getByPlaceholderText("Role (optional)"), {
      target: { value: "Member" },
    })
    await advance(2000)
    expect(container.querySelector("video")).toBe(video)
    expect(screen.queryByText("Connecting camera…")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled()
  }
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  expect(track.stop).not.toHaveBeenCalled()
  let paused = true
  let resume!: () => void
  const playback = new Promise<void>((resolve) => {
    resume = resolve
  })
  vi.spyOn(video, "paused", "get").mockImplementation(() => paused)
  vi.spyOn(video, "play").mockImplementation(() =>
    playback.then(() => {
      paused = false
    }),
  )
  act(() => video.dispatchEvent(new Event("pause")))
  await advance()
  expect(screen.getByText("Resuming camera…")).toBeVisible()
  expect(screen.queryByText("Connecting camera…")).not.toBeInTheDocument()
  await act(async () => resume())
  await advance()
  expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled()
  expect(screen.queryByText("Resuming camera…")).not.toBeInTheDocument()
  expect(video.srcObject).toBe(stream)
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  expect(track.stop).not.toHaveBeenCalled()
})

it("waits for the animated preview, stays stopped after capture, and restarts on Retake", async () => {
  const { getUserMedia, track } = setup()
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Alice" } })
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
  expect(screen.getByRole("button", { name: "Add member & enroll face" })).toBeEnabled()
  expect(attendanceManager.addMember).not.toHaveBeenCalled()
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  expect(track.stop).toHaveBeenCalledTimes(1)
  expect(console.error).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Retake" }))
  await advance()
  expect(getUserMedia).toHaveBeenCalledTimes(2)
  expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled()
  expect(screen.getByRole("button", { name: "Add member" })).toBeDisabled()
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

it("requires a photo or an explicit skip in both camera and upload modes, including Enter submission", async () => {
  const { props } = setup()
  const name = screen.getByPlaceholderText("Name")
  fireEvent.change(name, { target: { value: "Alice" } })
  expect(screen.getByRole("button", { name: "Add member" })).toBeEnabled()
  fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
  await advance()
  expect(screen.getByRole("button", { name: "Capture photo" })).toBeEnabled()
  expect(screen.queryByText("Capture photo")).not.toBeInTheDocument()
  for (const mode of ["Camera", "Upload"]) {
    if (mode === "Upload") {
      fireEvent.click(screen.getByRole("button", { name: "Upload" }))
      await advance()
    }
    const submit = screen.getByRole("button", { name: "Add member" })
    expect(submit).toBeDisabled()
    expect(document.getElementById(submit.getAttribute("aria-describedby")!)).toHaveTextContent(
      "Capture or upload a photo",
    )
    fireEvent.click(submit)
    fireEvent.keyDown(name, { key: "Enter" })
    fireEvent.keyDown(screen.getByPlaceholderText("Role (optional)"), { key: "Enter" })
    await advance()
    expect(attendanceManager.addMember).not.toHaveBeenCalled()
  }
  fireEvent.click(screen.getByRole("button", { name: "Skip face enrollment" }))
  await advance()
  expect(screen.getByRole("button", { name: "Add member" })).toBeEnabled()
  fireEvent.click(screen.getByRole("button", { name: "Add member" }))
  await advance()
  expect(attendanceManager.addMember).toHaveBeenCalledTimes(1)
  expect(attendanceManager.enrollFaceForGroupPerson).not.toHaveBeenCalled()
  expect(props.onSuccess).toHaveBeenCalledTimes(1)
})

it("blocks processing submissions and adds the captured face only on Add member & enroll face", async () => {
  setup()
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Alice" } })
  fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
  await advance()
  let resolve!: (value: typeof faceDetectionResult) => void
  vi.mocked(backendService.detectFaces).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  fireEvent.click(screen.getByRole("button", { name: "Capture photo" }))
  expect(screen.getByRole("button", { name: "Add member" })).toBeDisabled()
  expect(screen.getByText("Checking your photo before enrollment.")).toBeVisible()
  fireEvent.keyDown(screen.getByPlaceholderText("Name"), { key: "Enter" })
  await advance()
  expect(attendanceManager.addMember).not.toHaveBeenCalled()
  await act(async () => resolve(faceDetectionResult))
  await advance()
  expect(screen.getByRole("button", { name: "Add member & enroll face" })).toBeEnabled()
  expect(attendanceManager.addMember).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Add member & enroll face" }))
  await advance()
  expect(attendanceManager.addMember).toHaveBeenCalledTimes(1)
  expect(attendanceManager.enrollFaceForGroupPerson).toHaveBeenCalledTimes(1)
  expect(vi.mocked(attendanceManager.enrollFaceForGroupPerson).mock.calls[0].slice(2)).toEqual([
    "data:image/jpeg;base64,YQ==",
    faceDetectionResult.faces[0].bbox,
    faceDetectionResult.faces[0].landmarks_5,
  ])
})

it.each(["camera", "upload"])(
  "ignores a late %s photo result after Skip face enrollment",
  async (mode) => {
    const { container } = setup()
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Alice" } })
    fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
    await advance()
    let resolve!: (value: typeof faceDetectionResult) => void
    vi.mocked(backendService.detectFaces).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    if (mode === "camera") fireEvent.click(screen.getByRole("button", { name: "Capture photo" }))
    else {
      fireEvent.click(screen.getByRole("button", { name: "Upload" }))
      await advance()
      vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
        this: FileReader,
      ) {
        Object.defineProperty(this, "result", { value: "data:image/jpeg;base64,YQ==" })
        this.dispatchEvent(new ProgressEvent("load"))
      })
      fireEvent.change(container.querySelector('input[type="file"]')!, {
        target: { files: [new File(["a"], "photo.jpg", { type: "image/jpeg" })] },
      })
      await act(async () => {})
    }
    expect(backendService.detectFaces).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Add member" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Skip face enrollment" }))
    await advance()
    expect(screen.getByRole("button", { name: "Add member" })).toBeEnabled()
    await act(async () => resolve(faceDetectionResult))
    await advance()
    expect(screen.queryByText("Photo ready")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add member" })).toBeEnabled()
    expect(attendanceManager.enrollFaceForGroupPerson).not.toHaveBeenCalled()
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
