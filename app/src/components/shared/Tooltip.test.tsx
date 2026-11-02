import type { HTMLAttributes, ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Tooltip } from "@/components/shared/Tooltip"

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

describe("Tooltip", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 80,
      height: 32,
      top: 100,
      left: 100,
      right: 180,
      bottom: 132,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback) => {
        callback(0)
        return 0
      },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows content after hover delay and hides on mouse leave", async () => {
    render(
      <Tooltip content="Helpful info" delay={0}>
        <button type="button">Hover me</button>
      </Tooltip>,
    )

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Hover me" }))

    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toBeInTheDocument()
      expect(screen.getByText("Helpful info")).toBeInTheDocument()
    })

    fireEvent.mouseLeave(screen.getByRole("button", { name: "Hover me" }))

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    })
  })

  it("does not render when disabled", async () => {
    render(
      <Tooltip content="Hidden info" disabled>
        <button type="button">Hover me</button>
      </Tooltip>,
    )

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Hover me" }))

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("shows on focus for keyboard users", async () => {
    render(
      <Tooltip content="Keyboard info" delay={0}>
        <button type="button">Focusable</button>
      </Tooltip>,
    )

    screen.getByRole("button", { name: "Focusable" }).focus()

    await waitFor(() => {
      expect(screen.getByText("Keyboard info")).toBeInTheDocument()
    })
  })

  it("dismisses on Escape without moving focus or triggering a parent Escape action", async () => {
    const parentKeyDown = vi.fn()
    const childKeyDown = vi.fn()
    render(
      <div onKeyDown={parentKeyDown}>
        <Tooltip content="Keyboard info" delay={0}>
          <button type="button" onKeyDown={childKeyDown}>
            Focusable
          </button>
        </Tooltip>
      </div>,
    )
    const button = screen.getByRole("button", { name: "Focusable" })
    button.focus()
    await screen.findByRole("tooltip")
    fireEvent.keyDown(button, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).toBeNull()
    expect(button).toHaveFocus()
    expect(parentKeyDown).not.toHaveBeenCalled()
    expect(childKeyDown).toHaveBeenCalledOnce()
  })

  it("preserves the child's keyboard handler when no tooltip is open", () => {
    const onKeyDown = vi.fn()
    render(
      <Tooltip content="Keyboard info">
        <button type="button" onKeyDown={onKeyDown}>
          Focusable
        </button>
      </Tooltip>,
    )
    fireEvent.keyDown(screen.getByRole("button", { name: "Focusable" }), { key: "ArrowDown" })
    expect(onKeyDown).toHaveBeenCalledOnce()
  })
})
