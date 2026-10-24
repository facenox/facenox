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
    button: ({ children, ...props }: HTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
    span: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => (
      <span {...props}>{children}</span>
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

  it("uses the shared non-scaling trigger and rotating chevron for custom content", () => {
    const onChange = vi.fn()
    render(
      <Dropdown
        options={[{ value: "all", label: "Export all groups" }]}
        value={null}
        onChange={onChange}
        trigger={<span>Export</span>}
        fit
        menuWidth={180}
        showPlaceholderOption={false}
        allowClear={false}
      />,
    )

    const trigger = screen.getByRole("button", { name: "Export" })
    const chevron = trigger.querySelector("svg")
    const triggerClasses = trigger.className
    expect(trigger).toHaveClass("dropdown-trigger")
    expect(trigger.querySelector("button")).toBeNull()
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(chevron).not.toHaveClass("rotate-180")

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(chevron).toHaveClass("rotate-180")
    expect(trigger.className).toBe(triggerClasses)

    fireEvent.click(screen.getByRole("button", { name: "Export all groups" }))
    expect(onChange).toHaveBeenCalledWith("all")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(chevron).not.toHaveClass("rotate-180")
  })

  it("does not open a disabled custom trigger", () => {
    render(
      <Dropdown
        options={[{ value: "all", label: "Export all groups" }]}
        value={null}
        onChange={vi.fn()}
        trigger={<span>Export</span>}
        disabled
      />,
    )

    const trigger = screen.getByRole("button", { name: "Export" })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "Export all groups" })).not.toBeInTheDocument()
  })

  it("supports an icon-only trigger without reserving chevron space", () => {
    render(
      <Dropdown
        options={[{ value: "today", label: "Today" }]}
        value="today"
        onChange={vi.fn()}
        trigger={<span className="sr-only">Filter attendance by date</span>}
        showChevron={false}
        showPlaceholderOption={false}
      />,
    )

    const trigger = screen.getByRole("button", { name: "Filter attendance by date" })
    expect(trigger).toHaveClass("dropdown-trigger")
    expect(trigger.querySelector("svg")).toBeNull()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument()
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

  it("closes when the legacy Esc key value is pressed", async () => {
    render(
      <Dropdown options={[{ value: "today", label: "Today" }]} value="today" onChange={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole("button"))
    expect(await screen.findAllByRole("button", { name: "Today" })).toHaveLength(2)

    fireEvent.keyDown(document, { key: "Esc", keyCode: 27 })

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Today" })).toHaveLength(1)
    })
  })
})
