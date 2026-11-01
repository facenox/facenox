import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WindowBar from "@/components/window/WindowBar"
import {
  createFacenoxElectronMock,
  createSyncConfig,
  getElectronAPIMock,
} from "@/test/mocks/electron"

describe("WindowBar", () => {
  it.each([
    [undefined, undefined, null, "Waiting for sync"],
    [0, 0, "2026-10-23T02:00:00Z", "Last sync completed"],
    [2, 0, "2026-10-23T02:00:00Z", "Sync pending"],
  ] as const)("renders queue state %s / %s", async (records, sessions, timestamp, label) => {
    getElectronAPIMock().sync.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: true,
        enabled: true,
        lastSyncedAt: timestamp,
        lastSyncStatus: timestamp ? "success" : "idle",
        unsyncedRecordsCount: records,
        unsyncedSessionsCount: sessions,
      }),
    )
    render(<WindowBar />)
    expect(await screen.findByText(label)).toBeInTheDocument()
    expect(screen.queryByText("All records up to date.")).not.toBeInTheDocument()
  })
  let bridge: ReturnType<typeof createFacenoxElectronMock>
  beforeEach(() => {
    bridge = createFacenoxElectronMock()
    window.facenoxElectron = bridge
  })

  it("wires the window action buttons to the Electron bridge", () => {
    render(<WindowBar />)

    for (const name of ["Minimize", "Maximize", "Close"]) {
      const button = screen.getByRole("button", { name })
      expect(button).not.toHaveAttribute("title")
      fireEvent.click(button)
    }

    expect(bridge.minimize).toHaveBeenCalledTimes(1)
    expect(bridge.maximize).toHaveBeenCalledTimes(1)
    expect(bridge.close).toHaveBeenCalledTimes(1)
  })

  it("updates the maximize button label from bridge events and cleans up listeners", () => {
    const cleanupMaximize = vi.fn()
    const cleanupUnmaximize = vi.fn()
    let handleMaximize: (() => void) | undefined
    let handleUnmaximize: (() => void) | undefined

    bridge.onMaximize.mockImplementation((callback: () => void) => {
      handleMaximize = callback
      return cleanupMaximize
    })
    bridge.onUnmaximize.mockImplementation((callback: () => void) => {
      handleUnmaximize = callback
      return cleanupUnmaximize
    })

    const { unmount } = render(<WindowBar />)

    expect(screen.getByRole("button", { name: "Maximize" })).toBeInTheDocument()

    act(() => {
      handleMaximize?.()
    })
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument()

    act(() => {
      handleUnmaximize?.()
    })
    expect(screen.getByRole("button", { name: "Maximize" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Maximize" }))
    expect(bridge.maximize).toHaveBeenCalledTimes(1)

    unmount()

    expect(cleanupMaximize).toHaveBeenCalledTimes(1)
    expect(cleanupUnmaximize).toHaveBeenCalledTimes(1)
  })
})
