import { describe, expect, it } from "vitest"
import {
  createDisplayNameMap,
  generateDisplayNames,
  getDisplayName,
} from "@/utils/displayNameUtils"

const people = [
  { person_id: "1", name: "Alice" },
  { person_id: "2", name: "Bob" },
  { person_id: "3", name: "Alice" },
]

describe("displayNameUtils", () => {
  it("keeps unique names unchanged", () => {
    expect(generateDisplayNames([{ person_id: "1", name: "Bob" }])[0]?.displayName).toBe("Bob")
  })

  it("adds stable suffixes for duplicate names in input order", () => {
    expect(generateDisplayNames(people).map((person) => person.displayName)).toEqual([
      "Alice",
      "Bob",
      "Alice (2)",
    ])
  })

  it('getDisplayName returns "Unknown" for missing people', () => {
    expect(getDisplayName("missing", people)).toBe("Unknown")
  })

  it("createDisplayNameMap resolves duplicate display names correctly", () => {
    expect(Array.from(createDisplayNameMap(people).entries())).toEqual([
      ["1", "Alice"],
      ["2", "Bob"],
      ["3", "Alice (2)"],
    ])
  })
})
