import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import WindowBar from "@/components/window/WindowBar"

describe("WindowBar", () => {
  beforeEach(() => {
    window.facenoxElectron.onMaximize.mockReset()
    window.facenoxElectron.onUnmaximize.mockReset()
    window.facenoxElectron.minimize.mockClear()
    window.facenoxElectron.maximize.mockClear()
    window.facenoxElectron.close.mockClear()
  })

  it("wires the window action buttons to the Electron bridge", () => {
    render(<WindowBar />)

    fireEvent.click(screen.getByTitle("Minimize"))
    fireEvent.click(screen.getByTitle("Maximize"))
    fireEvent.click(screen.getByTitle("Close"))

    expect(window.facenoxElectron.minimize).toHaveBeenCalledTimes(1)
    expect(window.facenoxElectron.maximize).toHaveBeenCalledTimes(1)
    expect(window.facenoxElectron.close).toHaveBeenCalledTimes(1)
  })

  it("updates the maximize button label from bridge events and cleans up listeners", () => {
    const cleanupMaximize = vi.fn()
    const cleanupUnmaximize = vi.fn()
    let handleMaximize: (() => void) | undefined
    let handleUnmaximize: (() => void) | undefined

    window.facenoxElectron.onMaximize.mockImplementation((callback) => {
      handleMaximize = callback
      return cleanupMaximize
    })
    window.facenoxElectron.onUnmaximize.mockImplementation((callback) => {
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
    expect(window.facenoxElectron.maximize).toHaveBeenCalledTimes(1)

    unmount()

    expect(cleanupMaximize).toHaveBeenCalledTimes(1)
    expect(cleanupUnmaximize).toHaveBeenCalledTimes(1)
  })
})
