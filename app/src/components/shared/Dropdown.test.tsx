import type { HTMLAttributes, ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Dropdown } from "@/components/shared/Dropdown"

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

describe("Dropdown", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 120,
      height: 36,
      top: 100,
      left: 100,
      right: 220,
      bottom: 136,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)
  })

  it("opens the menu and selects an enabled option", async () => {
    const onChange = vi.fn()

    render(
      <Dropdown
        options={[
          { value: "today", label: "Today" },
          { value: "all", label: "All" },
        ]}
        value="today"
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole("button"))
    fireEvent.click(await screen.findByRole("button", { name: "All" }))

    expect(onChange).toHaveBeenCalledWith("all")
  })

  it("does not call onChange for disabled options", async () => {
    const onChange = vi.fn()

    render(
      <Dropdown
        options={[
          { value: "today", label: "Today" },
          { value: "all", label: "All", disabled: true },
        ]}
        value="today"
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole("button"))
    const disabledButton = await screen.findByRole("button", { name: "All" })

    expect(disabledButton).toBeDisabled()
    fireEvent.click(disabledButton)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("supports clearing when allowClear is enabled", async () => {
    const onChange = vi.fn()

    render(
      <Dropdown
        options={[{ value: "today", label: "Today" }]}
        value="today"
        onChange={onChange}
        placeholder="Select scope"
        allowClear
      />,
    )

    fireEvent.click(screen.getByRole("button"))
    fireEvent.click(await screen.findByRole("button", { name: "Select scope" }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it("closes when escape is pressed", async () => {
    render(
      <Dropdown options={[{ value: "today", label: "Today" }]} value="today" onChange={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole("button"))
    expect(await screen.findAllByRole("button", { name: "Today" })).toHaveLength(2)

    fireEvent.keyDown(document, { key: "Escape" })

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Today" })).toHaveLength(1)
    })
  })
})
