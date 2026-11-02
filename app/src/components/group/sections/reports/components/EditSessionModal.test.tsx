import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { EditSessionModal } from "./EditSessionModal"
import { attendanceManager } from "@/services/AttendanceManager"
import { createAttendanceGroup, createAttendanceSession } from "@/test/fixtures"
import type { RowData } from "../types"

vi.mock("@/components/common", () => ({
  Modal: ({ children }: { children: ReactNode }) => <>{children}</>,
  ErrorMessage: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}))
vi.mock("@/services/AttendanceManager", () => ({ attendanceManager: { updateSession: vi.fn() } }))

beforeEach(() => {
  vi.mocked(attendanceManager.updateSession).mockResolvedValue(createAttendanceSession())
})

function setup(overrides: Partial<RowData> = {}, zone = "UTC") {
  const row: RowData = {
    person_id: "p",
    name: "Alice",
    date: "2026-11-01",
    status: "present",
    is_late: false,
    late_minutes: 0,
    check_in_time: new Date("2026-11-01T08:00:00Z"),
    check_out_time: new Date("2026-11-01T17:00:00Z"),
    notes: "",
    session: createAttendanceSession({
      applied_schedule: {
        class_start_time: "08:00",
        class_end_time: "17:00",
        attendance_mode: "work_hours",
      },
    }),
    ...overrides,
  }
  const view = render(
    <EditSessionModal
      isOpen
      row={row}
      group={createAttendanceGroup({
        settings: {
          track_checkout: true,
          attendance_mode: "work_hours",
          late_threshold_enabled: true,
          late_threshold_minutes: 0,
          class_start_time: "08:00",
        },
      })}
      attendanceTimeZone={zone}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  )
  return { row, ...view }
}

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
  await waitFor(() => expect(attendanceManager.updateSession).toHaveBeenCalled())
  return vi.mocked(attendanceManager.updateSession).mock.calls[0][2]
}

it("does not rewrite captured instants or lateness on a notes-only save after timezone changes", async () => {
  setup(
    {
      check_in_time: new Date("2026-11-01T13:00:27Z"),
      check_out_time: new Date("2026-11-01T22:00:48Z"),
      session: createAttendanceSession({
        check_in_time_timezone: "America/New_York",
        check_out_time_timezone: "America/New_York",
      }),
    },
    "Asia/Manila",
  )
  const updates = await save()
  expect(updates).not.toHaveProperty("check_in_time")
  expect(updates).not.toHaveProperty("check_out_time")
  expect(updates).not.toHaveProperty("is_late")
})

it("edits clock-in in its captured timezone instead of the current attendance timezone", async () => {
  const { container } = setup(
    {
      check_in_time: new Date("2026-11-01T13:00:00Z"),
      session: createAttendanceSession({ check_in_time_timezone: "America/New_York" }),
    },
    "Asia/Manila",
  )
  fireEvent.change(container.querySelector('input[type="time"]')!, { target: { value: "09:00" } })
  expect((await save()).check_in_time?.toISOString()).toBe("2026-11-01T14:00:00.000Z")
})

it("uses the captured check-in zone consistently when checkout has no separate zone", async () => {
  const { container } = setup(
    {
      check_in_time: new Date("2026-11-01T13:00:00Z"),
      check_out_time: new Date("2026-11-01T22:00:00Z"),
      session: createAttendanceSession({
        check_in_time_timezone: "America/New_York",
        check_out_time_timezone: undefined,
      }),
    },
    "Asia/Manila",
  )
  expect(container.querySelectorAll('input[type="time"]')[1]).toHaveValue("17:00")
  expect(await save()).not.toHaveProperty("check_out_time")
})

it("preserves an unchanged next-day checkout when reviewing an overnight session", async () => {
  setup({
    check_in_time: new Date("2026-11-01T22:00:00Z"),
    check_out_time: new Date("2026-11-02T06:00:00Z"),
  })
  const updates = await save()
  expect(updates).not.toHaveProperty("check_in_time")
  expect(updates).not.toHaveProperty("check_out_time")
})

it("keeps an edited overnight checkout on its original next day", async () => {
  const { container } = setup({
    check_in_time: new Date("2026-11-01T22:00:00Z"),
    check_out_time: new Date("2026-11-02T06:00:00Z"),
  })
  fireEvent.change(container.querySelectorAll('input[type="time"]')[1], {
    target: { value: "06:30" },
  })
  expect((await save()).check_out_time?.toISOString()).toBe("2026-11-02T06:30:00.000Z")
})

it("infers next-day checkout only for an explicit overnight schedule", async () => {
  const { container } = setup({
    check_in_time: new Date("2026-11-01T22:00:00Z"),
    check_out_time: undefined,
    session: createAttendanceSession({
      applied_schedule: {
        class_start_time: "22:00",
        class_end_time: "06:00",
        attendance_mode: "work_hours",
      },
    }),
  })
  fireEvent.change(container.querySelectorAll('input[type="time"]')[1], {
    target: { value: "06:00" },
  })
  expect((await save()).check_out_time?.toISOString()).toBe("2026-11-02T06:00:00.000Z")
})

it("does not resend stale lateness after correcting a late check-in", async () => {
  const { container } = setup({
    status: "late",
    is_late: true,
    late_minutes: 60,
    check_in_time: new Date("2026-11-01T09:00:00Z"),
  })
  fireEvent.change(container.querySelector('input[type="time"]')!, { target: { value: "08:00" } })
  const updates = await save()
  expect(updates.check_in_time?.toISOString()).toBe("2026-11-01T08:00:00.000Z")
  expect(updates).not.toHaveProperty("is_late")
  expect(updates).not.toHaveProperty("late_minutes")
})

it("allows a notes-only correction on an open work-hours session", async () => {
  setup({ check_out_time: undefined })
  expect(await save()).not.toHaveProperty("check_out_time")
})

it("explicitly clears checkout when the operator removes it", async () => {
  const { container } = setup()
  fireEvent.change(container.querySelectorAll('input[type="time"]')[1], { target: { value: "" } })
  expect((await save()).check_out_time).toBeNull()
})

it("explicitly clears both times when a previously scanned member is marked absent", async () => {
  setup()
  fireEvent.click(screen.getByRole("radio", { name: /absent/i }))
  expect(await save()).toMatchObject({
    status: "absent",
    check_in_time: null,
    check_out_time: null,
  })
})
