import { expect, it } from "vitest"
import { compareReportNames, compareReportRows } from "./reportOrdering"

it("orders ISO attendance dates newest first across month and year boundaries", () => {
  const dates = ["2025-12-31", "2026-02-01", "2026-01-31"]
  const rows = dates.map((date) => ({ date, name: "Alice", person_id: "a" }))
  expect(rows.sort(compareReportRows).map((row) => row.date)).toEqual([
    "2026-02-01",
    "2026-01-31",
    "2025-12-31",
  ])
})

it("uses case-insensitive alphabetical names with natural numeric ordering", () => {
  expect(["Zed", "bob", "Member 10", "Alice", "Member 2"].sort(compareReportNames)).toEqual([
    "Alice",
    "bob",
    "Member 2",
    "Member 10",
    "Zed",
  ])
})

it("keeps a person's visits together and orders them by visit number", () => {
  const base = { date: "2026-04-01", name: "Alice" }
  const rows = [
    { ...base, person_id: "b", visit_number: 2 },
    { ...base, person_id: "a", visit_number: 3 },
    { ...base, person_id: "b", visit_number: 1 },
  ]
  expect(rows.sort(compareReportRows).map((row) => [row.person_id, row.visit_number])).toEqual([
    ["a", 3],
    ["b", 1],
    ["b", 2],
  ])
})

it("treats a missing visit number as the first visit", () => {
  const row = { date: "2026-04-01", name: "Alice", person_id: "a" }
  expect(compareReportRows(row, { ...row, visit_number: 1 })).toBe(0)
  expect(compareReportRows(row, { ...row, visit_number: 2 })).toBeLessThan(0)
})
