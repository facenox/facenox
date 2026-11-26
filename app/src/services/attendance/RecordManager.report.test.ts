import { expect, it, vi } from "vitest"
import { RecordManager } from "./RecordManager"
import type { HttpClient } from "./HttpClient"

it("does not count members who joined after endDate as absent in earlier reports", async () => {
  const manager = new RecordManager(
    { get: vi.fn().mockResolvedValue([]) } as unknown as HttpClient,
    { sessions: "/sessions" },
    (d) => d.toISOString(),
    vi.fn(),
    vi.fn(),
  )

  const report = await manager.generateReport(
    "g1",
    new Date("2026-11-01T00:00:00"),
    new Date("2026-11-05T23:59:59"),
    async () => ({
      id: "g1",
      name: "Staff",
      created_at: new Date("2026-01-01T00:00:00"),
      is_active: true,
    }),
    async () => [
      {
        person_id: "p1",
        group_id: "g1",
        name: "Future Joiner",
        joined_at: new Date("2026-11-10T09:00:00"),
        is_active: true,
      },
      {
        person_id: "p2",
        group_id: "g1",
        name: "Existing Member",
        joined_at: new Date("2026-10-01T09:00:00"),
        is_active: true,
      },
    ],
  )

  const futureMember = report.members.find((m) => m.person_id === "p1")
  const existingMember = report.members.find((m) => m.person_id === "p2")
  expect(futureMember).toEqual({
    person_id: "p1",
    name: "Future Joiner",
    total_days: 0,
    present_days: 0,
    absent_days: 0,
    late_days: 0,
    attendance_rate: 0,
  })
  expect(existingMember?.total_days).toBe(5)
  expect(existingMember?.absent_days).toBe(5)
})
