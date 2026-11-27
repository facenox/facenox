import { assignDirectoryDisplayNames } from './directoryDisplayNames'

export interface PersonWithName {
  person_id: string
  name: string
  [key: string]: unknown
}

export interface HasPersonIdAndName {
  person_id: string
  name: string
  group_id?: string
}

export interface PersonWithDisplayName extends PersonWithName {
  displayName: string
}

export function generateDisplayNames<T extends HasPersonIdAndName>(persons: T[]): (T & { displayName: string })[] {
  return assignDirectoryDisplayNames(persons, (person) => ({
    scope: person.group_id ?? '',
    id: person.person_id
  }))
}

export function getDisplayName<T extends HasPersonIdAndName>(personId: string, persons: T[]): string {
  const withDisplayNames = generateDisplayNames(persons)
  const person = withDisplayNames.find((p) => p.person_id === personId)
  return person?.displayName || 'Member'
}

export function createDisplayNameMap<T extends HasPersonIdAndName>(persons: T[]): Map<string, string> {
  const withDisplayNames = generateDisplayNames(persons)
  return new Map(withDisplayNames.map((p) => [p.person_id, p.displayName]))
}

export interface HasIdAndName {
  id: string
  name: string
  created_at?: Date | string | null
}

/**
 * Resolves duplicate group names dynamically by appending suffix counts (e.g., "(2)").
 * This ensures the user can distinguish between identically named groups in the sidebar
 * and selection dropdowns without altering the raw database records or raising sync conflicts.
 */
export function generateGroupDisplayNames<T extends HasIdAndName>(groups: T[]): (T & { displayName: string })[] {
  // A standalone directory is local, and a paired directory is scoped to its location.
  return assignDirectoryDisplayNames(groups, (group) => ({
    scope: '',
    id: group.id,
    createdAt: group.created_at
  }))
}
