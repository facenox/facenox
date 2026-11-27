import { describe, expect, it } from 'vitest'
import {
  createDisplayNameMap,
  generateDisplayNames,
  generateGroupDisplayNames,
  getDisplayName
} from '@/utils/displayNameUtils'

const people = [
  { person_id: '1', name: 'Alice' },
  { person_id: '2', name: 'Bob' },
  { person_id: '3', name: 'Alice' }
]

const groups = [
  { id: '1', name: 'Class A' },
  { id: '2', name: 'Class B' },
  { id: '3', name: 'Class A' }
]

describe('displayNameUtils', () => {
  it('keeps unique names unchanged', () => {
    expect(generateDisplayNames([{ person_id: '1', name: 'Bob' }])[0]?.displayName).toBe('Bob')
  })

  it('labels duplicate members by synced ID within a group regardless of input order', () => {
    const members = [
      { person_id: 'person-z', group_id: 'group-z', name: 'Ana' },
      { person_id: 'person-other', group_id: 'group-a', name: 'Ana' },
      { person_id: 'person-a', group_id: 'group-z', name: 'ANA' }
    ]
    expect(generateDisplayNames(members).map((person) => person.displayName)).toEqual(['Ana (2)', 'Ana', 'ANA'])
    expect(createDisplayNameMap([...members].reverse()).get('person-z')).toBe('Ana (2)')
  })

  it('getDisplayName returns "Member" for missing people', () => {
    expect(getDisplayName('missing', people)).toBe('Member')
  })

  it('createDisplayNameMap resolves duplicate display names correctly', () => {
    expect(Array.from(createDisplayNameMap(people).entries())).toEqual([
      ['1', 'Alice'],
      ['2', 'Bob'],
      ['3', 'Alice (2)']
    ])
  })

  describe('generateGroupDisplayNames', () => {
    it('keeps unique group names unchanged', () => {
      expect(generateGroupDisplayNames([{ id: '1', name: 'Class A' }])[0]?.displayName).toBe('Class A')
    })

    it('appends stable suffixes for duplicate group names', () => {
      expect(generateGroupDisplayNames(groups).map((g) => g.displayName)).toEqual(['Class A', 'Class B', 'Class A (2)'])
    })

    it('uses creation time and synced ID before assigning suffixes, reserving saved names', () => {
      const duplicates = [
        { id: 'z-base', name: 'Ops', created_at: '2026-01-01T00:00:00Z' },
        { id: 'a-later', name: 'Ops', created_at: '2026-01-02T00:00:00Z' },
        { id: 'a-tie', name: 'OPS', created_at: '2026-01-01T08:00:00+08:00' },
        { id: 'saved-suffix', name: 'Ops (2)', created_at: '2026-01-03T00:00:00Z' }
      ]
      expect(generateGroupDisplayNames(duplicates).map((group) => group.displayName)).toEqual([
        'Ops (3)',
        'Ops (4)',
        'OPS',
        'Ops (2)'
      ])
    })
  })
})
