import { describe, it, expect } from "vitest"
import { parsePhotoFilename } from "./filenameParser"

describe("parsePhotoFilename", () => {
  it("extracts simple name without extension", () => {
    expect(parsePhotoFilename("Juan Dela Cruz.jpg")).toEqual({
      name: "Juan Dela Cruz",
      role: undefined,
    })
  })

  it("replaces underscores with spaces", () => {
    expect(parsePhotoFilename("Juan_Dela_Cruz.png")).toEqual({
      name: "Juan Dela Cruz",
      role: undefined,
    })
  })

  it("extracts role from comma separation", () => {
    expect(parsePhotoFilename("Juan Dela Cruz, Student.jpg")).toEqual({
      name: "Juan Dela Cruz",
      role: "Student",
    })
  })

  it("extracts role from dash separation", () => {
    expect(parsePhotoFilename("Maria_Santos - Teacher.jpeg")).toEqual({
      name: "Maria Santos",
      role: "Teacher",
    })
  })

  it("preserves student ID numbers in filename", () => {
    expect(parsePhotoFilename("2024-001_Juan Dela Cruz.jpg")).toEqual({
      name: "2024-001 Juan Dela Cruz",
      role: undefined,
    })
  })

  it("handles empty or extension-only strings gracefully", () => {
    expect(parsePhotoFilename(".jpg")).toEqual({
      name: "Unnamed Member",
      role: undefined,
    })
  })
})
