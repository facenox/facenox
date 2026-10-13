/**
 * Utilities for Master Recovery Key generation and validation.
 */

const UNAMBIGUOUS_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

/**
 * Generates a clean, 8-character uppercase recovery key in XXXX-XXXX format.
 * Omits easily confused characters (0, O, 1, I, L).
 */
export function generateRecoveryKey(): string {
  let part1 = ""
  let part2 = ""
  for (let i = 0; i < 4; i++) {
    part1 += UNAMBIGUOUS_CHARS.charAt(Math.floor(Math.random() * UNAMBIGUOUS_CHARS.length))
    part2 += UNAMBIGUOUS_CHARS.charAt(Math.floor(Math.random() * UNAMBIGUOUS_CHARS.length))
  }
  return `${part1}-${part2}`
}

/**
 * Normalizes a recovery key by removing whitespace, hyphens, and converting to uppercase.
 */
export function normalizeRecoveryKey(key: string): string {
  return key
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

/**
 * Compares two recovery keys in a normalized format.
 */
export function compareRecoveryKeys(input: string, target: string): boolean {
  const normInput = normalizeRecoveryKey(input)
  const normTarget = normalizeRecoveryKey(target)
  return Boolean(normInput && normTarget && normInput === normTarget)
}
