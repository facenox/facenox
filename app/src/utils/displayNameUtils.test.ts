import { describe, expect, it } from "vitest"
import {
  createDisplayNameMap,
  generateDisplayNames,
  generateGroupDisplayNames,
  getDisplayName,
} from "@/utils/displayNameUtils"

const people = [
  { person_id: "1", name: "Alice" },
  { person_id: "2", name: "Bob" },
  { person_id: "3", name: "Alice" },
]

const groups = [
  { id: "1", name: "Class A" },
  { id: "2", name: "Class B" },
  { id: "3", name: "Class A" },
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

  it('getDisplayName returns "Member" for missing people', () => {
    expect(getDisplayName("missing", people)).toBe("Member")
  })

  it("createDisplayNameMap resolves duplicate display names correctly", () => {
    expect(Array.from(createDisplayNameMap(people).entries())).toEqual([
      ["1", "Alice"],
      ["2", "Bob"],
      ["3", "Alice (2)"],
    ])
  })

  describe("generateGroupDisplayNames", () => {
    it("keeps unique group names unchanged", () => {
      expect(generateGroupDisplayNames([{ id: "1", name: "Class A" }])[0]?.displayName).toBe(
        "Class A",
      )
    })

    it("appends stable suffixes for duplicate group names", () => {
      expect(generateGroupDisplayNames(groups).map((g) => g.displayName)).toEqual([
        "Class A",
        "Class B",
        "Class A (2)",
      ])
    })
  })
})
