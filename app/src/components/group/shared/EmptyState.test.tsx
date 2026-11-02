import type { HTMLAttributes, ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { EmptyState } from "./EmptyState"

const { motionProps } = vi.hoisted(() => ({ motionProps: vi.fn() }))

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      initial,
      animate,
      exit,
      transition,
      ...props
    }: {
      children?: ReactNode
      initial?: unknown
      animate?: unknown
      exit?: unknown
      transition?: unknown
    } & HTMLAttributes<HTMLDivElement>) => {
      motionProps({ initial, animate, exit, transition })
      return <div {...props}>{children}</div>
    },
  },
}))

it.each([false, true])(
  "preserves the empty-state design with reduced motion set to %s",
  (reducedMotion) => {
    render(
      <EmptyState
        title="No results found"
        description="No groups matched your search."
        reducedMotion={reducedMotion}
      />,
    )
    expect(screen.getByRole("heading", { name: "No results found" })).toHaveClass(
      "text-sm",
      "font-semibold",
    )
    expect(screen.getByText("No groups matched your search.")).toHaveClass(
      "text-xs",
      "text-white/55",
    )
    expect(motionProps).toHaveBeenCalledWith({
      initial: { opacity: 0, y: reducedMotion ? 0 : 6 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: reducedMotion ? 0 : -6 },
      transition: { duration: reducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] },
    })
  },
)
