/**
 * Parses a photo filename into a clean Member Name and optional Role.
 * Handles various real-world file naming conventions (underscores, hyphens, role commas, extensions).
 */
export interface ParsedPhotoFilename {
  name: string
  role?: string
}

export function parsePhotoFilename(filename: string): ParsedPhotoFilename {
  // 1. Remove file extension (e.g. ".jpg", ".png", ".webp")
  const withoutExt = filename.replace(/\.[^/.]+$/, "").trim()

  if (!withoutExt) {
    return { name: "Unnamed Member" }
  }

  let nameCandidate = withoutExt
  let roleCandidate: string | undefined = undefined

  // 2. Check for comma separator for role: "Juan Dela Cruz, Student"
  if (nameCandidate.includes(",")) {
    const [namePart, rolePart] = nameCandidate.split(",")
    if (namePart && namePart.trim()) {
      nameCandidate = namePart.trim()
      if (rolePart && rolePart.trim()) {
        roleCandidate = rolePart.trim()
      }
    }
  } else if (nameCandidate.includes(" - ")) {
    // Check for " - " separator: "Maria Santos - Teacher"
    const parts = nameCandidate.split(" - ")
    if (parts.length === 2 && parts[0]?.trim() && parts[1]?.trim()) {
      nameCandidate = parts[0].trim()
      roleCandidate = parts[1].trim()
    }
  }

  // 3. Replace underscores with spaces: "Juan_Dela_Cruz" -> "Juan Dela Cruz"
  const cleanName = nameCandidate.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim()

  return {
    name: cleanName || "Unnamed Member",
    role: roleCandidate,
  }
}
