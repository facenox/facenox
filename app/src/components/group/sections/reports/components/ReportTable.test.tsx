import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReportTable } from "./ReportTable"
import type { ColumnKey, RowData } from "../types"

const columns: { key: ColumnKey; label: string; align: string }[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "date", label: "Date", align: "left" },
  { key: "status", label: "Status", align: "center" },
  { key: "check_in_time", label: "Time in", align: "center" },
  { key: "check_out_time", label: "Time out", align: "center" },
  { key: "departure_status", label: "Departure", align: "center" },
  { key: "visit_number", label: "Visit", align: "center" },
  { key: "total_hours", label: "Total hours", align: "center" },
  { key: "late_minutes", label: "Late duration", align: "center" },
  { key: "is_late", label: "Late", align: "center" },
  { key: "notes", label: "Notes", align: "left" },
]

function renderRow(
  overrides: Partial<RowData> = {},
  group = "__all__",
  options: { onEditRow?: (row: RowData) => void; visibleColumns?: ColumnKey[] } = {},
) {
  const row: RowData = {
    person_id: "report-member",
    name: "Alice",
    date: "2026-11-02",
    status: "present",
    check_in_time: new Date("2026-11-02T08:00:00Z"),
    check_out_time: new Date("2026-11-02T17:00:00Z"),
    departure_status: "after_schedule",
    visit_number: 2,
    total_hours: 9,
    is_late: false,
    late_minutes: 0,
    notes: "Regular note",
    session: null,
    ...overrides,
  }
  const visibleColumns = options.visibleColumns ?? columns.map((c) => c.key)
  const visibleColDefs = columns.filter((c) => visibleColumns.includes(c.key))
  render(
    <ReportTable
      groupedRows={{ [group]: [row] }}
      visibleColumns={visibleColumns}
      allColumns={columns}
      pageSize={25}
      onPageSizeChange={vi.fn()}
      attendanceTimeZone="UTC"
      onEditRow={options.onEditRow}
    />,
  )
  const rows = screen.getAllByRole("row")
  const cells = within(rows[rows.length - 1]).getAllByRole("cell")
  return (key: ColumnKey) => cells[visibleColDefs.findIndex((c) => c.key === key)]
}

describe("report Name tooltips", () => {
  let availableWidth: number
  let textWidth: number
  let resizeCallbacks: (() => void)[]
  const observe = vi.fn()
  const disconnect = vi.fn()
  const longName = "Alexandria Gabrielle Montgomery Fernandez"

  beforeEach(() => {
    availableWidth = 200
    textWidth = 60
    resizeCallbacks = []
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.matches("span.truncate") ? availableWidth : 0
    })
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.matches("span.truncate") ? textWidth : 0
    })
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resizeCallbacks.push(callback)
        }
        observe = observe
        disconnect = disconnect
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(["a", "aaa", "Name..."])(
    "does not show a tooltip or add a tab stop for the fully visible name %s",
    async (name) => {
      const user = userEvent.setup()
      renderRow({ name })
      const text = screen.getByText(name)
      expect(text).not.toHaveAttribute("tabindex")
      expect(text).not.toHaveAttribute("title")
      await user.hover(text)
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 250)))
      expect(screen.queryByRole("tooltip")).toBeNull()
    },
  )

  it("shows the complete name on hover only when its rendered text overflows", async () => {
    const user = userEvent.setup()
    textWidth = 400
    renderRow({ name: longName })
    const text = screen.getByText(longName)
    expect(text).toHaveAttribute("tabindex", "0")
    await user.hover(text)
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName)
  })

  it("reveals a truncated name by keyboard and dismisses it without losing focus", async () => {
    const user = userEvent.setup()
    textWidth = 400
    renderRow({ name: longName }, "__all__", { visibleColumns: ["name", "date"] })
    const text = screen.getByText(longName)
    await user.tab()
    expect(text).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName)
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
    expect(text).toHaveFocus()
  })

  it("updates after resizing and removes a tooltip once the full name fits", async () => {
    const user = userEvent.setup()
    textWidth = 400
    renderRow({ name: longName })
    await user.hover(screen.getByText(longName))
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName)

    availableWidth = 450
    act(() => resizeCallbacks.forEach((callback) => callback()))
    expect(screen.getByText(longName)).not.toHaveAttribute("tabindex")
    expect(screen.queryByRole("tooltip")).toBeNull()

    availableWidth = 150
    act(() => resizeCallbacks.forEach((callback) => callback()))
    expect(screen.getByText(longName)).toHaveAttribute("tabindex", "0")
    await user.hover(screen.getByText(longName))
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName)
    expect(observe).toHaveBeenCalledTimes(1)
  })

  it("disconnects the name width observer when the row unmounts", () => {
    renderRow()
    cleanup()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it("remeasures when the same member's displayed name changes", async () => {
    const user = userEvent.setup()
    textWidth = 400
    const table = (name: string) => (
      <ReportTable
        groupedRows={{
          __all__: [
            {
              person_id: "report-member",
              name,
              date: "2026-11-02",
              status: "present",
              is_late: false,
              late_minutes: 0,
              notes: "",
              session: null,
            },
          ],
        }}
        visibleColumns={["name"]}
        allColumns={columns}
        pageSize={25}
        onPageSizeChange={vi.fn()}
      />
    )
    const { rerender } = render(table(longName))
    await user.hover(screen.getByText(longName))
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longName)

    textWidth = 60
    rerender(table("a"))
    expect(screen.getByText("a")).not.toHaveAttribute("tabindex")
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("remeasures after fonts finish loading and cleans up its listener", () => {
    const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts")
    const fonts = new EventTarget()
    const removeListener = vi.spyOn(fonts, "removeEventListener")
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts })
    try {
      renderRow({ name: longName })
      expect(screen.getByText(longName)).not.toHaveAttribute("tabindex")
      textWidth = 400
      act(() => {
        fonts.dispatchEvent(new Event("loadingdone"))
      })
      expect(screen.getByText(longName)).toHaveAttribute("tabindex", "0")
      cleanup()
      expect(removeListener).toHaveBeenCalledWith("loadingdone", expect.any(Function))
    } finally {
      if (originalFonts) Object.defineProperty(document, "fonts", originalFonts)
      else Reflect.deleteProperty(document, "fonts")
    }
  })
})

it.each([true, false])(
  "keeps side spacing outside the scroll viewport when editable is %s",
  (editable) => {
    renderRow({}, "__all__", { onEditRow: editable ? vi.fn() : undefined })
    const scroller = screen.getByRole("table").closest(".reports-scroll")
    expect(scroller).toHaveClass("mx-10", "min-w-0", "overflow-x-auto", "overflow-y-auto")
    expect(scroller).not.toHaveClass("px-10")
    expect(scroller).not.toHaveClass("w-full")
  },
)

it("pins Name and the correction column above scrolling data, with headers above both", () => {
  const cell = renderRow({}, "__all__", { onEditRow: vi.fn() })
  const button = screen.getByRole("button", { name: /^Correct attendance for Alice on / })
  expect(cell("name")).toHaveClass("sticky", "left-0", "z-10", "bg-inherit")
  expect(cell("date")).not.toHaveClass("sticky")
  expect(button.closest("td")).toHaveClass("sticky", "right-0", "z-10", "bg-inherit")
  expect(screen.getByRole("columnheader", { name: "Name" })).toHaveClass("left-0", "z-30")
  expect(screen.getByRole("columnheader", { name: "Actions" })).toHaveClass("right-0", "z-30")
  expect(screen.getByRole("columnheader", { name: "Date" })).toHaveClass("z-20")
  expect(button).toHaveClass("size-8", "text-white/55", "focus-visible:outline-2")
  expect(button).not.toHaveClass("opacity-0")
  expect(button.closest("tr")).toHaveClass("bg-[#0f1011]", "focus-within:bg-[#101719]")
})

it("opens correction for the intended row using the keyboard and identifies its visit", async () => {
  const user = userEvent.setup()
  const onEditRow = vi.fn()
  renderRow({}, "__all__", { onEditRow })
  const button = screen.getByRole("button", {
    name: /^Correct attendance for Alice on .+2026, visit 2$/,
  })
  button.focus()
  expect(button).toHaveFocus()
  await user.keyboard("{Enter}")
  expect(onEditRow).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ person_id: "report-member", date: "2026-11-02", visit_number: 2 }),
  )
})

it("uses the correction tooltip rather than the generic edit-record label", async () => {
  const user = userEvent.setup()
  renderRow({ visit_number: 1 }, "__all__", { onEditRow: vi.fn() })
  const button = screen.getByRole("button", { name: /^Correct attendance for Alice on / })
  expect(button).not.toHaveAccessibleName(/visit/)
  expect(button).not.toHaveAttribute("title")
  await user.hover(button)
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Correct attendance")
})

it("does not freeze the wrong data column when Name is hidden", () => {
  const cell = renderRow({}, "__all__", {
    onEditRow: vi.fn(),
    visibleColumns: ["date", "status", "notes"],
  })
  expect(screen.queryByRole("columnheader", { name: "Name" })).toBeNull()
  expect(cell("date")).not.toHaveClass("sticky")
  expect(screen.getByRole("button", { name: /^Correct attendance/ }).closest("td")).toHaveClass(
    "sticky",
    "right-0",
  )
})

it("only reserves the action column for editable reports and preserves grouped spans", () => {
  renderRow({}, "Test group", { onEditRow: vi.fn() })
  expect(screen.getByText("Test group").closest("td")).toHaveAttribute(
    "colspan",
    String(columns.length + 1),
  )
})

it("does not add a correction column to a read-only report", () => {
  renderRow({}, "Test group")
  expect(screen.queryByRole("columnheader", { name: "Actions" })).toBeNull()
  expect(screen.queryByRole("button", { name: /^Correct attendance/ })).toBeNull()
  expect(screen.getByText("Test group").closest("td")).toHaveAttribute(
    "colspan",
    String(columns.length),
  )
})

it("uses a shared 13px neutral body style and 12px headers across all columns", () => {
  const cell = renderRow()
  expect(screen.getByRole("table")).toHaveClass("text-[13px]", "font-medium", "text-white/85")
  for (const header of screen.getAllByRole("columnheader"))
    expect(header).toHaveClass("text-xs", "font-medium")
  expect(within(cell("name")).getByText("Alice")).toHaveClass("font-semibold", "text-white/90")
  for (const key of ["check_in_time", "check_out_time", "total_hours", "visit_number"] as const) {
    expect(cell(key).querySelector(".tabular-nums")).not.toBeNull()
    expect(cell(key).querySelector('[class*="text-cyan"], [class*="text-orange"]')).toBeNull()
  }
  expect(cell("check_in_time")).toHaveClass("text-center")
  expect(cell("date")).toHaveClass("text-left")
})

it.each([
  ["present", "Present", "text-cyan-400"],
  ["late", "Late", "text-orange-400"],
  ["absent", "Absent", "text-red-400"],
  ["no_records", "N/A", "text-white/55"],
] as const)(
  "preserves semantic coloring for %s status without shrinking its text",
  (status, label, color) => {
    const cell = renderRow({ status })
    const text = within(cell("status")).getByText(label)
    expect(text).toHaveClass(color, "font-semibold")
    expect(text).not.toHaveClass("text-[11px]")
  },
)

it.each([
  ["early", "Left early", "text-orange-400/80"],
  ["after_schedule", "Left after schedule", "text-cyan-400/80"],
  ["on_schedule", "On schedule", "text-white/70"],
] as const)("preserves the %s departure indicator", (departure_status, label, color) => {
  const cell = renderRow({ departure_status })
  expect(within(cell("departure_status")).getByText(label)).toHaveClass(color)
})

it("distinguishes zero total hours from a missing duration", () => {
  const cell = renderRow({ total_hours: 0 })
  expect(cell("total_hours")).toHaveTextContent("0m")
})

it("uses the same readable missing-value marker in every optional column", () => {
  const cell = renderRow({
    check_in_time: undefined,
    check_out_time: undefined,
    departure_status: undefined,
    visit_number: undefined,
    total_hours: undefined,
    notes: "",
  })
  for (const key of [
    "check_in_time",
    "check_out_time",
    "departure_status",
    "visit_number",
    "total_hours",
    "late_minutes",
    "is_late",
    "notes",
  ] as const) {
    expect(within(cell(key)).getByText("-")).toHaveClass("text-white/35", "font-normal")
  }
})

it("keeps lateness semantic and gives the secondary annotation an explicit 11px size", () => {
  const cell = renderRow({ is_late: true, late_minutes: 90 })
  expect(within(cell("check_in_time")).getByText("1h 30m late")).toHaveClass(
    "text-[11px]",
    "tabular-nums",
  )
  expect(within(cell("late_minutes")).getByText("1h 30m")).toHaveClass(
    "text-orange-400/80",
    "tabular-nums",
  )
})

it("preserves all note text after the first reason separator", () => {
  const cell = renderRow({ notes: "Manual correction — First part — Second part — Last part" })
  expect(within(cell("notes")).getByText("Manual correction")).toHaveClass(
    "text-[11px]",
    "text-white/55",
  )
  expect(within(cell("notes")).getByText("First part — Second part — Last part")).toHaveClass(
    "font-normal",
    "text-white/70",
  )
})

it("uses neutral regular-weight notes and neutral group headings", () => {
  const cell = renderRow({}, "Test group")
  expect(within(cell("notes")).getByText("Regular note")).toHaveClass(
    "font-normal",
    "text-white/70",
  )
  expect(screen.getByText("Test group")).toHaveClass("text-xs", "font-semibold", "text-white/80")
})
