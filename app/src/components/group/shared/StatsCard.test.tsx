import type { HTMLAttributes, ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StatsCard } from "./StatsCard"

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

describe("StatsCard", () => {
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

  it("renders value and label correctly", () => {
    render(<StatsCard type="late" value={3} label="Late Arrivals" />)

    expect(screen.getByText("Late Arrivals")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("shows tooltipText when hovered and not disabled", async () => {
    render(
      <StatsCard
        type="late"
        value={0}
        label="Late Arrivals"
        tooltipText={<span>Late arrivals today. Resets at midnight.</span>}
      />,
    )

    const card = screen.getByText("Late Arrivals").closest("div")
    expect(card).toBeInTheDocument()
    if (card) {
      fireEvent.mouseEnter(card)
    }

    await waitFor(() => {
      expect(screen.getByText("Late arrivals today. Resets at midnight.")).toBeInTheDocument()
    })
  })

  it("shows disabledTooltipText and disabled badge when disabled", async () => {
    render(
      <StatsCard
        type="late"
        value={0}
        label="Late Arrivals"
        disabled
        disabledTooltipText={<span>Late tracking is disabled.</span>}
        tooltipText={<span>Late arrivals today.</span>}
      />,
    )

    expect(screen.getByText("Disabled")).toBeInTheDocument()
    expect(screen.getByText("-")).toBeInTheDocument()

    const card = screen.getByText("Late Arrivals").closest("div")
    if (card) {
      fireEvent.mouseEnter(card)
    }

    await waitFor(() => {
      expect(screen.getByText("Late tracking is disabled.")).toBeInTheDocument()
      expect(screen.queryByText("Late arrivals today.")).not.toBeInTheDocument()
    })
  })
})
