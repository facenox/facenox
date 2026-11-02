import type { HTMLAttributes, ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AddMember } from "./AddMember"
import { attendanceManager, backendService } from "@/services"
import { createAttendanceGroup, createAttendanceMember } from "@/test/fixtures"
import { useGroupStore } from "@/components/group/stores"

const animation = vi.hoisted(() => ({ holdPreviewMount: false }))

// Motion captures requestAnimationFrame at module initialization, before this
// suite installs fake timers. Keep these lifecycle tests off that real clock.
// The gate below still exercises a preview mounted after enrollment opens.
vi.mock("framer-motion", async () => {
  const { forwardRef, isValidElement } = await import("react")
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) =>
      animation.holdPreviewMount && isValidElement(children) && children.key === "expanded" ?
        null
      : children,
    motion: {
      div: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & Record<string, unknown>>(
        function MotionDiv({ children, ...props }, ref) {
          for (const key of ["initial", "animate", "exit", "transition", "layout", "layoutId"]) {
            delete props[key]
          }
          return (
            <div {...props} ref={ref}>
              {children}
            </div>
          )
        },
      ),
    },
  }
})

vi.mock("@/services", () => ({
  attendanceManager: {
    addMember: vi.fn(),
    addMembersBulk: vi.fn(),
    enrollFaceForGroupPerson: vi.fn(),
  },
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
  animation.holdPreviewMount = false
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
    createAttendanceMember({ name: "Alice", has_face_data: false }),
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

async function setupBulk(text: string) {
  const view = setup()
  fireEvent.click(screen.getByRole("button", { name: "Multiple" }))
  await advance()
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } })
  return view
}

type ImportRow = Parameters<typeof attendanceManager.addMembersBulk>[0][number]
function bulkSuccess(rows: ImportRow[]) {
  return {
    success_count: rows.length,
    error_count: 0,
    errors: [],
    members: rows.map((row) =>
      createAttendanceMember({
        id: row.creationId!,
        person_id: row.creationId!,
        name: row.name,
        role: row.role,
        has_face_data: false,
      }),
    ),
    results: rows.map((row) => ({
      creation_id: row.creationId!,
      person_id: row.creationId!,
      success: true,
    })),
  }
}

it.each(["validation failure", "lost response"])(
  "retries only the remaining row after a second-chunk %s",
  async (failure) => {
    const names = Array.from({ length: 500 }, (_, index) => `Bulk ${index}`)
    const last = failure === "validation failure" ? "x".repeat(101) : "Last member"
    const { props } = await setupBulk([...names, last].join("\n"))
    const saved = new Map<string, ImportRow>()
    let calls = 0
    vi.mocked(attendanceManager.addMembersBulk).mockImplementation(async (rows) => {
      calls++
      if (calls === 2 && failure === "validation failure")
        throw new Error("Name exceeds 100 characters")
      for (const row of rows) saved.set(row.creationId!, row)
      if (calls === 2) throw new Error("Response lost after commit")
      return bulkSuccess(rows)
    })
    fireEvent.click(screen.getByRole("button", { name: "Add members" }))
    await advance()
    expect(screen.getByRole("textbox")).toHaveValue(`${last}\t`)
    expect(screen.getByRole("status")).toHaveTextContent("500 already added")
    expect(props.onClose).not.toHaveBeenCalled()
    const firstCalls = vi.mocked(attendanceManager.addMembersBulk).mock.calls
    const lastKey = firstCalls[1][0][0].creationId
    if (failure === "validation failure")
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Corrected member" } })
    fireEvent.click(screen.getByRole("button", { name: "Retry remaining entries" }))
    await advance()
    const requests = vi.mocked(attendanceManager.addMembersBulk).mock.calls.map((call) => call[0])
    expect(requests.map((rows) => rows.length)).toEqual([500, 1, 1])
    expect(requests[2][0].creationId).toBe(lastKey)
    expect(saved.size).toBe(501)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  },
)

it("keeps only failed rows after a partially successful batch", async () => {
  const { props } = await setupBulk("Alice\nBob\nCarol")
  let failedRow: ImportRow | undefined
  vi.mocked(attendanceManager.addMembersBulk)
    .mockImplementationOnce(async (rows) => {
      failedRow = rows[1]
      const success = bulkSuccess([rows[0], rows[2]])
      return {
        ...success,
        error_count: 1,
        errors: [{ person_id: "unknown", error: "Bob failed" }],
        results: rows.map((row, index) => ({ creation_id: row.creationId!, success: index !== 1 })),
      }
    })
    .mockImplementationOnce(async (rows) => bulkSuccess(rows))
  fireEvent.click(screen.getByRole("button", { name: "Add members" }))
  await advance()
  expect(screen.getByRole("textbox")).toHaveValue("Bob\t")
  fireEvent.click(screen.getByRole("button", { name: "Retry remaining entries" }))
  await advance()
  expect(vi.mocked(attendanceManager.addMembersBulk).mock.calls[1][0]).toEqual([failedRow])
  expect(props.onClose).toHaveBeenCalledTimes(1)
})

it("does not resend completed rows when the corrected original CSV is reimported", async () => {
  const { container, props } = await setupBulk("Alice\nBob")
  vi.mocked(attendanceManager.addMembersBulk)
    .mockImplementationOnce(async (rows) => ({
      ...bulkSuccess([rows[0]]),
      error_count: 1,
      errors: [{ person_id: "unknown", error: "Bob failed" }],
      results: rows.map((row, index) => ({ creation_id: row.creationId!, success: index === 0 })),
    }))
    .mockImplementationOnce(async (rows) => bulkSuccess(rows))
  fireEvent.click(screen.getByRole("button", { name: "Add members" }))
  await advance()
  expect(screen.getByText("Reimport original CSV or TXT")).toBeVisible()
  const file = new File([], "corrected.csv", { type: "text/csv" })
  Object.defineProperty(file, "text", { value: async () => "Name,Role\nAlice,\nCorrected Bob," })
  await act(async () => {
    fireEvent.change(container.querySelector('input[accept=".txt,.csv"]')!, {
      target: { files: [file] },
    })
  })
  fireEvent.click(screen.getByRole("button", { name: "Retry remaining entries" }))
  await advance()
  const calls = vi.mocked(attendanceManager.addMembersBulk).mock.calls
  expect(calls[1][0]).toHaveLength(1)
  expect(calls[1][0][0].name).toBe("Corrected Bob")
  expect(calls[1][0][0].creationId).toBe(calls[0][0][1].creationId)
  expect(props.onClose).toHaveBeenCalledTimes(1)
})

it("preserves the remaining rows and their retry tokens when switching tabs", async () => {
  await setupBulk("Alice\nBob")
  vi.mocked(attendanceManager.addMembersBulk)
    .mockImplementationOnce(async (rows) => ({
      ...bulkSuccess([rows[0]]),
      error_count: 1,
      errors: [],
      results: rows.map((row, index) => ({ creation_id: row.creationId!, success: index === 0 })),
    }))
    .mockImplementationOnce(async (rows) => bulkSuccess(rows))
  fireEvent.click(screen.getByRole("button", { name: "Add members" }))
  await advance()
  fireEvent.click(screen.getByRole("button", { name: "Single" }))
  await advance()
  fireEvent.click(screen.getByRole("button", { name: "Multiple" }))
  await advance()
  expect(screen.getByRole("textbox")).toHaveValue("Bob\t")
  fireEvent.click(screen.getByRole("button", { name: "Retry remaining entries" }))
  await advance()
  const calls = vi.mocked(attendanceManager.addMembersBulk).mock.calls
  expect(calls[1][0]).toEqual([calls[0][0][1]])
})

it("allows a remaining row to be corrected to the same name as an already-added member", async () => {
  await setupBulk("Alice\nBob")
  vi.mocked(attendanceManager.addMembersBulk)
    .mockImplementationOnce(async (rows) => ({
      ...bulkSuccess([rows[0]]),
      error_count: 1,
      errors: [],
      results: rows.map((row, index) => ({ creation_id: row.creationId!, success: index === 0 })),
    }))
    .mockImplementationOnce(async (rows) => bulkSuccess(rows))
  fireEvent.click(screen.getByRole("button", { name: "Add members" }))
  await advance()
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Alice" } })
  fireEvent.click(screen.getByRole("button", { name: "Retry remaining entries" }))
  await advance()
  const calls = vi.mocked(attendanceManager.addMembersBulk).mock.calls
  expect(calls[1][0]).toHaveLength(1)
  expect(calls[1][0][0].name).toBe("Alice")
  expect(calls[1][0][0].creationId).toBe(calls[0][0][1].creationId)
})

async function prepareFace() {
  const view = setup()
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Alice" } })
  fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
  await advance()
  fireEvent.click(screen.getByRole("button", { name: "Capture photo" }))
  await advance()
  return view
}

it.each(["failure response", "exception"])(
  "preserves the saved member after an enrollment %s and retries only the face",
  async (failure) => {
    const { props, rerender } = await prepareFace()
    if (failure === "exception")
      vi.mocked(attendanceManager.enrollFaceForGroupPerson).mockRejectedValueOnce(
        new Error("Storage unavailable"),
      )
    else
      vi.mocked(attendanceManager.enrollFaceForGroupPerson).mockResolvedValueOnce({
        success: false,
        error: "Storage unavailable",
      })
    fireEvent.click(screen.getByRole("button", { name: "Add member & enroll face" }))
    await advance()
    expect(screen.getByRole("alert")).toHaveTextContent("Member added, but face enrollment failed")
    expect(screen.getByRole("alert")).toHaveTextContent("Storage unavailable")
    expect(screen.getByText("Photo ready")).toBeVisible()
    expect(screen.getByPlaceholderText("Name")).toBeDisabled()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onSuccess).toHaveBeenCalledTimes(1)
    const member = await vi.mocked(attendanceManager.addMember).mock.results[0].value
    rerender(<AddMember {...props} existingMembers={[member]} />)
    fireEvent.click(screen.getByRole("button", { name: "Retry face enrollment" }))
    await advance()
    expect(attendanceManager.addMember).toHaveBeenCalledTimes(1)
    expect(attendanceManager.enrollFaceForGroupPerson).toHaveBeenCalledTimes(2)
    const calls = vi.mocked(attendanceManager.enrollFaceForGroupPerson).mock.calls
    expect(calls[0][1]).toBe(calls[1][1])
    const cached = useGroupStore.getState().members.filter((item) => item.id === member.id)
    expect(cached).toHaveLength(1)
    expect(cached[0].has_face_data).toBe(true)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  },
)

it.each(["finish", "remove and done"])(
  "can %s after a partial save without creating another member",
  async (action) => {
    const { props } = await prepareFace()
    vi.mocked(attendanceManager.enrollFaceForGroupPerson).mockResolvedValueOnce({
      success: false,
      error: "Failed",
    })
    fireEvent.click(screen.getByRole("button", { name: "Add member & enroll face" }))
    await advance()
    if (action === "finish")
      fireEvent.click(screen.getByRole("button", { name: "Finish without face" }))
    else {
      fireEvent.click(screen.getByRole("button", { name: "Remove" }))
      await advance()
      fireEvent.click(screen.getByRole("button", { name: "Done" }))
    }
    await advance()
    expect(attendanceManager.addMember).toHaveBeenCalledTimes(1)
    expect(attendanceManager.enrollFaceForGroupPerson).toHaveBeenCalledTimes(1)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  },
)

it("reuses the creation token when retrying an unresolved creation request", async () => {
  await prepareFace()
  vi.mocked(attendanceManager.addMember).mockRejectedValueOnce(new Error("Response lost"))
  fireEvent.click(screen.getByRole("button", { name: "Add member & enroll face" }))
  await advance()
  expect(screen.getByRole("alert")).toHaveTextContent("Response lost")
  fireEvent.click(screen.getByRole("button", { name: "Add member & enroll face" }))
  await advance()
  const calls = vi.mocked(attendanceManager.addMember).mock.calls
  expect(calls).toHaveLength(2)
  expect(calls[0][2]?.creationId).toEqual(expect.any(String))
  expect(calls[0][2]?.creationId).toBe(calls[1][2]?.creationId)
  expect(attendanceManager.enrollFaceForGroupPerson).toHaveBeenCalledTimes(1)
})

it.each(["success", "failure"])(
  "ignores an old creation %s without clearing or unlocking a new save",
  async (outcome) => {
    const { props, rerender } = setup()
    let resolveOld!: (value: ReturnType<typeof createAttendanceMember>) => void
    let rejectOld!: (error: Error) => void
    let resolveNew!: (value: ReturnType<typeof createAttendanceMember>) => void
    vi.mocked(attendanceManager.addMember)
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveOld = resolve
            rejectOld = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve
          }),
      )
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Alice" } })
    fireEvent.click(screen.getByRole("button", { name: "Add member" }))
    await advance()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    rerender(<AddMember {...props} isOpen={false} />)
    rerender(<AddMember {...props} />)
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Bob" } })
    fireEvent.click(screen.getByRole("button", { name: "Add member" }))
    await advance()
    await act(async () => {
      if (outcome === "success") resolveOld(createAttendanceMember({ name: "Alice" }))
      else rejectOld(new Error("Old failure"))
    })
    await advance()
    expect(screen.getByPlaceholderText("Name")).toHaveValue("Bob")
    expect(screen.getByRole("button", { name: "Processing…" })).toBeDisabled()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onSuccess).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByPlaceholderText("Name"), { key: "Enter" })
    expect(attendanceManager.addMember).toHaveBeenCalledTimes(2)
    await act(async () =>
      resolveNew(createAttendanceMember({ id: "bob", person_id: "bob", name: "Bob" })),
    )
    await advance()
    expect(props.onClose).toHaveBeenCalledTimes(2)
    expect(props.onSuccess).toHaveBeenCalledTimes(1)
  },
)

it("ignores a late face-enrollment result after closing and reopening", async () => {
  const { props, rerender } = await prepareFace()
  let resolve!: (value: { success: boolean }) => void
  vi.mocked(attendanceManager.enrollFaceForGroupPerson).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  fireEvent.click(screen.getByRole("button", { name: "Add member & enroll face" }))
  await advance()
  rerender(<AddMember {...props} isOpen={false} />)
  rerender(<AddMember {...props} />)
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Bob" } })
  await act(async () => resolve({ success: true }))
  await advance()
  expect(screen.getByPlaceholderText("Name")).toHaveValue("Bob")
  expect(screen.getByRole("button", { name: "Add member" })).toBeEnabled()
  expect(props.onClose).not.toHaveBeenCalled()
  expect(props.onSuccess).not.toHaveBeenCalled()
})

it("ignores old bulk-save completion after reopening a single-member form", async () => {
  const { props, rerender } = setup()
  let resolve!: (value: Awaited<ReturnType<typeof attendanceManager.addMembersBulk>>) => void
  vi.mocked(attendanceManager.addMembersBulk).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  fireEvent.click(screen.getByRole("button", { name: "Multiple" }))
  await advance()
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Alice" } })
  fireEvent.click(screen.getByRole("button", { name: "Add members" }))
  await advance()
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  rerender(<AddMember {...props} isOpen={false} />)
  rerender(<AddMember {...props} />)
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Bob" } })
  await act(async () =>
    resolve({ success_count: 1, error_count: 0, errors: [], members: [createAttendanceMember()] }),
  )
  await advance()
  expect(screen.getByPlaceholderText("Name")).toHaveValue("Bob")
  expect(screen.getByRole("button", { name: "Add member" })).toBeEnabled()
  expect(props.onClose).toHaveBeenCalledTimes(1)
})

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

it("waits for a delayed preview mount, stays stopped after capture, and restarts on Retake", async () => {
  animation.holdPreviewMount = true
  const { getUserMedia, track, container, props, rerender } = setup()
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Alice" } })
  await advance()
  expect(getUserMedia).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
  await advance()
  expect(container.querySelector("video")).toBeNull()
  expect(getUserMedia).not.toHaveBeenCalled()
  expect(console.error).not.toHaveBeenCalled()
  animation.holdPreviewMount = false
  rerender(<AddMember {...props} />)
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

it("does not request a camera when the modal closes before the delayed preview mounts", async () => {
  animation.holdPreviewMount = true
  const { getUserMedia, props, rerender } = setup()
  fireEvent.click(screen.getByRole("button", { name: "+ Enroll now" }))
  await advance()
  expect(getUserMedia).not.toHaveBeenCalled()
  rerender(<AddMember {...props} isOpen={false} />)
  animation.holdPreviewMount = false
  rerender(<AddMember {...props} isOpen={false} />)
  await advance(5000)
  expect(getUserMedia).not.toHaveBeenCalled()
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
