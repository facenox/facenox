import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { ReportToolbar } from "./ReportToolbar"

it.each([
  ["none", false],
  ["date", false],
  ["person", false],
  ["none", true],
] as const)(
  "explains %s grouping with visits enabled as %s without adding a sort control",
  (groupBy, visits) => {
    render(
      <ReportToolbar
        startDate="2026-04-01"
        endDate="2026-04-02"
        onStartDateChange={vi.fn()}
        onEndDateChange={vi.fn()}
        visibleColumns={["name", "date"]}
        setVisibleColumns={vi.fn()}
        groupBy={groupBy}
        setGroupBy={vi.fn()}
        statusFilter="all"
        setStatusFilter={vi.fn()}
        search=""
        setSearch={vi.fn()}
        allColumns={[
          { key: "name", label: "Name" },
          { key: "date", label: "Date" },
          ...(visits ? [{ key: "visit_number" as const, label: "Visit" }] : []),
        ]}
        unavailableColumns={[]}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Report options" }))
    const orderDescription =
      groupBy === "person" ?
        "Names A-Z, newest dates within each person."
      : "Newest dates first, names A-Z within each date."
    expect(
      screen.getByText(orderDescription + (visits ? " Visits follow visit number." : "")),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /sort/i })).not.toBeInTheDocument()
  },
)
