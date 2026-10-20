import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WindowBar from "@/components/window/WindowBar"
import { createFacenoxElectronMock } from "@/test/mocks/electron"

describe("WindowBar", () => {
  let bridge: ReturnType<typeof createFacenoxElectronMock>
  beforeEach(() => {
    bridge = createFacenoxElectronMock()
    window.facenoxElectron = bridge
  })

  it("wires the window action buttons to the Electron bridge", () => {
    render(<WindowBar />)

    fireEvent.click(screen.getByTitle("Minimize"))
    fireEvent.click(screen.getByTitle("Maximize"))
    fireEvent.click(screen.getByTitle("Close"))

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

    expect(screen.getByTitle("Maximize")).toBeInTheDocument()

    act(() => {
      handleMaximize?.()
    })
    expect(screen.getByTitle("Restore")).toBeInTheDocument()

    act(() => {
      handleUnmaximize?.()
    })
    expect(screen.getByTitle("Maximize")).toBeInTheDocument()

    fireEvent.click(screen.getByTitle("Maximize"))
    expect(bridge.maximize).toHaveBeenCalledTimes(1)

    unmount()

    expect(cleanupMaximize).toHaveBeenCalledTimes(1)
    expect(cleanupUnmaximize).toHaveBeenCalledTimes(1)
  })
})
