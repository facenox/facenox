import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { GroupSettings } from "./GroupSettings"
import { attendanceManager } from "@/services"
import { useGroupStore } from "@/components/group/stores"
import { createAttendanceGroup } from "@/test/fixtures"

vi.mock("@/services", () => ({
  attendanceManager: {
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    getGroupMembers: vi.fn(async () => []),
  },
}))
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  useGroupStore.setState({ selectedGroup: null })
})

const group = createAttendanceGroup({
  settings: {
    late_threshold_enabled: true,
    late_threshold_minutes: 15,
    class_start_time: "08:00",
  },
})

it("serializes rule writes and publishes only the latest edit", async () => {
  let resolveFirst!: (value: boolean) => void, resolveSecond!: (value: boolean) => void
  vi.mocked(attendanceManager.updateGroup)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve
        }),
    )
  useGroupStore.setState({ selectedGroup: group })
  const onGroupsChanged = vi.fn()
  render(<GroupSettings group={group} onGroupsChanged={onGroupsChanged} />)
  fireEvent.click(screen.getByText("Exact"))
  fireEvent.click(screen.getByText("10m"))
  expect(attendanceManager.updateGroup).toHaveBeenCalledTimes(1)
  await act(async () => {
    resolveFirst(true)
  })
  expect(attendanceManager.updateGroup).toHaveBeenCalledTimes(2)
  expect(onGroupsChanged).not.toHaveBeenCalled()
  expect(useGroupStore.getState().selectedGroup?.settings?.late_threshold_minutes).toBe(15)
  await act(async () => {
    resolveSecond(true)
  })
  expect(useGroupStore.getState().selectedGroup?.settings?.late_threshold_minutes).toBe(10)
  expect(onGroupsChanged).toHaveBeenCalledOnce()
})

it.each(["reject", "false"])(
  "restores saved values and shows an error on a %s save",
  async (failure) => {
    if (failure === "reject")
      vi.mocked(attendanceManager.updateGroup).mockRejectedValueOnce(new Error("Unavailable"))
    else vi.mocked(attendanceManager.updateGroup).mockResolvedValueOnce(false)
    render(
      <GroupSettings
        group={createAttendanceGroup({ settings: { late_threshold_enabled: false } })}
      />,
    )
    fireEvent.click(screen.getByRole("switch", { name: "Late tracking" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Last saved settings restored")
    expect(screen.getByRole("switch", { name: "Late tracking" })).toHaveAttribute(
      "aria-checked",
      "false",
    )
  },
)

it("rolls a failed queued edit back to the most recent successful write", async () => {
  let resolveFirst!: (value: boolean) => void
  vi.mocked(attendanceManager.updateGroup)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
    )
    .mockRejectedValueOnce(new Error("Unavailable"))
  render(<GroupSettings group={group} />)
  fireEvent.click(screen.getByText("Exact"))
  fireEvent.click(screen.getByText("10m"))
  await act(async () => {
    resolveFirst(true)
  })
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  // Exact is restored from the successfully saved first request, not the initial 15m.
  expect(screen.getByText("Exact")).toHaveClass("text-cyan-400")
  expect(useGroupStore.getState().selectedGroup?.settings?.late_threshold_minutes).toBe(0)
})

it("does not select the previous group when its pending save finishes after navigation", async () => {
  let resolve!: (value: boolean) => void
  vi.mocked(attendanceManager.updateGroup).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const onGroupsChanged = vi.fn()
  const { rerender } = render(<GroupSettings group={group} onGroupsChanged={onGroupsChanged} />)
  fireEvent.click(screen.getByText("Exact"))
  const other = createAttendanceGroup({ id: "other", settings: { late_threshold_minutes: 5 } })
  useGroupStore.setState({ selectedGroup: other })
  rerender(<GroupSettings group={other} onGroupsChanged={onGroupsChanged} />)
  await act(async () => {
    resolve(true)
  })
  expect(useGroupStore.getState().selectedGroup?.id).toBe("other")
  expect(onGroupsChanged).not.toHaveBeenCalled()
})

it("continues with a newer edit even when the previous queued write fails", async () => {
  let rejectFirst!: (error: Error) => void
  vi.mocked(attendanceManager.updateGroup)
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject
        }),
    )
    .mockResolvedValueOnce(true)
  render(<GroupSettings group={group} />)
  fireEvent.click(screen.getByText("Exact"))
  fireEvent.click(screen.getByText("10m"))
  await act(async () => {
    rejectFirst(new Error("Unavailable"))
  })
  await waitFor(() =>
    expect(useGroupStore.getState().selectedGroup?.settings?.late_threshold_minutes).toBe(10),
  )
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})
